/**
 * Login.jsx
 * ---------
 * Authentication page with sign-in / sign-up forms,
 * radar animation, demo account quick-fill buttons,
 * and a "View session token" panel after login.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Eye, EyeOff, Radar, Target, CheckCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import CyberShieldLogo from '../components/CyberShieldLogo';

const DEMO_ACCOUNTS = [
  { label: 'Admin',    email: 'admin@corp.test',   password: 'Admin#123' },
  { label: 'Analyst',  email: 'analyst@corp.test',  password: 'Analyst#123' },
];

const FEATURES = [
  { icon: Target,       text: 'Severity scoring from exposure, data, and exploit status' },
  { icon: Radar,        text: 'Port scanning with live CVE enrichment for SSH, HTTP, HTTPS, 8080' },
  { icon: Shield,       text: 'Admin and Analyst roles with JWT token-based sessions' },
];

export default function Login() {
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  const { login, register } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const clearErrors = () => setErrors({});

  const validate = () => {
    const errs = {};
    if (mode === 'signup' && !fullName.trim()) errs.fullName = 'Name is required.';
    if (!email.includes('@')) errs.email = 'Enter a valid email address.';
    if (password.length < 8) errs.password = 'Password must be at least 8 characters.';
    return errs;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    clearErrors();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }

    setLoading(true);
    try {
      if (mode === 'signin') {
        await login(email, password);
        toast.success('Welcome back!');
      } else {
        await register(fullName, email, password);
        toast.success('Account created! Welcome aboard.');
      }
      navigate('/dashboard');
    } catch (err) {
      const detail = err.response?.data?.detail;
      if (detail?.toLowerCase().includes('email')) {
        setErrors({ email: detail });
      } else {
        setErrors({ global: detail || 'Invalid email or password.' });
      }
    } finally {
      setLoading(false);
    }
  };

  const fillDemo = (acc) => {
    setEmail(acc.email);
    setPassword(acc.password);
    clearErrors();
  };

  return (
    <div
      className="h-screen max-h-screen overflow-hidden flex relative"
      style={{
        background: '#070c16',
        color: '#f8fafc',
      }}
    >
      {/* ── Left Panel ────────────────────────────────────────────────────── */}
      <div
        className="hidden lg:flex flex-col w-[700px] xl:w-[700px] flex-shrink-0 py-4 xl:py-5 px-7 xl:px-9 h-full max-h-screen overflow-hidden relative"
        style={{
          background: 'radial-gradient(ellipse 90% 60% at 15% 0%, rgba(20, 184, 166, 0.12) 0%, transparent 60%), linear-gradient(180deg, #0c1525 0%, #070c17 100%)',
          borderRight: '1px solid rgba(255, 255, 255, 0.08)',
        }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div
            className="relative flex items-center justify-center rounded-xl p-2 transition-transform hover:scale-105 duration-300 shadow-md flex-shrink-0"
            style={{
              background: 'linear-gradient(135deg, rgba(15, 118, 110, 0.45) 0%, rgba(8, 20, 34, 0.95) 100%)',
              border: '1px solid rgba(45, 212, 191, 0.4)',
              boxShadow: '0 0 16px rgba(45, 212, 191, 0.22), inset 0 1px 1px rgba(255, 255, 255, 0.2)',
            }}
          >
            <CyberShieldLogo size={26} />
          </div>
          <div>
            <div className="font-sora font-700 text-white text-base tracking-wide flex items-center gap-1.5 leading-none">
              Cyber Hawk
              <span className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-teal-500/20 text-teal-300 border border-teal-500/30">
                Ops
              </span>
            </div>
            <div className="text-[11px] mt-1" style={{ color: 'rgba(255,255,255,0.45)' }}>
              Security Operations & Incident Intelligence
            </div>
          </div>
        </div>

        {/* Headline & Features — positioned up with enlarged feature text */}
        <div className="mt-5 xl:mt-7 mb-auto space-y-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold text-teal-300 border border-teal-500/30 bg-teal-500/10 mb-2.5">
              <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" />
              Unified SecOps Command Centre
            </div>
            <h1 className="font-sora font-700 text-2xl xl:text-3xl text-white leading-tight">
              Triage incidents.<br />Track every exposure.
            </h1>
            <p className="mt-2 text-sm xl:text-[15px] leading-relaxed max-w-[560px]" style={{ color: 'rgba(255,255,255,0.7)' }}>
              A unified command centre for your security team — from real-time asset inventory to automated CVE correlation and threat defense.
            </p>
          </div>

          <ul className="space-y-3 pt-1.5">
            {FEATURES.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3">
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{
                    background: 'rgba(45,212,191,0.14)',
                    border: '1px solid rgba(45, 212, 191, 0.3)',
                  }}
                >
                  <Icon size={13} style={{ color: 'var(--accent)' }} />
                </div>
                <span className="text-[13px] xl:text-sm font-medium leading-snug" style={{ color: 'rgba(255,255,255,0.85)' }}>
                  {text}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Radar graphic — balanced spacing above the line */}
        <div className="pt-3 border-t flex-shrink-0 mt-auto" style={{ borderColor: 'rgba(255, 255, 255, 0.08)' }}>
          <RadarGraphic />
        </div>
      </div>

      {/* ── Right Panel (Form Card) ─────────────────────────────────────────────── */}
      <div
        className="flex-1 flex items-center justify-center p-4 sm:p-6 h-full overflow-y-auto relative"
        style={{
          background: 'radial-gradient(ellipse 70% 50% at 85% 15%, rgba(56, 189, 248, 0.05) 0%, transparent 60%), #080d1a',
        }}
      >
        <div
          className="w-full max-w-[400px] rounded-2xl p-6 sm:p-7 shadow-2xl relative"
          style={{
            background: 'linear-gradient(180deg, rgba(14, 22, 38, 0.78) 0%, rgba(9, 14, 26, 0.88) 100%)',
            border: '1px solid rgba(255, 255, 255, 0.09)',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 25px rgba(20, 184, 166, 0.05)',
            backdropFilter: 'blur(16px)',
          }}
        >

          {/* Mobile logo */}
          <div className="flex items-center gap-3 mb-5 lg:hidden">
            <div
              className="relative flex items-center justify-center rounded-xl p-2 shadow-md flex-shrink-0"
              style={{
                background: 'linear-gradient(135deg, rgba(15, 118, 110, 0.4) 0%, rgba(8, 20, 34, 0.9) 100%)',
                border: '1px solid rgba(45, 212, 191, 0.4)',
                boxShadow: '0 0 14px rgba(45, 212, 191, 0.25)',
              }}
            >
              <CyberShieldLogo size={24} />
            </div>
            <div>
              <span className="font-sora font-700 text-base tracking-wide text-white">
                Cyber Hawk
              </span>
              <div className="text-[11px] text-slate-400">Security Operations</div>
            </div>
          </div>

          <div>
            <h2 className="font-sora font-700 text-2xl mb-1 text-white tracking-tight">
              {mode === 'signin' ? 'Sign in' : 'Create account'}
            </h2>
            <p className="text-xs text-slate-400 mb-4">
              {mode === 'signin'
                ? 'Enter your credentials to access the platform.'
                : 'Set up your Analyst account below.'}
            </p>

            {/* Global error */}
            {errors.global && (
              <div
                className="mb-3 p-2.5 rounded-lg text-xs font-medium"
                style={{
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#fca5a5',
                }}
              >
                {errors.global}
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate className="space-y-3">

              {/* Full name (signup only) */}
              {mode === 'signup' && (
                <div>
                  <label htmlFor="fullName" className="block text-xs font-medium mb-1 text-slate-300">
                    Full name
                  </label>
                  <input
                    id="fullName"
                    type="text"
                    className="w-full px-3 py-2 text-sm rounded-lg transition-all text-white placeholder-slate-500 focus:outline-none"
                    style={{
                      background: 'rgba(6, 11, 20, 0.75)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = '#2dd4bf';
                      e.target.style.boxShadow = '0 0 0 3px rgba(45, 212, 191, 0.18)';
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = 'rgba(255, 255, 255, 0.12)';
                      e.target.style.boxShadow = 'none';
                    }}
                    placeholder="Alex Morgan"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    autoComplete="name"
                  />
                  {errors.fullName && <p className="text-xs text-rose-400 mt-1">{errors.fullName}</p>}
                </div>
              )}

              {/* Email */}
              <div>
                <label htmlFor="email" className="block text-xs font-medium mb-1 text-slate-300">
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  className="w-full px-3 py-2 text-sm rounded-lg transition-all text-white placeholder-slate-500 focus:outline-none"
                  style={{
                    background: 'rgba(6, 11, 20, 0.75)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = '#2dd4bf';
                    e.target.style.boxShadow = '0 0 0 3px rgba(45, 212, 191, 0.18)';
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = 'rgba(255, 255, 255, 0.12)';
                    e.target.style.boxShadow = 'none';
                  }}
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
                {errors.email && <p className="text-xs text-rose-400 mt-1">{errors.email}</p>}
              </div>

              {/* Password */}
              <div>
                <label htmlFor="password" className="block text-xs font-medium mb-1 text-slate-300">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPw ? 'text' : 'password'}
                    className="w-full px-3 py-2 pr-10 text-sm rounded-lg transition-all text-white placeholder-slate-500 focus:outline-none"
                    style={{
                      background: 'rgba(6, 11, 20, 0.75)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = '#2dd4bf';
                      e.target.style.boxShadow = '0 0 0 3px rgba(45, 212, 191, 0.18)';
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = 'rgba(255, 255, 255, 0.12)';
                      e.target.style.boxShadow = 'none';
                    }}
                    placeholder={mode === 'signup' ? 'Minimum 8 characters' : '••••••••'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-teal-300 transition-colors p-1"
                    aria-label={showPw ? 'Hide password' : 'Show password'}
                  >
                    {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                {errors.password && <p className="text-xs text-rose-400 mt-1">{errors.password}</p>}
              </div>

              {/* Submit */}
              <button
                type="submit"
                id="submit-auth"
                disabled={loading}
                className="w-full justify-center py-2.5 rounded-lg text-sm font-semibold tracking-wide text-white transition-all duration-200 mt-2 shadow-lg flex items-center gap-2 cursor-pointer disabled:opacity-50"
                style={{
                  background: 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)',
                  boxShadow: '0 4px 14px rgba(13, 148, 136, 0.35)',
                  border: '1px solid rgba(45, 212, 191, 0.3)',
                }}
                onMouseEnter={(e) => {
                  if (!loading) e.currentTarget.style.background = 'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)';
                }}
                onMouseLeave={(e) => {
                  if (!loading) e.currentTarget.style.background = 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)';
                }}
              >
                {loading ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
              </button>
            </form>

            {/* Mode toggle */}
            <p className="text-center text-xs text-slate-400 mt-3.5">
              {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
              <button
                onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); clearErrors(); }}
                className="text-teal-400 hover:text-teal-300 font-medium hover:underline focus:outline-none ml-0.5"
              >
                {mode === 'signin' ? 'Create account' : 'Sign in'}
              </button>
            </p>

            {/* Demo accounts */}
            {mode === 'signin' && (
              <div className="mt-4 pt-3 border-t" style={{ borderColor: 'rgba(255, 255, 255, 0.08)' }}>
                <p className="text-[11px] font-semibold tracking-wider uppercase text-slate-400 text-center mb-2">
                  Demo Quick-Login
                </p>
                <div className="flex gap-2">
                  {DEMO_ACCOUNTS.map((acc) => (
                    <button
                      key={acc.label}
                      id={`demo-${acc.label.toLowerCase()}`}
                      type="button"
                      onClick={() => fillDemo(acc)}
                      className="flex-1 py-1.5 px-3 rounded-lg text-xs font-medium text-slate-300 transition-all border"
                      style={{
                        background: 'rgba(255, 255, 255, 0.04)',
                        borderColor: 'rgba(255, 255, 255, 0.1)',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(45, 212, 191, 0.12)';
                        e.currentTarget.style.borderColor = 'rgba(45, 212, 191, 0.4)';
                        e.currentTarget.style.color = '#5eead4';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
                        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                        e.currentTarget.style.color = '#cbd5e1';
                      }}
                    >
                      {acc.label}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-slate-400 text-center mt-2 font-mono">
                  admin@corp.test / Admin#123 · analyst@corp.test / Analyst#123
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Radar Graphic ─────────────────────────────────────────────────────────────
function RadarGraphic() {
  const blips = [
    { cx: 160, cy: 110, r: 4, color: 'var(--critical)', label: 'Critical' },
    { cx: 220, cy: 170, r: 3.5, color: 'var(--high)', label: 'High' },
    { cx: 100, cy: 190, r: 3, color: 'var(--medium)', label: 'Medium' },
    { cx: 200, cy: 230, r: 3, color: 'var(--low)', label: 'Low' },
  ];

  return (
    <div className="flex flex-col items-center">
      <svg width="210" height="210" viewBox="0 0 280 280" aria-hidden="true">
        {/* Concentric circles */}
        {[100, 75, 50, 25].map((r) => (
          <circle key={r} cx="140" cy="140" r={r} fill="none"
            stroke="rgba(45,212,191,0.15)" strokeWidth="1" />
        ))}
        {/* Cross-hairs */}
        <line x1="140" y1="40" x2="140" y2="240" stroke="rgba(45,212,191,0.1)" strokeWidth="1" />
        <line x1="40" y1="140" x2="240" y2="140" stroke="rgba(45,212,191,0.1)" strokeWidth="1" />

        {/* Sweep */}
        <g className="radar-sweep" style={{ transformOrigin: '140px 140px' }}>
          <path
            d={`M 140 140 L 140 40 A 100 100 0 0 1 ${140 + 100 * Math.sin(Math.PI / 3)} ${140 - 100 * Math.cos(Math.PI / 3)} Z`}
            fill="url(#radarGrad)"
            opacity="0.5"
          />
        </g>
        <defs>
          <radialGradient id="radarGrad" cx="0%" cy="100%" r="100%">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.4" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Blips */}
        {blips.map((b) => (
          <g key={b.label}>
            <circle cx={b.cx} cy={b.cy} r={b.r + 4} fill={b.color} opacity="0.15" />
            <circle cx={b.cx} cy={b.cy} r={b.r} fill={b.color} opacity="0.9" />
          </g>
        ))}

        {/* Center dot */}
        <circle cx="140" cy="140" r="4" fill="var(--accent)" />
      </svg>
      <p className="text-[11px] mt-1.5 text-center" style={{ color: 'rgba(255,255,255,0.45)' }}>
        4 threats detected across monitored assets
      </p>
    </div>
  );
}
