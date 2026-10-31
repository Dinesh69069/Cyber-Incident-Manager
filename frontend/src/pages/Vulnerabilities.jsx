/**
 * Vulnerabilities.jsx
 * -------------------
 * CVE vulnerability tracking page with search, severity filter,
 * CVSS-sorted table, NVD links, "Open incident" pre-fill, and Admin delete.
 */

import { useState, useEffect, useCallback } from 'react';
import { Search, Shield, Trash2, AlertTriangle, ExternalLink } from 'lucide-react';
import { vulnsApi, apiCache } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import SeverityPill from '../components/SeverityPill';
import Modal from '../components/Modal';
import { formatRelativeTime } from '../utils/time';

export default function Vulnerabilities() {
  const { isAdmin } = useAuth();
  const toast = useToast();

  const [vulns, setVulns]             = useState(() => apiCache.get('/vulnerabilities') || []);
  const [loading, setLoading]         = useState(() => !apiCache.get('/vulnerabilities'));
  const [search, setSearch]           = useState('');
  const [severityFilter, setSeverity] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);

  const fetchVulns = useCallback(async () => {
    try {
      if (!apiCache.get('/vulnerabilities')) setLoading(true);
      const res = await vulnsApi.list();
      setVulns(res.data);
    } catch { toast.error('Failed to load vulnerabilities.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchVulns(); }, [fetchVulns]);

  const filtered = vulns.filter((v) => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      v.cve_id.toLowerCase().includes(q) ||
      (v.description || '').toLowerCase().includes(q) ||
      (v.asset_name || '').toLowerCase().includes(q);
    const matchSev = !severityFilter || v.severity === severityFilter;
    return matchSearch && matchSev;
  });

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await vulnsApi.delete(deleteTarget.id);
      toast.success(`Vulnerability ${deleteTarget.cve_id} removed.`);
      setDeleteTarget(null);
      fetchVulns();
    } catch { toast.error('Failed to delete vulnerability.'); }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-sora font-700 text-xl" style={{ color: 'var(--fg)' }}>Vulnerabilities</h1>
        <p className="text-sm text-muted">{vulns.length} CVEs discovered across all assets</p>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          <input
            id="vuln-search"
            type="search"
            className="input pl-9"
            placeholder="Search CVE, description, asset…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          id="vuln-severity-filter"
          className="input w-auto"
          value={severityFilter}
          onChange={(e) => setSeverity(e.target.value)}
        >
          <option value="">All severities</option>
          {['Critical','High','Medium','Low'].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <span className="text-sm text-muted tabular-nums ml-auto">
          {filtered.length} of {vulns.length}
        </span>
      </div>

      {/* Table */}
      {loading ? (
        <div className="card p-8 text-center text-sm text-muted">Loading vulnerabilities…</div>
      ) : filtered.length === 0 ? (
        <div className="card p-12 text-center">
          <Shield size={40} className="mx-auto mb-3 opacity-30" style={{ color: 'var(--muted)' }} />
          <p className="text-sm text-muted">
            No vulnerabilities match. Run a scan to discover more.
          </p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--line)' }}>
                  {['CVE ID', 'Description', 'Severity', 'Asset / Port', 'Discovered', 'Actions'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((v) => (
                  <tr
                    key={v.id}
                    className="border-b hover:bg-surface-2 transition-colors"
                    style={{ borderColor: 'var(--line)' }}
                  >
                    <td className="px-4 py-3">
                      <a
                        href={`https://nvd.nist.gov/vuln/detail/${v.cve_id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-xs font-medium flex items-center gap-1 hover:underline"
                        style={{ color: 'var(--accent)' }}
                      >
                        {v.cve_id} <ExternalLink size={10} />
                      </a>
                    </td>
                    <td className="px-4 py-3 max-w-[300px]">
                      <span className="text-xs text-muted line-clamp-2">{v.description || '—'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <SeverityPill severity={v.severity || 'Low'} score={v.cvss_score} />
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <div className="font-medium" style={{ color: 'var(--fg)' }}>{v.asset_name || '—'}</div>
                      {v.port && (
                        <div className="text-muted font-mono">:{v.port} {v.service}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted tabular-nums">
                      {formatRelativeTime(v.discovered_at)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {isAdmin && (
                          <button
                            onClick={() => setDeleteTarget(v)}
                            className="btn btn-icon btn-danger btn-sm"
                            aria-label={`Delete ${v.cve_id}`}
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      <Modal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete vulnerability"
        footer={
          <>
            <button onClick={() => setDeleteTarget(null)} className="btn btn-outline">Cancel</button>
            <button id="confirm-delete-vuln" onClick={handleDelete} className="btn btn-danger">Delete</button>
          </>
        }
      >
        <p className="text-sm">
          Remove <strong>{deleteTarget?.cve_id}</strong> from{' '}
          <strong>{deleteTarget?.asset_name}</strong>? This action cannot be undone.
        </p>
      </Modal>
    </div>
  );
}
