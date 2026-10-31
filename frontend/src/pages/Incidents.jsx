/**
 * Incidents.jsx
 * -------------
 * Incident management page with:
 * - Kanban board (drag-and-drop) + table view toggle
 * - Report incident modal with live scoring preview
 * - Incident details modal with history timeline and status management
 * - Severity/status filters and search
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Plus, Search, LayoutGrid, List, Trash2, AlertCircle
} from 'lucide-react';
import { incidentsApi, assetsApi, apiCache } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import Modal from '../components/Modal';
import KanbanBoard from '../components/KanbanBoard';
import SeverityPill from '../components/SeverityPill';
import StatusPill from '../components/StatusPill';
import { formatRelativeTime, formatDateTime } from '../utils/time';

// ── Scoring Logic (matches backend) ──────────────────────────────────────────
const EXPOSURE_MAP = {
  'Internal network': 1,
  'DMZ or partner-facing': 2,
  'Internet-facing': 3,
};
const DATA_MAP = { 'Public': 0, 'Internal': 1, 'Confidential': 2, 'Regulated': 3 };
const EXPLOIT_MAP = { 'No known exploit': 0, 'Public proof of concept': 1, 'Exploited in the wild': 2 };

function computeScore(form) {
  const expV    = EXPOSURE_MAP[form.exposure] ?? 1;
  const dataV   = DATA_MAP[form.data_at_risk] ?? 0;
  const exploitV = EXPLOIT_MAP[form.exploit_status] ?? 0;
  const cvss    = parseFloat(form.cvss_score);

  let score;
  if (!isNaN(cvss) && form.cvss_score !== '') {
    score = cvss;
    if (expV === 3 && exploitV === 2) score += 0.5;
  } else {
    score = 1 + expV * 1.2 + dataV * 1.3 + exploitV * 1.25;
  }
  score = Math.min(Math.round(score * 10) / 10, 10);

  let severity;
  if (score >= 9.0)      severity = 'Critical';
  else if (score >= 7.0) severity = 'High';
  else if (score >= 4.0) severity = 'Medium';
  else                   severity = 'Low';

  return { score, severity };
}

function scoreExplanation(form) {
  const cvss = parseFloat(form.cvss_score);
  if (!isNaN(cvss) && form.cvss_score !== '') {
    const bonus = EXPOSURE_MAP[form.exposure] === 3 && EXPLOIT_MAP[form.exploit_status] === 2;
    return `CVSS ${cvss}${bonus ? ' + 0.5 (Internet-facing & Exploited in wild)' : ''}`;
  }
  return `1 + ${EXPOSURE_MAP[form.exposure] ?? 1}×1.2 + ${DATA_MAP[form.data_at_risk] ?? 0}×1.3 + ${EXPLOIT_MAP[form.exploit_status] ?? 0}×1.25`;
}

const EMPTY_FORM = {
  title: '', description: '',
  asset_id: '',
  exposure: 'Internal network',
  data_at_risk: 'Public',
  exploit_status: 'No known exploit',
  cvss_score: '',
};

export default function Incidents() {
  const { isAdmin, user } = useAuth();
  const toast = useToast();

  const [incidents, setIncidents] = useState(() => apiCache.get('/incidents') || []);
  const [assets, setAssets]       = useState(() => apiCache.get('/assets') || []);
  const [loading, setLoading]     = useState(() => !apiCache.get('/incidents'));
  const [viewMode, setViewMode]   = useState('board'); // 'board' | 'table'
  const [search, setSearch]       = useState('');
  const [severityFilter, setSeverityFilter] = useState('');

  // Modals
  const [showReport, setShowReport] = useState(false);
  const [detailIncident, setDetailIncident] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  // Form
  const [form, setForm]           = useState(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving]       = useState(false);

  // Detail view
  const [noteText, setNoteText]   = useState('');
  const [addingNote, setAddingNote] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      if (!apiCache.get('/incidents')) setLoading(true);
      const [incRes, assetRes] = await Promise.all([incidentsApi.list(), assetsApi.list()]);
      setIncidents(incRes.data);
      setAssets(assetRes.data);
    } catch { toast.error('Failed to load incidents.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Filtering
  const filtered = incidents.filter((i) => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      i.title.toLowerCase().includes(q) ||
      (i.asset_name || '').toLowerCase().includes(q);
    const matchSev = !severityFilter || i.severity === severityFilter;
    return matchSearch && matchSev;
  });

  // ── Reporting ─────────────────────────────────────────────────────────────
  const openReport = (prefill = {}) => {
    setForm({ ...EMPTY_FORM, ...prefill });
    setFormErrors({});
    setShowReport(true);
  };

  const handleReport = async () => {
    const errs = {};
    if (!form.title.trim()) errs.title = 'Title is required.';
    if (Object.keys(errs).length) { setFormErrors(errs); return; }

    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description || undefined,
        asset_id: form.asset_id ? parseInt(form.asset_id) : undefined,
        exposure: form.exposure,
        data_at_risk: form.data_at_risk,
        exploit_status: form.exploit_status,
        cvss_score: form.cvss_score !== '' ? parseFloat(form.cvss_score) : undefined,
      };
      await incidentsApi.create(payload);
      toast.success('Incident reported successfully.');
      setShowReport(false);
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to report incident.');
    } finally { setSaving(false); }
  };

  // ── Status changes ─────────────────────────────────────────────────────────
  const handleStatusChange = async (incidentId, newStatus, note = '') => {
    try {
      const res = await incidentsApi.updateStatus(incidentId, { status: newStatus, note: note || undefined });
      setIncidents((prev) => prev.map((i) => i.id === incidentId ? res.data : i));
      if (detailIncident?.id === incidentId) setDetailIncident(res.data);
      toast.success(`Status updated to ${newStatus}.`);
    } catch { toast.error('Failed to update status.'); }
  };

  // ── Note ──────────────────────────────────────────────────────────────────
  const handleAddNote = async (incidentId) => {
    if (!noteText.trim()) return;
    setAddingNote(true);
    try {
      const res = await incidentsApi.addNote(incidentId, { status: detailIncident.status, note: noteText.trim() });
      setDetailIncident(res.data);
      setNoteText('');
      toast.success('Note added.');
    } catch { toast.error('Failed to add note.'); }
    finally { setAddingNote(false); }
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await incidentsApi.delete(deleteTarget.id);
      toast.success('Incident deleted.');
      setDeleteTarget(null);
      if (detailIncident?.id === deleteTarget.id) setDetailIncident(null);
      fetchAll();
    } catch { toast.error('Failed to delete incident.'); }
  };

  const { score: previewScore, severity: previewSeverity } = computeScore(form);

  return (
    <div className="space-y-5">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-sora font-700 text-xl" style={{ color: 'var(--fg)' }}>Incidents</h1>
          <p className="text-sm text-muted">{incidents.length} total · {incidents.filter(i => i.status === 'Open').length} open</p>
        </div>
        <button id="report-incident-btn" onClick={() => openReport()} className="btn btn-primary">
          <Plus size={16} /> Report incident
        </button>
      </div>

      {/* ── Toolbar ────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          <input
            id="incident-search"
            type="search"
            className="input pl-9"
            placeholder="Search title, asset…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          id="incident-severity-filter"
          className="input w-auto"
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
        >
          <option value="">All severities</option>
          {['Critical','High','Medium','Low'].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        {/* View toggle */}
        <div className="flex rounded-btn border overflow-hidden ml-auto" style={{ borderColor: 'var(--line)' }}>
          {[
            { id: 'board', icon: LayoutGrid, label: 'Board' },
            { id: 'table', icon: List, label: 'Table' },
          ].map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              id={`view-${id}`}
              onClick={() => setViewMode(id)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors"
              style={{
                background: viewMode === id ? 'var(--accent)' : 'transparent',
                color: viewMode === id ? '#fff' : 'var(--muted)',
              }}
              aria-pressed={viewMode === id}
            >
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Board / Table ────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="card p-12 text-center text-muted text-sm">Loading incidents…</div>
      ) : viewMode === 'board' ? (
        <div className="overflow-x-auto">
          <KanbanBoard
            incidents={filtered}
            onStatusChange={(id, status) => handleStatusChange(id, status)}
            onCardClick={(inc) => setDetailIncident(inc)}
          />
        </div>
      ) : (
        <IncidentTable incidents={filtered} onRowClick={setDetailIncident} />
      )}

      {/* ── Report Modal ─────────────────────────────────────────────────────── */}
      <Modal
        isOpen={showReport}
        onClose={() => setShowReport(false)}
        title="Report incident"
        wide
        footer={
          <>
            <button onClick={() => setShowReport(false)} className="btn btn-outline">Cancel</button>
            <button id="submit-incident" onClick={handleReport} disabled={saving} className="btn btn-primary">
              {saving ? 'Reporting…' : 'Report incident'}
            </button>
          </>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label htmlFor="inc-title" className="input-label">Title <span className="text-critical">*</span></label>
            <input
              id="inc-title"
              className="input"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Short, descriptive title"
            />
            {formErrors.title && <p className="input-error">{formErrors.title}</p>}
          </div>
          <div className="md:col-span-2">
            <label htmlFor="inc-desc" className="input-label">Description</label>
            <textarea
              id="inc-desc"
              className="input h-20 resize-none"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Detail what happened, how it was detected…"
            />
          </div>
          <div>
            <label htmlFor="inc-asset" className="input-label">Asset</label>
            <select
              id="inc-asset"
              className="input"
              value={form.asset_id}
              onChange={(e) => setForm({ ...form, asset_id: e.target.value })}
            >
              <option value="">— Select asset —</option>
              {assets.map((a) => <option key={a.id} value={a.id}>{a.asset_name} ({a.ip_address})</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="inc-cvss" className="input-label">CVSS score (optional)</label>
            <input
              id="inc-cvss"
              type="number"
              min="0" max="10" step="0.1"
              className="input"
              value={form.cvss_score}
              onChange={(e) => setForm({ ...form, cvss_score: e.target.value })}
              placeholder="0–10"
            />
          </div>
          <div>
            <label htmlFor="inc-exposure" className="input-label">Exposure</label>
            <select id="inc-exposure" className="input" value={form.exposure} onChange={(e) => setForm({ ...form, exposure: e.target.value })}>
              {Object.keys(EXPOSURE_MAP).map((o) => <option key={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="inc-data" className="input-label">Data at risk</label>
            <select id="inc-data" className="input" value={form.data_at_risk} onChange={(e) => setForm({ ...form, data_at_risk: e.target.value })}>
              {Object.keys(DATA_MAP).map((o) => <option key={o}>{o}</option>)}
            </select>
          </div>
          <div className="md:col-span-2">
            <label htmlFor="inc-exploit" className="input-label">Exploit status</label>
            <select id="inc-exploit" className="input" value={form.exploit_status} onChange={(e) => setForm({ ...form, exploit_status: e.target.value })}>
              {Object.keys(EXPLOIT_MAP).map((o) => <option key={o}>{o}</option>)}
            </select>
          </div>

          {/* Score preview */}
          <div className="md:col-span-2 p-3 rounded-lg" style={{ background: 'var(--surface-2)', border: '1px solid var(--line)' }}>
            <div className="flex items-center gap-3">
              <SeverityPill severity={previewSeverity} score={previewScore} />
              <span className="text-xs text-muted">{scoreExplanation(form)} = {previewScore}</span>
            </div>
          </div>
        </div>
      </Modal>

      {/* ── Delete Modal ─────────────────────────────────────────────────────── */}
      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete incident"
        footer={
          <>
            <button onClick={() => setDeleteTarget(null)} className="btn btn-outline">Cancel</button>
            <button id="confirm-delete-incident" onClick={handleDelete} className="btn btn-danger">Delete</button>
          </>
        }
      >
        <p className="text-sm">Delete incident <strong>#{deleteTarget?.id}: {deleteTarget?.title}</strong>? This cannot be undone.</p>
      </Modal>

      {/* ── Details Modal ─────────────────────────────────────────────────────── */}
      {detailIncident && (
        <IncidentDetailModal
          incident={detailIncident}
          assets={assets}
          isAdmin={isAdmin}
          onClose={() => setDetailIncident(null)}
          onStatusChange={(id, status, note) => handleStatusChange(id, status, note)}
          onDelete={(inc) => { setDeleteTarget(inc); setDetailIncident(null); }}
          noteText={noteText}
          setNoteText={setNoteText}
          onAddNote={handleAddNote}
          addingNote={addingNote}
        />
      )}
    </div>
  );
}

// ── Incident Table ─────────────────────────────────────────────────────────────
function IncidentTable({ incidents, onRowClick }) {
  if (incidents.length === 0) {
    return (
      <div className="card p-12 text-center text-muted">
        <AlertCircle size={36} className="mx-auto mb-3 opacity-30" />
        <p className="text-sm">No incidents match your filters.</p>
      </div>
    );
  }
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--line)' }}>
              {['#', 'Incident', 'Asset', 'Severity', 'Status', 'Reported'].map((h) => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {incidents.map((inc) => (
              <tr
                key={inc.id}
                onClick={() => onRowClick(inc)}
                className="border-b cursor-pointer hover:bg-surface-2 transition-colors"
                style={{ borderColor: 'var(--line)' }}
              >
                <td className="px-4 py-3 font-mono text-xs text-muted tabular-nums">#{inc.id}</td>
                <td className="px-4 py-3 max-w-[260px]">
                  <span className="font-medium hover:text-accent transition-colors line-clamp-1"
                        style={{ color: 'var(--fg)' }}>
                    {inc.title}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted">{inc.asset_name || '—'}</td>
                <td className="px-4 py-3">
                  <SeverityPill severity={inc.severity} score={inc.calculated_score} />
                </td>
                <td className="px-4 py-3">
                  <StatusPill status={inc.status} />
                </td>
                <td className="px-4 py-3 text-xs text-muted tabular-nums">
                  {formatRelativeTime(inc.created_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Incident Details Modal ─────────────────────────────────────────────────────
function IncidentDetailModal({
  incident, assets, isAdmin, onClose, onStatusChange, onDelete,
  noteText, setNoteText, onAddNote, addingNote,
}) {
  const [statusVal, setStatusVal] = useState(incident.status);

  const handleStatusChange = () => {
    if (statusVal !== incident.status) {
      onStatusChange(incident.id, statusVal);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={`Incident #${incident.id}`} wide>
      <div className="space-y-5">
        {/* Header */}
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <SeverityPill severity={incident.severity} score={incident.calculated_score} />
            <StatusPill status={incident.status} />
          </div>
          <h3 className="font-semibold text-base leading-snug" style={{ color: 'var(--fg)' }}>
            {incident.title}
          </h3>
          {incident.description && (
            <p className="text-sm text-muted mt-1.5 whitespace-pre-wrap">{incident.description}</p>
          )}
        </div>

        {/* Key-value details */}
        <div className="grid grid-cols-2 gap-2 text-sm">
          {[
            { label: 'Asset',        value: incident.asset_name || '—' },
            { label: 'Reported',     value: formatDateTime(incident.created_at) },
            { label: 'Exposure',     value: incident.exposure || '—' },
            { label: 'Data at risk', value: incident.data_at_risk || '—' },
            { label: 'Exploit',      value: incident.exploit_status || '—' },
            { label: 'Score',        value: incident.calculated_score ?? '—' },
          ].map(({ label, value }) => (
            <div key={label} className="p-2 rounded-lg" style={{ background: 'var(--surface-2)' }}>
              <div className="text-[10px] uppercase tracking-wider text-muted">{label}</div>
              <div className="font-medium mt-0.5" style={{ color: 'var(--fg)' }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Status selector */}
        <div className="flex items-center gap-3">
          <label htmlFor="detail-status" className="input-label mb-0 flex-shrink-0">Change status</label>
          <select
            id="detail-status"
            className="input flex-1"
            value={statusVal}
            onChange={(e) => setStatusVal(e.target.value)}
          >
            {['Open', 'In Progress', 'Resolved'].map((s) => <option key={s}>{s}</option>)}
          </select>
          <button
            onClick={handleStatusChange}
            disabled={statusVal === incident.status}
            className="btn btn-primary btn-sm"
          >
            Apply
          </button>
        </div>

        {/* History */}
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted mb-2">
            History ({incident.history?.length ?? 0})
          </h4>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {(incident.history || []).slice().reverse().map((h) => (
              <div key={h.id} className="flex gap-3 text-xs">
                <div className="w-1.5 flex-shrink-0">
                  <div className="w-1.5 h-1.5 rounded-full mt-1.5" style={{ background: 'var(--accent)' }} />
                </div>
                <div>
                  <span className="font-medium" style={{ color: 'var(--fg)' }}>{h.action}</span>
                  {h.note && <p className="text-muted mt-0.5">{h.note}</p>}
                  <p className="text-muted mt-0.5">
                    {h.author_name} · {formatRelativeTime(h.created_at)}
                  </p>
                </div>
              </div>
            ))}
            {(!incident.history || incident.history.length === 0) && (
              <p className="text-sm text-muted">No history yet.</p>
            )}
          </div>
        </div>

        {/* Add note */}
        <div>
          <label htmlFor="detail-note" className="input-label">Add note</label>
          <div className="flex gap-2">
            <input
              id="detail-note"
              className="input flex-1"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Add a note or update…"
              onKeyDown={(e) => e.key === 'Enter' && onAddNote(incident.id)}
            />
            <button
              onClick={() => onAddNote(incident.id)}
              disabled={!noteText.trim() || addingNote}
              className="btn btn-primary btn-sm"
            >
              {addingNote ? '…' : 'Add'}
            </button>
          </div>
        </div>

        {/* Admin: delete */}
        {isAdmin && (
          <div className="flex justify-end pt-2">
            <button onClick={() => onDelete(incident)} className="btn btn-danger btn-sm">
              <Trash2 size={13} /> Delete incident
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
