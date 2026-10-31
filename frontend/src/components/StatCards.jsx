/**
 * StatCards.jsx
 * -------------
 * Four interactive KPI stat cards for the dashboard overview.
 * Each card is fully interactive, linking directly to its filtered view.
 */

import { AlertTriangle, Zap, Server, Shield, ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function StatCards({ stats }) {
  if (!stats) return <StatCardsSkeleton />;

  const cards = [
    {
      id: 'open-incidents',
      label: 'Open Incidents',
      value: stats.open_incidents,
      sub: `${stats.incidents_this_week} reported this week`,
      icon: AlertTriangle,
      accent: 'var(--high)',
      accentSoft: 'var(--high-soft)',
      link: '/incidents',
      badge: 'View Kanban',
    },
    {
      id: 'critical-open',
      label: 'Critical Open',
      value: stats.critical_open,
      sub: stats.critical_open > 0 ? 'Urgent attention required' : 'No critical incidents',
      icon: Zap,
      accent: stats.critical_open > 0 ? 'var(--critical)' : 'var(--ok)',
      accentSoft: stats.critical_open > 0 ? 'var(--critical-soft)' : 'var(--ok-soft)',
      valueDanger: stats.critical_open > 0,
      link: '/incidents',
      badge: stats.critical_open > 0 ? 'Action needed' : 'Clear',
    },
    {
      id: 'assets-monitored',
      label: 'Assets Monitored',
      value: stats.total_assets,
      sub: `${stats.assets_with_cves} with active CVEs`,
      icon: Server,
      accent: 'var(--accent)',
      accentSoft: 'var(--accent-soft)',
      link: '/assets',
      badge: 'Inspect',
    },
    {
      id: 'known-vulns',
      label: 'Known Vulnerabilities',
      value: stats.total_vulnerabilities,
      sub: `Mean CVSS ${stats.mean_cvss?.toFixed(1) || '—'}`,
      icon: Shield,
      accent: 'var(--medium)',
      accentSoft: 'var(--medium-soft)',
      link: '/vulnerabilities',
      badge: 'Database',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <StatCard key={card.id} {...card} />
      ))}
    </div>
  );
}

function StatCard({ id, label, value, sub, icon: Icon, accent, accentSoft, valueDanger, link, badge }) {
  return (
    <Link
      to={link}
      id={id}
      className="card p-5 flex flex-col gap-3 group hover:border-[var(--accent)] hover:-translate-y-1 hover:shadow-xl transition-all duration-200 cursor-pointer relative overflow-hidden"
    >
      {/* Background glow on hover */}
      <div
        className="absolute -top-12 -right-12 w-28 h-28 rounded-full opacity-0 group-hover:opacity-10 transition-opacity blur-2xl pointer-events-none"
        style={{ background: accent }}
      />

      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted group-hover:text-[var(--fg)] transition-colors">
          {label}
        </span>
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center transition-transform group-hover:scale-110"
          style={{ background: accentSoft }}
        >
          <Icon size={16} style={{ color: accent }} />
        </div>
      </div>

      <div className="flex items-baseline justify-between mt-1">
        <div
          className="text-3xl font-sora font-700 tabular-nums leading-none tracking-tight"
          style={{ color: valueDanger ? 'var(--critical)' : 'var(--fg)' }}
        >
          {value ?? '—'}
        </div>
        <div className="flex items-center gap-0.5 text-[10px] font-medium text-[var(--muted)] group-hover:text-[var(--accent)] transition-colors">
          <span>{badge}</span>
          <ArrowUpRight size={12} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
        </div>
      </div>

      <div className="text-xs text-muted leading-tight">{sub}</div>
    </Link>
  );
}

function StatCardsSkeleton() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="card p-5 space-y-3 animate-pulse">
          <div className="flex justify-between">
            <div className="h-3 w-24 rounded" style={{ background: 'var(--line)' }} />
            <div className="w-8 h-8 rounded-lg" style={{ background: 'var(--line)' }} />
          </div>
          <div className="h-8 w-16 rounded" style={{ background: 'var(--line)' }} />
          <div className="h-3 w-28 rounded" style={{ background: 'var(--line)' }} />
        </div>
      ))}
    </div>
  );
}
