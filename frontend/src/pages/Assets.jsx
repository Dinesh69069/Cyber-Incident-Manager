/**
 * Assets.jsx
 * ----------
 * Asset inventory management page with:
 * - Search, device-type filter, live count
 * - Responsive card grid with type icons, CVE/incident counts, severity pills
 * - Add/Edit modal with IPv4 validation
 * - Details modal with vulnerabilities and incidents
 * - Scan button (Premium-gated)
 * - Delete with confirmation (Admin only)
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Plus, Search, Server, Database, Wifi, Monitor, Cpu, Cloud,
  Edit, Trash2, Eye, Zap, Shield, AlertTriangle
} from 'lucide-react';
import { assetsApi, apiCache } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import Modal from '../components/Modal';
import SeverityPill from '../components/SeverityPill';
import { formatRelativeTime } from '../utils/time';

const DEVICE_TYPES = ['Server', 'Database', 'Network', 'Workstation', 'IoT', 'Cloud'];

const DEVICE_ICONS = {
  Server:      Server,
  Database:    Database,
  Network:     Wifi,
  Workstation: Monitor,
  IoT:         Cpu,
  Cloud:       Cloud,
};

function validateIPv4(ip) {
  const parts = ip.split('.');
  if (parts.length !== 4) return 'IP must have 4 octets.';
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return 'Each octet must be numeric.';
    if (part !== String(parseInt(part, 10))) return 'Octets cannot have leading zeros.';
    const n = parseInt(part, 10);
    if (n < 0 || n > 255) return 'Each octet must be 0–255.';
  }
  return null;
}

export default function Assets() {
  const { isAdmin, isPremium, user } = useAuth();
  const toast = useToast();

  const [assets, setAssets]         = useState(() => apiCache.get('/assets') || []);
  const [loading, setLoading]        = useState(() => !apiCache.get('/assets'));
  const [search, setSearch]          = useState('');
  const [typeFilter, setTypeFilter]  = useState('');

  // Modals
  const [showAdd, setShowAdd]         = useState(false);
  const [editAsset, setEditAsset]     = useState(null);
  const [detailAsset, setDetailAsset] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [scanResult, setScanResult]   = useState(null);

  // Form state
  const [form, setForm] = useState({ asset_name: '', ip_address: '', device_type: 'Server', owner_id: '' });
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(null);

  const fetchAssets = useCallback(async () => {
    try {
      if (!apiCache.get('/assets')) setLoading(true);
      const res = await assetsApi.list();
      setAssets(res.data);
    } catch (err) {
      toast.error('Failed to load assets.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAssets(); }, [fetchAssets]);

  // Filtering
  const filtered = assets.filter((a) => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      a.asset_name.toLowerCase().includes(q) ||
      a.ip_address.includes(q) ||
      (a.owner_email || '').toLowerCase().includes(q);
    const matchType = !typeFilter || a.device_type === typeFilter;
    return matchSearch && matchType;
  });

  // ── Form helpers ─────────────────────────────────────────────────────────
  const openAdd = () => {
    setForm({ asset_name: '', ip_address: '', device_type: 'Server', owner_id: '' });
    setFormErrors({});
    setShowAdd(true);
  };

  const openEdit = (asset) => {
    setForm({
      asset_name: asset.asset_name,
      ip_address: asset.ip_address,
      device_type: asset.device_type,
      owner_id: asset.owner_id,
    });
    setFormErrors({});
    setEditAsset(asset);
  };

  const validateForm = (existingId = null) => {
    const errs = {};
    if (!form.asset_name.trim()) errs.asset_name = 'Name is required.';
    if (form.asset_name.length > 60) errs.asset_name = 'Name max 60 characters.';
    const ipErr = validateIPv4(form.ip_address);
    if (ipErr) {
      errs.ip_address = ipErr;
    } else {
      // Duplicate IP check
      const dup = assets.find((a) => a.ip_address === form.ip_address && a.id !== existingId);
      if (dup) errs.ip_address = `IP already in use by "${dup.asset_name}".`;
    }
    if (!DEVICE_TYPES.includes(form.device_type)) errs.device_type = 'Select a valid device type.';
    return errs;
  };

  const handleSave = async () => {
    const errs = validateForm(editAsset?.id);
    if (Object.keys(errs).length) { setFormErrors(errs); return; }

    setSaving(true);
    try {
      const payload = {
        asset_name: form.asset_name.trim(),
        ip_address: form.ip_address.trim(),
        device_type: form.device_type,
        owner_id: form.owner_id ? parseInt(form.owner_id) : undefined,
      };
      if (editAsset) {
        await assetsApi.update(editAsset.id, payload);
        toast.success('Asset updated.');
      } else {
        await assetsApi.create(payload);
        toast.success('Asset added to inventory.');
      }
      setShowAdd(false);
      setEditAsset(null);
      fetchAssets();
    } catch (err) {
      const detail = err.response?.data?.detail;
      toast.error(detail || 'Failed to save asset.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await assetsApi.delete(deleteTarget.id);
      toast.success(`Asset "${deleteTarget.asset_name}" deleted.`);
      setDeleteTarget(null);
      fetchAssets();
      if (detailAsset?.id === deleteTarget.id) setDetailAsset(null);
    } catch (err) {
      toast.error('Failed to delete asset.');
    }
  };

  const handleScan = async (asset) => {
    if (!isPremium) {
      toast.error('Premium subscription required to run scans.');
      return;
    }
    setScanning(asset.id);
    setScanResult(null);
    try {
      const res = await assetsApi.scan(asset.id);
      setScanResult(res.data);
      toast.success(`Scan complete: ${res.data.open_ports} open ports, ${res.data.total_cves} CVEs found.`);
      fetchAssets();
    } catch (err) {
      const detail = err.response?.data?.detail;
      toast.error(detail || 'Scan failed.');
    } finally {
      setScanning(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-sora font-700 text-xl" style={{ color: 'var(--fg)' }}>Assets</h1>
          <p className="text-sm text-muted">Monitored network inventory</p>
        </div>
        <button id="add-asset-btn" onClick={openAdd} className="btn btn-primary">
          <Plus size={16} /> Add asset
        </button>
      </div>

      {/* ── Toolbar ────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          <input
            id="asset-search"
            type="search"
            className="input pl-9"
            placeholder="Search name, IP, owner…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search assets"
          />
        </div>
        <select
          id="asset-type-filter"
          className="input w-auto"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          aria-label="Filter by device type"
        >
          <option value="">All types</option>
          {DEVICE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <span className="text-sm text-muted tabular-nums">
          {filtered.length} of {assets.length} assets
        </span>
      </div>

      {/* ── Grid ───────────────────────────────────────────────────────────── */}
      {loading ? (
        <AssetGridSkeleton />
      ) : filtered.length === 0 ? (
        <div className="card p-12 text-center text-muted">
          <Server size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No assets match your filters. Add one to get started.</p>
        </div>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))' }}>
          {filtered.map((asset) => (
            <AssetCard
              key={asset.id}
              asset={asset}
              isAdmin={isAdmin}
              isPremium={isPremium}
              scanning={scanning === asset.id}
              onEdit={() => openEdit(asset)}
              onDelete={() => setDeleteTarget(asset)}
              onDetails={() => setDetailAsset(asset)}
              onScan={() => handleScan(asset)}
            />
          ))}
        </div>
      )}

      {/* ── Add / Edit Modal ────────────────────────────────────────────────── */}
      <Modal
        isOpen={showAdd || !!editAsset}
        onClose={() => { setShowAdd(false); setEditAsset(null); }}
        title={editAsset ? `Edit: ${editAsset.asset_name}` : 'Add asset'}
        footer={
          <>
            <button onClick={() => { setShowAdd(false); setEditAsset(null); }} className="btn btn-outline">Cancel</button>
            <button id="save-asset-btn" onClick={handleSave} disabled={saving} className="btn btn-primary">
              {saving ? 'Saving…' : editAsset ? 'Save changes' : 'Add asset'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="form-name" className="input-label">Asset name <span className="text-critical">*</span></label>
            <input
              id="form-name"
              className="input"
              value={form.asset_name}
              onChange={(e) => setForm({ ...form, asset_name: e.target.value })}
              maxLength={60}
              placeholder="e.g. web-prod-01"
            />
            {formErrors.asset_name && <p className="input-error">{formErrors.asset_name}</p>}
          </div>
          <div>
            <label htmlFor="form-ip" className="input-label">IPv4 address <span className="text-critical">*</span></label>
            <input
              id="form-ip"
              className="input font-mono"
              value={form.ip_address}
              onChange={(e) => setForm({ ...form, ip_address: e.target.value })}
              placeholder="10.20.4.11"
            />
            {formErrors.ip_address && <p className="input-error">{formErrors.ip_address}</p>}
          </div>
          <div>
            <label htmlFor="form-type" className="input-label">Device type <span className="text-critical">*</span></label>
            <select
              id="form-type"
              className="input"
              value={form.device_type}
              onChange={(e) => setForm({ ...form, device_type: e.target.value })}
            >
              {DEVICE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            {formErrors.device_type && <p className="input-error">{formErrors.device_type}</p>}
          </div>
          {isAdmin && (
            <div>
              <label htmlFor="form-owner" className="input-label">Owner user ID (Admin: leave blank for self)</label>
              <input
                id="form-owner"
                type="number"
                className="input"
                value={form.owner_id}
                onChange={(e) => setForm({ ...form, owner_id: e.target.value })}
                placeholder="User ID"
              />
            </div>
          )}
        </div>
      </Modal>

      {/* ── Delete Confirm Modal ─────────────────────────────────────────────── */}
      <Modal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete asset"
        footer={
          <>
            <button onClick={() => setDeleteTarget(null)} className="btn btn-outline">Cancel</button>
            <button id="confirm-delete-asset" onClick={handleDelete} className="btn btn-danger">Delete</button>
          </>
        }
      >
        <p className="text-sm" style={{ color: 'var(--fg)' }}>
          Are you sure you want to delete <strong>{deleteTarget?.asset_name}</strong>?
          All associated vulnerabilities and incidents will also be removed. This cannot be undone.
        </p>
      </Modal>

      {/* ── Details Modal ───────────────────────────────────────────────────── */}
      {detailAsset && (
        <AssetDetailModal
          asset={detailAsset}
          onClose={() => setDetailAsset(null)}
          onScan={() => handleScan(detailAsset)}
          isPremium={isPremium}
          scanning={scanning === detailAsset.id}
        />
      )}
    </div>
  );
}

// ── Asset Card ─────────────────────────────────────────────────────────────────
function AssetCard({ asset, isAdmin, isPremium, scanning, onEdit, onDelete, onDetails, onScan }) {
  const Icon = DEVICE_ICONS[asset.device_type] || Server;

  return (
    <div className="card p-4 flex flex-col gap-3 hover:shadow-lg transition-shadow">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
             style={{ background: 'var(--accent-soft)' }}>
          <Icon size={20} style={{ color: 'var(--accent)' }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm truncate" style={{ color: 'var(--fg)' }}>
            {asset.asset_name}
          </div>
          <div className="font-mono text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
            {asset.ip_address}
          </div>
        </div>
      </div>

      {/* Chips */}
      <div className="flex flex-wrap gap-1.5">
        <span className="chip">{asset.device_type}</span>
        <span className="chip">
          <Shield size={10} /> {asset.cve_count} CVEs
        </span>
        <span className="chip">
          <AlertTriangle size={10} /> {asset.open_incident_count} open
        </span>
        {asset.highest_severity ? (
          <SeverityPill severity={asset.highest_severity} score={asset.max_cvss} />
        ) : (
          <span className="chip" style={{ background: 'var(--ok-soft)', color: 'var(--ok)', borderColor: 'var(--ok)' }}>
            ✓ No findings
          </span>
        )}
      </div>

      {/* Owner */}
      <div className="text-xs text-muted truncate">Owner: {asset.owner_name || 'Unknown'}</div>

      {/* Actions */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={onDetails} className="btn btn-outline btn-sm flex-1">
          <Eye size={13} /> Details
        </button>
        <button
          onClick={onScan}
          disabled={scanning || !isPremium}
          className="btn btn-sm flex-1"
          style={isPremium ? { background: 'var(--accent-soft)', color: 'var(--accent)' } : {}}
          title={!isPremium ? 'Upgrade to Premium to scan' : ''}
        >
          <Zap size={13} />
          {scanning ? 'Scanning…' : isPremium ? 'Scan' : '🔒 Scan'}
        </button>
        <button onClick={onEdit} className="btn btn-icon btn-ghost" aria-label="Edit asset">
          <Edit size={14} />
        </button>
        {isAdmin && (
          <button onClick={onDelete} className="btn btn-icon btn-danger" aria-label="Delete asset">
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

// ── Asset Details Modal ─────────────────────────────────────────────────────────
function AssetDetailModal({ asset, onClose, onScan, isPremium, scanning }) {
  const [vulns, setVulns]   = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    assetsApi.vulns(asset.id)
      .then((r) => setVulns(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [asset.id]);

  const KV = ({ label, value }) => (
    <div className="flex gap-4 py-1.5 border-b last:border-0 text-sm" style={{ borderColor: 'var(--line)' }}>
      <span className="text-muted w-28 flex-shrink-0">{label}</span>
      <span style={{ color: 'var(--fg)' }} className="font-mono">{value}</span>
    </div>
  );

  return (
    <Modal isOpen onClose={onClose} title={`Asset: ${asset.asset_name}`} wide
      footer={
        <button
          onClick={onScan}
          disabled={scanning || !isPremium}
          className="btn btn-primary"
        >
          <Zap size={14} /> {scanning ? 'Scanning…' : 'Scan this asset'}
        </button>
      }
    >
      <div className="space-y-5">
        <div>
          <KV label="Name"    value={asset.asset_name} />
          <KV label="IP"      value={asset.ip_address} />
          <KV label="Type"    value={asset.device_type} />
          <KV label="Owner"   value={asset.owner_name || '—'} />
          <KV label="Added"   value={formatRelativeTime(asset.created_at)} />
        </div>

        <div>
          <h4 className="font-semibold text-xs uppercase tracking-wider text-muted mb-2">
            Vulnerabilities ({asset.cve_count})
          </h4>
          {loading ? (
            <p className="text-sm text-muted">Loading…</p>
          ) : vulns.length === 0 ? (
            <p className="text-sm text-muted">No vulnerabilities discovered yet.</p>
          ) : (
            <div className="space-y-2 max-h-52 overflow-y-auto">
              {vulns.map((v) => (
                <div key={v.id} className="flex items-start gap-3 p-2.5 rounded-lg text-xs"
                     style={{ background: 'var(--surface-2)' }}>
                  <span className="font-mono font-medium" style={{ color: 'var(--accent)' }}>
                    {v.cve_id}
                  </span>
                  <span className="flex-1 text-muted">{v.description}</span>
                  <SeverityPill severity={v.severity} score={v.cvss_score} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

function AssetGridSkeleton() {
  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))' }}>
      {[...Array(6)].map((_, i) => (
        <div key={i} className="card p-4 space-y-3 animate-pulse">
          <div className="flex gap-3">
            <div className="w-10 h-10 rounded-xl" style={{ background: 'var(--line)' }} />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-32 rounded" style={{ background: 'var(--line)' }} />
              <div className="h-2.5 w-24 rounded" style={{ background: 'var(--line)' }} />
            </div>
          </div>
          <div className="flex gap-2">
            {[60, 50, 70].map((w) => (
              <div key={w} className="h-5 rounded-full" style={{ background: 'var(--line)', width: w }} />
            ))}
          </div>
          <div className="h-2.5 w-40 rounded" style={{ background: 'var(--line)' }} />
          <div className="flex gap-2">
            <div className="h-8 flex-1 rounded-lg" style={{ background: 'var(--line)' }} />
            <div className="h-8 flex-1 rounded-lg" style={{ background: 'var(--line)' }} />
          </div>
        </div>
      ))}
    </div>
  );
}
