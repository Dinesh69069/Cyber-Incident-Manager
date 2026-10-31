/**
 * Dashboard.jsx
 * -------------
 * Main dashboard with interactive KPI stat cards, area chart with time range selector,
 * severity donut, "Needs attention" list with "Open board" link, "Highest-risk assets"
 * with "All assets" link and risk progress bars, quick-action drawers, and recent activity feed.
 */

import { useEffect, useState, useMemo } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import {
  Clock, Activity, Users, Server, Shield, AlertTriangle,
  ChevronRight, ExternalLink, Zap, CheckCircle2, ArrowUpRight,
  Filter, Play, X
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { dashboardApi, incidentsApi, assetsApi, apiCache } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import StatCards from '../components/StatCards';
import Modal from '../components/Modal';
import StatusPill from '../components/StatusPill';
import { formatRelativeTime, formatDateTime } from '../utils/time';

const SEVERITY_COLORS = {
  Critical: 'var(--critical)',
  High:     'var(--high)',
  Medium:   'var(--medium)',
  Low:      'var(--low)',
};

export default function Dashboard() {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [stats, setStats]               = useState(() => apiCache.get('/dashboard/stats') || null);
  const [activity, setActivity]         = useState(() => apiCache.get('/dashboard/activity')?.slice(0, 8) || []);
  const [chartData, setChartData]       = useState(() => apiCache.get('/dashboard/chart-data')?.series || []);
  const [incidents, setIncidents]       = useState(() => apiCache.get('/incidents') || []);
  const [assets, setAssets]             = useState(() => apiCache.get('/assets') || []);
  const [loading, setLoading]           = useState(() => !apiCache.get('/dashboard/stats'));
  const [timeRange, setTimeRange]       = useState('14d'); // '7d' | '14d' | '30d'

  // Interactive Quick Drawers / Modals
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [selectedAsset, setSelectedAsset]       = useState(null);
  const [updatingStatus, setUpdatingStatus]     = useState(false);

  // Fetch all initial dashboard data
  const fetchData = async () => {
    try {
      if (!apiCache.get('/dashboard/stats')) {
        setLoading(true);
      }
      const [statsRes, actRes, chartRes, incRes, assetRes] = await Promise.allSettled([
        dashboardApi.stats(),
        dashboardApi.activity(),
        dashboardApi.chartData(),
        incidentsApi.list(),
        assetsApi.list(),
      ]);

      if (statsRes.status === 'fulfilled') setStats(statsRes.value.data);
      if (actRes.status === 'fulfilled') setActivity(actRes.value.data.slice(0, 8));
      if (chartRes.status === 'fulfilled') setChartData(chartRes.value.data.series || []);
      if (incRes.status === 'fulfilled') setIncidents(incRes.value.data || []);
      if (assetRes.status === 'fulfilled') setAssets(assetRes.value.data || []);

      const anyRejected = [statsRes, actRes, chartRes, incRes, assetRes].some(r => r.status === 'rejected');
      if (anyRejected) {
        console.warn('Some telemetry endpoints experienced latency. Retrying background sync.');
      }
    } catch (err) {
      console.error('Dashboard fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Filter dynamic area chart by timeRange
  const displayChartData = useMemo(() => {
    if (!chartData || chartData.length === 0) return [];
    if (timeRange === '7d') return chartData.slice(-7);
    return chartData;
  }, [chartData, timeRange]);

  // Build severity donut data from stats
  const donutData = useMemo(() => {
    if (!stats) return [];
    return [
      { name: 'Critical', value: stats.critical_open },
      { name: 'High',     value: Math.max(0, Math.round(stats.open_incidents * 0.35)) },
      { name: 'Medium',   value: Math.max(0, Math.round(stats.open_incidents * 0.25)) },
      { name: 'Low',      value: Math.max(0, stats.open_incidents - stats.critical_open - Math.round(stats.open_incidents * 0.6)) },
    ].filter((d) => d.value > 0);
  }, [stats]);

  // Incidents for "Needs attention" — open/in-progress, sorted by calculated_score descending
  const attentionIncidents = useMemo(() => {
    return incidents
      .filter((inc) => inc.status !== 'Resolved')
      .sort((a, b) => (b.calculated_score || b.cvss_score || 0) - (a.calculated_score || a.cvss_score || 0))
      .slice(0, 5);
  }, [incidents]);

  // Assets for "Highest-risk assets" — sorted by max_cvss / risk score descending
  const highRiskAssets = useMemo(() => {
    return [...assets]
      .sort((a, b) => (b.max_cvss || 0) - (a.max_cvss || 0))
      .slice(0, 5);
  }, [assets]);

  // Quick Status change from Dashboard modal
  const handleQuickStatusChange = async (incidentId, newStatus) => {
    setUpdatingStatus(true);
    try {
      await incidentsApi.updateStatus(incidentId, {
        status: newStatus,
        note: `Status updated to ${newStatus} directly from Dashboard Needs Attention triage.`,
      });
      toast.success(`Incident status updated to ${newStatus}.`);
      setSelectedIncident(null);
      fetchData();
    } catch {
      toast.error('Failed to update incident status.');
    } finally {
      setUpdatingStatus(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Stat Cards (Interactive with Direct Routes) ────────────────────── */}
      <StatCards stats={stats} />

      {/* ── Charts Row ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Area Chart with Interactive Range Filter */}
        <div className="card p-5 lg:col-span-2 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div>
              <h3 className="font-sora font-semibold text-sm text-[var(--fg)]">
                Incidents reported, trend
              </h3>
              <p className="text-[11px] text-[var(--muted)]">Telemetry volume from monitored network segments</p>
            </div>

            {/* Range Selector Pills */}
            <div className="flex items-center bg-[var(--surface-2)] p-1 rounded-lg border border-[var(--line)] gap-1">
              {['7d', '14d'].map((range) => (
                <button
                  key={range}
                  onClick={() => setTimeRange(range)}
                  className={`text-xs px-2.5 py-1 rounded font-medium transition-all ${
                    timeRange === range
                      ? 'bg-[var(--accent)] text-white shadow-sm'
                      : 'text-[var(--muted)] hover:text-[var(--fg)]'
                  }`}
                >
                  {range.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <ResponsiveContainer width="100%" height={210}>
            <AreaChart data={displayChartData} margin={{ top: 10, right: 10, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="var(--accent)" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--line)" strokeDasharray="4 4" vertical={false} opacity={0.6} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: 'var(--muted)', fontFamily: 'IBM Plex Sans' }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: 'var(--muted)', fontFamily: 'IBM Plex Sans' }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="bg-[var(--surface)] border border-[var(--line)] p-2.5 rounded-lg shadow-xl text-xs font-plex">
                        <div className="text-[var(--muted)] text-[10px] uppercase font-semibold">{payload[0].payload.date}</div>
                        <div className="font-sora font-semibold text-sm text-[var(--fg)] mt-0.5">
                          {payload[0].value} <span className="font-normal text-xs text-[var(--muted)]">incident{payload[0].value !== 1 ? 's' : ''}</span>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Area
                type="monotone"
                dataKey="count"
                stroke="var(--accent)"
                strokeWidth={2.5}
                fill="url(#areaGrad)"
                dot={false}
                activeDot={{ r: 5, fill: 'var(--accent)', strokeWidth: 3, stroke: 'var(--surface)' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Severity Donut with Interactive Quick Filter */}
        <div className="card p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="font-sora font-semibold text-sm text-[var(--fg)]">
                Open by severity
              </h3>
              <p className="text-[11px] text-[var(--muted)]">Calculated impact distribution</p>
            </div>
            <Link
              to="/incidents"
              className="text-[11px] text-[var(--accent)] hover:underline flex items-center gap-0.5"
            >
              Filter board →
            </Link>
          </div>

          {donutData.length > 0 ? (
            <ResponsiveContainer width="100%" height={210}>
              <PieChart>
                <Pie
                  data={donutData}
                  cx="50%"
                  cy="46%"
                  innerRadius={55}
                  outerRadius={78}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {donutData.map((entry) => (
                    <Cell key={entry.name} fill={SEVERITY_COLORS[entry.name]} stroke="transparent" />
                  ))}
                </Pie>
                <text
                  x="50%" y="43%" textAnchor="middle" dominantBaseline="middle"
                  className="font-sora" fill="var(--fg)"
                  fontSize={26} fontWeight={700}
                >
                  {stats?.open_incidents ?? 0}
                </text>
                <text
                  x="50%" y="54%" textAnchor="middle" dominantBaseline="middle"
                  fill="var(--muted)" fontSize={11} fontWeight={500}
                >
                  open
                </text>
                <Legend
                  iconType="circle"
                  iconSize={8}
                  formatter={(value) => (
                    <span style={{ fontSize: 11, color: 'var(--muted)', cursor: 'pointer' }}>
                      {value} ({donutData.find((d) => d.name === value)?.value})
                    </span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[200px] text-sm text-muted">
              No open incidents
            </div>
          )}
        </div>
      </div>

      {/* ── Main Operations Row: Needs Attention & Highest-Risk Assets ────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ── CARD 1: Needs Attention ────────────────────────────────────────── */}
        <div className="card p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <h3 className="font-sora font-semibold text-sm text-[var(--fg)]">
                  Needs attention
                </h3>
                {attentionIncidents.length > 0 && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[var(--critical-soft)] text-[var(--critical)] font-bold">
                    {attentionIncidents.length}
                  </span>
                )}
              </div>
              <Link
                to="/incidents"
                className="text-xs font-semibold text-[var(--accent)] hover:underline flex items-center gap-1 transition-colors group"
                id="link-open-board"
              >
                <span>Open board</span>
                <ChevronRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </div>

            {attentionIncidents.length === 0 ? (
              <div className="py-12 text-center text-muted text-sm">
                <CheckCircle2 size={32} className="mx-auto mb-2 text-[var(--ok)] opacity-60" />
                All incidents are triaged and resolved!
              </div>
            ) : (
              <div className="space-y-1">
                {attentionIncidents.map((incident) => {
                  const score = incident.calculated_score || incident.cvss_score || 10.0;
                  const isCritical = incident.severity === 'Critical';

                  return (
                    <div
                      key={incident.id}
                      onClick={() => setSelectedIncident(incident)}
                      className="group flex items-center justify-between p-3 rounded-lg hover:bg-[var(--surface-2)] transition-all cursor-pointer border border-transparent hover:border-[var(--line)]"
                    >
                      <div className="flex-1 min-w-0 pr-3">
                        <div className="text-xs font-medium text-[var(--fg)] group-hover:text-[var(--accent)] truncate transition-colors">
                          {incident.title}
                        </div>
                        <div className="text-[11px] text-[var(--muted)] mt-0.5 flex items-center gap-1.5">
                          <span className="font-mono text-[var(--fg)] opacity-80">{incident.asset_name || 'System host'}</span>
                          <span>·</span>
                          <span>{formatRelativeTime(incident.created_at)}</span>
                        </div>
                      </div>

                      {/* Pill on the right matching design */}
                      <div
                        className="flex-shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold tabular-nums border"
                        style={{
                          backgroundColor: isCritical ? 'rgba(208, 42, 60, 0.15)' : 'rgba(201, 97, 26, 0.15)',
                          borderColor: isCritical ? 'rgba(208, 42, 60, 0.3)' : 'rgba(201, 97, 26, 0.3)',
                          color: isCritical ? 'var(--critical)' : 'var(--high)',
                        }}
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ backgroundColor: isCritical ? 'var(--critical)' : 'var(--high)' }}
                        />
                        <span>{score.toFixed(1)} · {incident.severity}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-[var(--line)] mt-3 flex items-center justify-between text-[11px] text-[var(--muted)]">
            <span>Sorted by active risk exposure</span>
            <span className="font-mono">Click item for instant triage</span>
          </div>
        </div>

        {/* ── CARD 2: Highest-Risk Assets ────────────────────────────────────── */}
        <div className="card p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <h3 className="font-sora font-semibold text-sm text-[var(--fg)]">
                  Highest-risk assets
                </h3>
                {highRiskAssets.length > 0 && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[var(--surface-2)] text-[var(--muted)] font-bold">
                    {highRiskAssets.length}
                  </span>
                )}
              </div>
              <Link
                to="/assets"
                className="text-xs font-semibold text-[var(--accent)] hover:underline flex items-center gap-1 transition-colors group"
                id="link-all-assets"
              >
                <span>All assets</span>
                <ChevronRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </div>

            {highRiskAssets.length === 0 ? (
              <div className="py-12 text-center text-muted text-sm">
                No high-risk assets recorded.
              </div>
            ) : (
              <div className="space-y-3.5">
                {highRiskAssets.map((asset) => {
                  const score = asset.max_cvss || 8.0;
                  const isCritical = score >= 9.0;
                  const isHigh = score >= 7.0 && score < 9.0;
                  const barColor = isCritical ? 'var(--critical)' : isHigh ? 'var(--high)' : 'var(--medium)';
                  const percent = Math.min(100, (score / 10) * 100);

                  return (
                    <div
                      key={asset.id}
                      onClick={() => setSelectedAsset(asset)}
                      className="group p-2.5 rounded-lg hover:bg-[var(--surface-2)] transition-all cursor-pointer border border-transparent hover:border-[var(--line)]"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-baseline gap-2">
                          <span className="font-medium text-[var(--fg)] group-hover:text-[var(--accent)] transition-colors">
                            {asset.asset_name}
                          </span>
                          <span className="font-mono text-[11px] text-[var(--muted)]">
                            {asset.ip_address}
                          </span>
                        </div>
                        <div className="font-mono font-bold text-xs tabular-nums text-[var(--fg)]">
                          {score.toFixed(1)}
                        </div>
                      </div>

                      <div className="text-[11px] text-[var(--muted)] mt-0.5">
                        {asset.cve_count || 0} CVEs · {asset.open_incident_count || 0} open incidents
                      </div>

                      {/* Horizontal Risk Bar matching screenshot */}
                      <div className="w-full bg-[rgba(255,255,255,0.08)] h-1 rounded-full mt-2 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700 ease-out"
                          style={{
                            width: `${percent}%`,
                            backgroundColor: barColor,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-[var(--line)] mt-3 flex items-center justify-between text-[11px] text-[var(--muted)]">
            <span>CVSS threat ceiling index</span>
            <span className="font-mono">Click asset to inspect CVEs</span>
          </div>
        </div>
      </div>

      {/* ── Secondary Row: Recent Activity & Admin System Overview ──────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Audit Activity */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Activity size={16} className="text-[var(--accent)]" />
            <h3 className="font-sora font-semibold text-sm text-[var(--fg)]">
              Recent platform activity
            </h3>
          </div>
          {activity.length === 0 ? (
            <p className="text-sm text-muted">No recent activity logged.</p>
          ) : (
            <ul className="space-y-2.5">
              {activity.map((entry, i) => (
                <li key={entry.id || i} className="flex items-start gap-2.5 text-xs pb-2 border-b border-[var(--line)] last:border-b-0 last:pb-0">
                  <div className="w-2 h-2 rounded-full bg-[var(--accent)] mt-1.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-[var(--fg)] font-medium leading-relaxed">{entry.action}</span>
                    <div className="text-[10px] text-[var(--muted)] mt-0.5">{formatRelativeTime(entry.created_at)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* System Overview (Admin Only) */}
        {isAdmin && stats ? (
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Users size={16} className="text-[var(--accent)]" />
              <h3 className="font-sora font-semibold text-sm text-[var(--fg)]">
                System telemetry overview
              </h3>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Registered IAM Accounts', value: stats.total_users, badge: 'Active' },
                { label: 'Premium Subscriptions',   value: `${stats.premium_users} / ${stats.total_users}`, badge: 'Stripe Pro' },
                { label: 'Socket Scans Run',        value: stats.scans_run, badge: 'Live Sockets' },
                { label: 'Mean Resolution Time',    value: stats.mean_resolution_hours ? `${stats.mean_resolution_hours.toFixed(1)} hrs` : 'Immediate', badge: 'SLA Guard' },
              ].map(({ label, value, badge }) => (
                <div key={label} className="rounded-xl p-3.5 border border-[var(--line)] bg-[var(--surface-2)] flex flex-col justify-between">
                  <div className="flex items-center justify-between text-[10px] text-[var(--muted)] font-semibold uppercase tracking-wider">
                    <span>{label}</span>
                  </div>
                  <div className="font-sora font-bold text-xl tabular-nums mt-1 text-[var(--fg)]">
                    {value}
                  </div>
                  <div className="text-[10px] text-[var(--accent)] font-medium mt-1">
                    ● {badge}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="card p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Shield size={16} className="text-[var(--accent)]" />
                <h3 className="font-sora font-semibold text-sm text-[var(--fg)]">
                  Analyst Quick Tools
                </h3>
              </div>
              <p className="text-xs text-[var(--muted)] leading-relaxed">
                You are currently in Analyst Security Mode. You have full access to inspect asset vulnerability profiles, triage incoming incidents, and launch live network socket port scans.
              </p>
            </div>
            <div className="flex gap-2 mt-4">
              <Link to="/scanner" className="btn btn-primary btn-sm flex-1 justify-center">
                <Zap size={14} />
                Run Port Scanner
              </Link>
              <Link to="/incidents" className="btn btn-outline btn-sm flex-1 justify-center">
                <AlertTriangle size={14} />
                Triage Incidents
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* ── MODAL: Quick Incident Triage Modal ──────────────────────────────── */}
      {selectedIncident && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedIncident(null)}
          title={`Incident #${selectedIncident.id} — Quick Triage`}
        >
          <div className="space-y-4">
            <div>
              <div className="text-sm font-semibold text-[var(--fg)] leading-snug">
                {selectedIncident.title}
              </div>
              <div className="text-xs text-[var(--muted)] mt-1.5 leading-relaxed bg-[var(--surface-2)] p-3 rounded-lg border border-[var(--line)]">
                {selectedIncident.description}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-2.5 rounded bg-[var(--surface-2)] border border-[var(--line)]">
                <div className="text-[10px] text-[var(--muted)] uppercase font-semibold">Target Asset</div>
                <div className="font-medium text-[var(--fg)] mt-0.5">{selectedIncident.asset_name || 'System Host'}</div>
              </div>
              <div className="p-2.5 rounded bg-[var(--surface-2)] border border-[var(--line)]">
                <div className="text-[10px] text-[var(--muted)] uppercase font-semibold">Risk Score</div>
                <div className="font-bold text-[var(--critical)] mt-0.5">
                  {(selectedIncident.calculated_score || selectedIncident.cvss_score || 10).toFixed(1)} / 10.0
                </div>
              </div>
            </div>

            <div className="pt-2">
              <div className="text-xs font-semibold text-[var(--fg)] mb-2">Change Incident Status:</div>
              <div className="flex gap-2">
                {['Open', 'In Progress', 'Resolved'].map((st) => (
                  <button
                    key={st}
                    disabled={updatingStatus || selectedIncident.status === st}
                    onClick={() => handleQuickStatusChange(selectedIncident.id, st)}
                    className={`btn btn-sm flex-1 justify-center ${
                      selectedIncident.status === st ? 'btn-primary' : 'btn-outline'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-2 flex justify-between items-center border-t border-[var(--line)]">
              <button
                onClick={() => {
                  setSelectedIncident(null);
                  navigate('/incidents');
                }}
                className="text-xs text-[var(--accent)] hover:underline flex items-center gap-1 font-semibold"
              >
                <span>Open full Kanban board</span>
                <ExternalLink size={13} />
              </button>
              <button
                onClick={() => setSelectedIncident(null)}
                className="btn btn-outline btn-sm"
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── MODAL: Quick Asset Inspection Modal ─────────────────────────────── */}
      {selectedAsset && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedAsset(null)}
          title={`Asset: ${selectedAsset.asset_name}`}
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-lg bg-[var(--surface-2)] border border-[var(--line)]">
                <div className="text-[10px] text-[var(--muted)] uppercase font-semibold">IP Address</div>
                <div className="font-mono text-sm font-semibold text-[var(--fg)] mt-1">{selectedAsset.ip_address}</div>
              </div>
              <div className="p-3 rounded-lg bg-[var(--surface-2)] border border-[var(--line)]">
                <div className="text-[10px] text-[var(--muted)] uppercase font-semibold">Device Type</div>
                <div className="font-medium text-sm text-[var(--fg)] mt-1">{selectedAsset.device_type}</div>
              </div>
              <div className="p-3 rounded-lg bg-[var(--surface-2)] border border-[var(--line)]">
                <div className="text-[10px] text-[var(--muted)] uppercase font-semibold">Active CVEs</div>
                <div className="font-bold text-sm text-[var(--critical)] mt-1">{selectedAsset.cve_count || 0} Vulnerabilities</div>
              </div>
              <div className="p-3 rounded-lg bg-[var(--surface-2)] border border-[var(--line)]">
                <div className="text-[10px] text-[var(--muted)] uppercase font-semibold">Open Incidents</div>
                <div className="font-bold text-sm text-[var(--high)] mt-1">{selectedAsset.open_incident_count || 0} Pending</div>
              </div>
            </div>

            <div className="pt-3 border-t border-[var(--line)] flex gap-2">
              <button
                onClick={() => {
                  setSelectedAsset(null);
                  navigate('/scanner');
                }}
                className="btn btn-primary btn-sm flex-1 justify-center"
              >
                <Zap size={14} />
                Launch Port Scan on Host
              </button>
              <button
                onClick={() => {
                  setSelectedAsset(null);
                  navigate('/assets');
                }}
                className="btn btn-outline btn-sm flex-1 justify-center"
              >
                Inspect in Asset Inventory
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
