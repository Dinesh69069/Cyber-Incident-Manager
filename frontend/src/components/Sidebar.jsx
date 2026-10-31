/**
 * Sidebar.jsx
 * -----------
 * Left navigation rail with logo, nav groups, plan card, and theme toggle.
 * Responsive: 252px sticky on desktop, off-canvas drawer on < 1000px.
 */

import {
  LayoutDashboard, Server, AlertTriangle, Radar, Shield,
  CreditCard, Users, LogOut, Sparkles
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import CyberShieldLogo from './CyberShieldLogo';

const ROUTES = [
  {
    group: 'Workspace',
    items: [
      { path: '/dashboard',       label: 'Dashboard',      icon: LayoutDashboard },
      { path: '/assets',          label: 'Assets',         icon: Server,      countKey: 'assets' },
      { path: '/incidents',       label: 'Incidents',      icon: AlertTriangle, countKey: 'incidents', redWhenCritical: true },
    ],
  },
  {
    group: 'Security',
    items: [
      { path: '/scanner',         label: 'Port Scanner',   icon: Radar,       premiumBadge: true },
      { path: '/vulnerabilities', label: 'Vulnerabilities',icon: Shield,      countKey: 'vulns' },
    ],
  },
  {
    group: 'Account',
    items: [
      { path: '/billing',         label: 'Billing',        icon: CreditCard },
      { path: '/users',           label: 'Users',          icon: Users,       adminOnly: true },
    ],
  },
];

export default function Sidebar({ counts = {}, onClose, isOpen }) {
  const { pathname } = useLocation();
  const { user, isAdmin, isPremium, logout } = useAuth();

  const handleNavClick = () => {
    if (onClose) onClose();
  };

  return (
    <>
      {/* Off-canvas scrim */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`
          fixed top-0 left-0 h-screen w-[252px] flex flex-col z-40
          bg-rail border-r transition-transform duration-300
          ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
        style={{ borderColor: 'rgba(255,255,255,0.07)', backgroundColor: 'var(--rail)' }}
        aria-label="Primary navigation"
      >
        {/* ── Logo ──────────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-5 py-5 border-b" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
          <div
            className="relative flex items-center justify-center rounded-xl p-1.5 flex-shrink-0 shadow-md transition-transform hover:scale-105 duration-200"
            style={{
              background: 'linear-gradient(135deg, rgba(15, 118, 110, 0.45) 0%, rgba(8, 20, 34, 0.95) 100%)',
              border: '1px solid rgba(45, 212, 191, 0.4)',
              boxShadow: '0 0 14px rgba(45, 212, 191, 0.22), inset 0 1px 1px rgba(255, 255, 255, 0.2)',
            }}
          >
            <CyberShieldLogo size={24} />
          </div>
          <div>
            <div className="font-sora font-700 text-sm text-white leading-none tracking-wide">Cyber Hawk</div>
            <div className="text-[11px] mt-1" style={{ color: 'rgba(255,255,255,0.45)' }}>Security Operations</div>
          </div>
        </div>

        {/* ── Nav ───────────────────────────────────────────────────────────── */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-5" aria-label="Site navigation">
          {ROUTES.map(({ group, items }) => (
            <div key={group}>
              <div className="text-[10px] font-semibold uppercase tracking-widest px-2 mb-1.5"
                   style={{ color: 'rgba(255,255,255,0.3)' }}>
                {group}
              </div>
              <ul className="space-y-0.5">
                {items.map((item) => {
                  if (item.adminOnly && !isAdmin) return null;
                  const isActive = pathname === item.path || pathname.startsWith(item.path + '/');
                  const count = counts[item.countKey];
                  const isCriticalRed = item.redWhenCritical && counts.criticalOpen > 0;

                  return (
                    <li key={item.path}>
                      <Link
                        to={item.path}
                        onClick={handleNavClick}
                        className={`
                          flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium
                          transition-all duration-150 group focus-visible:outline
                          focus-visible:outline-2 focus-visible:outline-offset-1
                          ${isActive
                            ? 'font-semibold border border-transparent'
                            : 'hover:bg-[var(--rail-active)] border border-transparent'
                          }
                        `}
                        style={{
                          color: isActive ? 'var(--rail-fg)' : 'var(--rail-muted)',
                          backgroundColor: isActive ? 'var(--rail-active)' : 'transparent',
                          boxShadow: isActive ? 'inset 3px 0 0 var(--rail-accent)' : 'none',
                        }}
                        aria-current={isActive ? 'page' : undefined}
                      >
                        <item.icon size={16} className="flex-shrink-0" style={{ color: isActive ? 'var(--rail-accent)' : 'inherit' }} />
                        <span className="flex-1">{item.label}</span>

                        {/* Count badge */}
                        {count !== undefined && count > 0 && (
                          <span
                            className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full tabular-nums"
                            style={{
                              background: isCriticalRed ? 'var(--critical)' : 'rgba(255,255,255,0.12)',
                              color: isCriticalRed ? '#fff' : 'rgba(255,255,255,0.7)',
                            }}
                          >
                            {count}
                          </span>
                        )}

                        {/* Pro badge for scanner */}
                        {item.premiumBadge && !isPremium && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider"
                                style={{ background: 'var(--medium-soft)', color: 'var(--medium)' }}>
                            Pro
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* ── User + Logout (Google Pro Avatar Style) ───────────────────────── */}
        <div className="px-3 pb-4 border-t pt-3.5 mt-auto" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
          <div className="flex items-center gap-3">
            {/* Avatar */}
            {isPremium ? (
              <div className="relative group cursor-pointer" title="Cyber Hawk Pro Member">
                <div className="google-pro-avatar-wrapper">
                  <div className="google-pro-avatar-content">
                    {user?.full_name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || '?'}
                  </div>
                </div>
                {/* Floating micro star badge */}
                <div
                  className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full flex items-center justify-center shadow-md z-10"
                  style={{
                    background: 'linear-gradient(135deg, #f59e0b, #ef4444)',
                    boxShadow: '0 0 6px rgba(245, 158, 11, 0.6)',
                  }}
                  title="Pro Active"
                >
                  <Sparkles size={8} className="text-white fill-white" />
                </div>
              </div>
            ) : (
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0"
                style={{ background: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.8)' }}
              >
                {user?.full_name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || '?'}
              </div>
            )}

            {/* User info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-white truncate">
                  {user?.full_name || user?.email}
                </span>
                {isPremium && (
                  <span
                    className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-full flex items-center gap-0.5 shadow-sm"
                    style={{
                      background: 'linear-gradient(135deg, #4285F4, #9B72CB)',
                      color: '#ffffff',
                      letterSpacing: '0.04em',
                    }}
                  >
                    PRO
                  </span>
                )}
              </div>
              <div className="text-[10px] flex items-center gap-1.5 mt-0.5" style={{ color: 'rgba(255,255,255,0.45)' }}>
                <span className="capitalize">{user?.role}</span>
                <span>·</span>
                {isPremium ? (
                  <span className="text-teal-400 font-medium">Pro Plan</span>
                ) : (
                  <Link
                    to="/billing"
                    onClick={handleNavClick}
                    className="text-white/60 hover:text-white underline transition-colors"
                  >
                    Upgrade
                  </Link>
                )}
              </div>
            </div>

            {/* Logout button */}
            <button
              onClick={logout}
              className="btn-icon text-white/40 hover:text-white transition-colors"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
