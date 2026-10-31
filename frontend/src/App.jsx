/**
 * App.jsx
 * -------
 * Main routing, layout shell, dark/light theme management,
 * authentication guard, global command palette search, notifications popover,
 * and live dashboard metrics propagation.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
  useNavigate,
  Link,
} from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider, useToast } from './contexts/ToastContext';
import Sidebar from './components/Sidebar';
import { dashboardApi, incidentsApi, assetsApi, vulnsApi } from './api';

// Pages
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Assets from './pages/Assets';
import Incidents from './pages/Incidents';
import Scanner from './pages/Scanner';
import Vulnerabilities from './pages/Vulnerabilities';
import Billing from './pages/Billing';
import Users from './pages/Users';

import {
  Menu,
  Sun,
  Moon,
  ShieldCheck,
  ShieldAlert,
  Bell,
  RefreshCw,
  Search,
  Plus,
  Command,
  X,
  Server,
  AlertTriangle,
  Shield,
  ChevronRight,
  Check,
  Trash2
} from 'lucide-react';

/**
 * Route protection guard
 */
function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-[var(--bg)]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-3 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-[var(--muted)] font-mono tracking-wider uppercase">
            Initializing Secure Session...
          </span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

/**
 * Public route guard (redirects to dashboard if already logged in)
 */
function PublicRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return null;
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

/**
 * Main application shell with Sidebar, header search, notification drawer, and actions
 */
function MainLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [counts, setCounts] = useState({ assets: 0, incidents: 0, criticalOpen: 0, vulns: 0 });
  const [theme, setTheme] = useState(() => localStorage.getItem('cyber_theme') || 'light');
  const [refreshing, setRefreshing] = useState(false);
  
  // Interactive Header State
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState({ assets: [], incidents: [], vulns: [] });
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState([
    { id: 1, title: 'Critical Apache RCE active', target: 'web-prod-01', time: '10m ago', unread: true, severity: 'critical' },
    { id: 2, title: 'Terrapin SSH vulnerability detected', target: 'build-ci-02', time: '1h ago', unread: true, severity: 'high' },
    { id: 3, title: 'Automated socket scan complete', target: 'api-gateway', time: '3h ago', unread: false, severity: 'ok' },
  ]);
  const [quickActionOpen, setQuickActionOpen] = useState(false);

  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const searchInputRef = useRef(null);

  // Apply theme to document element (Light is default, Dark is opt-in)
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    localStorage.setItem('cyber_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  // Keyboard shortcut Ctrl+K / Cmd+K for Search
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
      if (e.key === 'Escape') {
        setSearchOpen(false);
        setNotificationsOpen(false);
        setQuickActionOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Focus search input when modal opens
  useEffect(() => {
    if (searchOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    } else {
      setSearchQuery('');
    }
  }, [searchOpen]);

  // Global search filtering
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults({ assets: [], incidents: [], vulns: [] });
      return;
    }

    const query = searchQuery.toLowerCase();
    const fetchSearchData = async () => {
      try {
        const [incRes, assetRes, vulnRes] = await Promise.all([
          incidentsApi.list(),
          assetsApi.list(),
          vulnsApi.list(),
        ]);

        const matchedIncidents = (incRes.data || []).filter(
          (i) => i.title.toLowerCase().includes(query) || i.description?.toLowerCase().includes(query)
        ).slice(0, 3);

        const matchedAssets = (assetRes.data || []).filter(
          (a) => a.asset_name.toLowerCase().includes(query) || a.ip_address.includes(query)
        ).slice(0, 3);

        const matchedVulns = (vulnRes.data || []).filter(
          (v) => v.cve_id.toLowerCase().includes(query) || v.description?.toLowerCase().includes(query)
        ).slice(0, 3);

        setSearchResults({
          incidents: matchedIncidents,
          assets: matchedAssets,
          vulns: matchedVulns,
        });
      } catch {
        // Quiet catch for quick search
      }
    };

    const timer = setTimeout(fetchSearchData, 200);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch count badges for Sidebar
  const fetchCounts = useCallback(async () => {
    try {
      setRefreshing(true);
      const res = await dashboardApi.stats();
      if (res.data) {
        setCounts({
          assets: res.data.total_assets || 0,
          incidents: res.data.open_incidents || 0,
          criticalOpen: res.data.critical_open || 0,
          vulns: res.data.known_vulnerabilities || 0,
        });
      }
    } catch {
      // Quiet fail if session expired
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchCounts();
  }, [fetchCounts, location.pathname]);

  // Page title mapping
  const getPageTitle = (path) => {
    if (path.startsWith('/dashboard')) return { title: 'Security Dashboard', subtitle: 'Real-time telemetry and posture metrics' };
    if (path.startsWith('/assets')) return { title: 'Asset Inventory', subtitle: 'Monitored hosts, databases & cloud instances' };
    if (path.startsWith('/incidents')) return { title: 'Incident Response', subtitle: 'Prioritized triaging & Kanban response board' };
    if (path.startsWith('/scanner')) return { title: 'Live Network Scanner', subtitle: 'Targeted socket inspection & vulnerability mapping' };
    if (path.startsWith('/vulnerabilities')) return { title: 'Vulnerability Database', subtitle: 'Discovered CVEs and exploit catalog' };
    if (path.startsWith('/billing')) return { title: 'Subscription & License', subtitle: 'Plan management and Stripe billing flow' };
    if (path.startsWith('/users')) return { title: 'IAM & Access Control', subtitle: 'Role-based authorization and credentials' };
    return { title: 'Cyber Hawk', subtitle: 'Threat & Incident Operations' };
  };

  const headerInfo = getPageTitle(location.pathname);
  const unreadCount = notifications.filter((n) => n.unread).length;

  const markAllNotificationsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, unread: false })));
    toast.info('All security alerts marked as read.');
  };

  return (
    <div className="min-h-screen bg-[var(--bg)] flex">
      {/* Navigation Sidebar */}
      <Sidebar
        counts={counts}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-[252px] flex flex-col min-w-0">
        {/* Top Navbar */}
        <header
          className="sticky top-0 z-20 h-16 border-b px-4 lg:px-8 flex items-center justify-between backdrop-blur-md"
          style={{
            backgroundColor: 'var(--surface-2)',
            borderColor: 'var(--line)',
            opacity: 0.98
          }}
        >
          {/* Mobile hamburger & Page Title */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-lg text-[var(--muted)] hover:text-[var(--fg)] hover:bg-[var(--line)]"
              aria-label="Open navigation menu"
            >
              <Menu size={20} />
            </button>

            <div>
              <h1 className="text-base font-sora font-semibold text-[var(--fg)] leading-tight">
                {headerInfo.title}
              </h1>
              <p className="text-[11px] text-[var(--muted)] hidden sm:block">
                {headerInfo.subtitle}
              </p>
            </div>
          </div>

          {/* Right Action Bar with Interactive Micro-Components */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Interactive Global Search Trigger */}
            <button
              onClick={() => setSearchOpen(true)}
              className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface)] text-xs text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--fg)] transition-all cursor-pointer shadow-sm group"
              title="Search incidents, hosts, CVEs (Ctrl+K)"
            >
              <Search size={14} className="group-hover:text-[var(--accent)] transition-colors" />
              <span>Quick search...</span>
              <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--surface-2)] border border-[var(--line)] text-[var(--muted)]">
                Ctrl K
              </kbd>
            </button>

            {/* Quick Action Button Dropdown */}
            <div className="relative">
              <button
                onClick={() => setQuickActionOpen(!quickActionOpen)}
                className="btn btn-primary btn-sm flex items-center gap-1.5 py-1 px-2.5 text-xs font-semibold"
                title="Create Incident or Add Asset"
              >
                <Plus size={14} />
                <span className="hidden sm:inline">New</span>
              </button>

              {quickActionOpen && (
                <>
                  <div
                    className="fixed inset-0 z-30"
                    onClick={() => setQuickActionOpen(false)}
                  />
                  <div className="absolute right-0 mt-2 w-48 rounded-xl bg-[var(--surface)] border border-[var(--line)] shadow-2xl p-1.5 z-40 text-xs animate-in fade-in zoom-in-95">
                    <button
                      onClick={() => {
                        setQuickActionOpen(false);
                        navigate('/incidents');
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-[var(--surface-2)] text-[var(--fg)] transition-colors text-left"
                    >
                      <AlertTriangle size={14} className="text-[var(--high)]" />
                      <span>Report Incident</span>
                    </button>
                    <button
                      onClick={() => {
                        setQuickActionOpen(false);
                        navigate('/assets');
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-[var(--surface-2)] text-[var(--fg)] transition-colors text-left"
                    >
                      <Server size={14} className="text-[var(--accent)]" />
                      <span>Register Asset</span>
                    </button>
                    <button
                      onClick={() => {
                        setQuickActionOpen(false);
                        navigate('/scanner');
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-[var(--surface-2)] text-[var(--fg)] transition-colors text-left"
                    >
                      <Shield size={14} className="text-[var(--medium)]" />
                      <span>Run Port Scan</span>
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Live Threat Status Indicator Pill */}
            <Link
              to="/incidents"
              className="hidden lg:flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-mono border transition-all hover:scale-105"
              style={{
                borderColor: counts.criticalOpen > 0 ? 'var(--critical)' : 'var(--line)',
                backgroundColor: counts.criticalOpen > 0 ? 'var(--critical-soft)' : 'var(--surface)',
              }}
              title="Click to view open incidents"
            >
              {counts.criticalOpen > 0 ? (
                <>
                  <ShieldAlert size={14} className="text-[var(--critical)] animate-pulse" />
                  <span className="text-[var(--critical)] font-semibold">
                    {counts.criticalOpen} Critical Alert{counts.criticalOpen > 1 ? 's' : ''}
                  </span>
                </>
              ) : (
                <>
                  <ShieldCheck size={14} className="text-[var(--ok)]" />
                  <span className="text-[var(--fg)]">Status: Guarded</span>
                </>
              )}
            </Link>

            {/* Notifications Bell Dropdown */}
            <div className="relative">
              <button
                onClick={() => setNotificationsOpen(!notificationsOpen)}
                className="relative p-2 rounded-lg text-[var(--muted)] hover:text-[var(--fg)] hover:bg-[var(--surface)] border border-transparent hover:border-[var(--line)] transition-all"
                title="Security notifications"
                aria-label="Security notifications"
              >
                <Bell size={17} />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[var(--critical)] animate-ping" />
                )}
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[var(--critical)]" />
                )}
              </button>

              {notificationsOpen && (
                <>
                  <div
                    className="fixed inset-0 z-30"
                    onClick={() => setNotificationsOpen(false)}
                  />
                  <div className="absolute right-0 mt-2 w-80 rounded-xl bg-[var(--surface)] border border-[var(--line)] shadow-2xl p-3 z-40 text-xs animate-in fade-in zoom-in-95">
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-[var(--line)]">
                      <span className="font-sora font-semibold text-[var(--fg)]">Security Alerts</span>
                      {unreadCount > 0 && (
                        <button
                          onClick={markAllNotificationsRead}
                          className="text-[11px] text-[var(--accent)] hover:underline flex items-center gap-1"
                        >
                          <Check size={12} />
                          Mark read
                        </button>
                      )}
                    </div>

                    <div className="space-y-2">
                      {notifications.map((n) => (
                        <div
                          key={n.id}
                          className={`p-2 rounded-lg transition-colors ${
                            n.unread ? 'bg-[var(--surface-2)] border border-[var(--line)]' : 'opacity-70'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-1">
                            <span className="font-medium text-[var(--fg)] leading-tight">{n.title}</span>
                            <span className="text-[10px] text-[var(--muted)] flex-shrink-0">{n.time}</span>
                          </div>
                          <div className="text-[10px] text-[var(--muted)] mt-1 flex items-center gap-1 font-mono">
                            <span>Host: {n.target}</span>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="pt-2 mt-2 border-t border-[var(--line)] text-center">
                      <Link
                        to="/incidents"
                        onClick={() => setNotificationsOpen(false)}
                        className="text-[11px] text-[var(--accent)] font-semibold hover:underline"
                      >
                        View all incidents in response board →
                      </Link>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Quick Refresh */}
            <button
              onClick={fetchCounts}
              className={`p-2 rounded-lg text-[var(--muted)] hover:text-[var(--fg)] hover:bg-[var(--surface)] border border-transparent hover:border-[var(--line)] transition-all ${
                refreshing ? 'animate-spin text-[var(--accent)]' : ''
              }`}
              title="Refresh telemetry"
              aria-label="Refresh telemetry"
            >
              <RefreshCw size={16} />
            </button>

            {/* Theme Toggle Button */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg text-[var(--muted)] hover:text-[var(--fg)] hover:bg-[var(--surface)] border border-transparent hover:border-[var(--line)] transition-all"
              title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} mode`}
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? (
                <Sun size={17} className="text-amber-400" />
              ) : (
                <Moon size={17} className="text-indigo-600" />
              )}
            </button>
          </div>
        </header>

        {/* Page Content Body */}
        <main className="flex-1 p-4 lg:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>

      {/* ── Global Command Palette / Quick Search Modal ────────────────────── */}
      {searchOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div
            className="w-full max-w-xl rounded-2xl bg-[var(--surface)] border border-[var(--line)] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Input Header */}
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[var(--line)]">
              <Search size={18} className="text-[var(--accent)] flex-shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search incidents, monitored hosts, or CVE catalog..."
                className="flex-1 bg-transparent text-sm text-[var(--fg)] outline-none placeholder:text-[var(--muted)] font-plex"
              />
              <button
                onClick={() => setSearchOpen(false)}
                className="p-1 rounded text-[var(--muted)] hover:text-[var(--fg)]"
              >
                <X size={16} />
              </button>
            </div>

            {/* Results Area */}
            <div className="max-h-[380px] overflow-y-auto p-3 space-y-4">
              {!searchQuery.trim() ? (
                <div className="py-8 text-center text-xs text-[var(--muted)] space-y-2">
                  <Command size={24} className="mx-auto opacity-40 mb-1" />
                  <div>Type any asset hostname, IP address, incident title, or CVE ID.</div>
                  <div className="flex justify-center gap-2 pt-2">
                    <span className="px-2 py-1 rounded bg-[var(--surface-2)] border border-[var(--line)] text-[10px] font-mono">web-prod-01</span>
                    <span className="px-2 py-1 rounded bg-[var(--surface-2)] border border-[var(--line)] text-[10px] font-mono">CVE-2021-42013</span>
                    <span className="px-2 py-1 rounded bg-[var(--surface-2)] border border-[var(--line)] text-[10px] font-mono">Apache RCE</span>
                  </div>
                </div>
              ) : (
                <>
                  {/* Matched Incidents */}
                  {searchResults.incidents.length > 0 && (
                    <div>
                      <div className="text-[10px] font-semibold text-[var(--muted)] uppercase tracking-wider px-2 mb-1.5">
                        Incidents ({searchResults.incidents.length})
                      </div>
                      <div className="space-y-1">
                        {searchResults.incidents.map((inc) => (
                          <div
                            key={inc.id}
                            onClick={() => {
                              setSearchOpen(false);
                              navigate('/incidents');
                            }}
                            className="flex items-center justify-between p-2.5 rounded-lg hover:bg-[var(--surface-2)] cursor-pointer transition-colors group"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <AlertTriangle size={15} className="text-[var(--critical)] flex-shrink-0" />
                              <span className="text-xs font-medium text-[var(--fg)] group-hover:text-[var(--accent)] truncate">
                                {inc.title}
                              </span>
                            </div>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--critical-soft)] text-[var(--critical)] font-semibold flex-shrink-0 ml-2">
                              {inc.severity}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Matched Assets */}
                  {searchResults.assets.length > 0 && (
                    <div>
                      <div className="text-[10px] font-semibold text-[var(--muted)] uppercase tracking-wider px-2 mb-1.5">
                        Assets ({searchResults.assets.length})
                      </div>
                      <div className="space-y-1">
                        {searchResults.assets.map((asset) => (
                          <div
                            key={asset.id}
                            onClick={() => {
                              setSearchOpen(false);
                              navigate('/assets');
                            }}
                            className="flex items-center justify-between p-2.5 rounded-lg hover:bg-[var(--surface-2)] cursor-pointer transition-colors group"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <Server size={15} className="text-[var(--accent)] flex-shrink-0" />
                              <span className="text-xs font-medium text-[var(--fg)] group-hover:text-[var(--accent)] truncate">
                                {asset.asset_name}
                              </span>
                              <span className="text-[11px] font-mono text-[var(--muted)]">
                                {asset.ip_address}
                              </span>
                            </div>
                            <span className="text-[10px] text-[var(--muted)] font-mono">
                              {asset.device_type}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Matched CVEs */}
                  {searchResults.vulns.length > 0 && (
                    <div>
                      <div className="text-[10px] font-semibold text-[var(--muted)] uppercase tracking-wider px-2 mb-1.5">
                        Vulnerabilities ({searchResults.vulns.length})
                      </div>
                      <div className="space-y-1">
                        {searchResults.vulns.map((vuln) => (
                          <div
                            key={vuln.id}
                            onClick={() => {
                              setSearchOpen(false);
                              navigate('/vulnerabilities');
                            }}
                            className="flex items-center justify-between p-2.5 rounded-lg hover:bg-[var(--surface-2)] cursor-pointer transition-colors group"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <Shield size={15} className="text-[var(--medium)] flex-shrink-0" />
                              <span className="text-xs font-mono font-semibold text-[var(--fg)] group-hover:text-[var(--accent)] truncate">
                                {vuln.cve_id}
                              </span>
                              <span className="text-[11px] text-[var(--muted)] truncate">
                                {vuln.description}
                              </span>
                            </div>
                            <span className="text-[10px] font-mono font-bold text-[var(--high)] ml-2">
                              CVSS {vuln.cvss_score}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {searchResults.incidents.length === 0 &&
                    searchResults.assets.length === 0 &&
                    searchResults.vulns.length === 0 && (
                      <div className="py-8 text-center text-xs text-[var(--muted)]">
                        No matches found for &ldquo;{searchQuery}&rdquo;.
                      </div>
                    )}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-2 border-t border-[var(--line)] bg-[var(--surface-2)] flex items-center justify-between text-[10px] text-[var(--muted)] font-mono">
              <span>Navigate with mouse or click item to inspect</span>
              <span>ESC to exit</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            {/* Public Auth Route */}
            <Route
              path="/login"
              element={
                <PublicRoute>
                  <Login />
                </PublicRoute>
              }
            />

            {/* Protected Routes inside Main Shell */}
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <MainLayout>
                    <Dashboard />
                  </MainLayout>
                </ProtectedRoute>
              }
            />

            <Route
              path="/assets"
              element={
                <ProtectedRoute>
                  <MainLayout>
                    <Assets />
                  </MainLayout>
                </ProtectedRoute>
              }
            />

            <Route
              path="/incidents"
              element={
                <ProtectedRoute>
                  <MainLayout>
                    <Incidents />
                  </MainLayout>
                </ProtectedRoute>
              }
            />

            <Route
              path="/scanner"
              element={
                <ProtectedRoute>
                  <MainLayout>
                    <Scanner />
                  </MainLayout>
                </ProtectedRoute>
              }
            />

            <Route
              path="/vulnerabilities"
              element={
                <ProtectedRoute>
                  <MainLayout>
                    <Vulnerabilities />
                  </MainLayout>
                </ProtectedRoute>
              }
            />

            <Route
              path="/billing"
              element={
                <ProtectedRoute>
                  <MainLayout>
                    <Billing />
                  </MainLayout>
                </ProtectedRoute>
              }
            />

            <Route
              path="/users"
              element={
                <ProtectedRoute>
                  <MainLayout>
                    <Users />
                  </MainLayout>
                </ProtectedRoute>
              }
            />

            {/* Default Redirection */}
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
