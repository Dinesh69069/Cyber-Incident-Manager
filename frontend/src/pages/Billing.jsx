/**
 * Billing.jsx
 * -----------
 * Enterprise Billing & Subscription Management for Cyber Hawk.
 * Features:
 * - Real Stripe Checkout for Credit / Debit Card payments
 * - Dynamic on-the-spot UPI QR Code (₹1.00 demo) with 5-minute live countdown
 * - Instant payment verification and immediate Cyber Hawk Pro activation
 * - Supabase invoice tracking and webhook security telemetry
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  CreditCard, CheckCircle, Shield, Zap, QrCode, Clock,
  Copy, Check, ExternalLink, RefreshCw, AlertCircle, Sparkles
} from 'lucide-react';
import QRCode from 'qrcode';
import { paymentsApi } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import Modal from '../components/Modal';
import { formatDateTime, formatRelativeTime } from '../utils/time';

const FREE_FEATURES = [
  'Asset inventory tracking',
  'Incident response lifecycle',
  'Vulnerability database & CVSS scores',
  'Unified security dashboard',
];

const PREM_FEATURES = [
  'Everything in Free plan',
  'High-speed Port Scanner (22, 80, 443, 8080)',
  'Automated NVD / CVE lookup on open ports',
  'Auto-created critical incident alerts',
  'Google Pro-style cyber badge on your profile',
];

export default function Billing() {
  const { user, isPremium, updateUser } = useAuth();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [invoices, setInvoices]               = useState([]);
  const [webhookEvents, setWebhookEvents]       = useState([]);
  const [processing, setProcessing]           = useState(false);
  const [localPremium, setLocalPremium]       = useState(isPremium);

  // ── Stripe Modal State ───────────────────────────────────────────────────
  const [stripeModalOpen, setStripeModalOpen] = useState(false);
  const [stripeSession, setStripeSession]     = useState(null);

  // ── UPI Modal & QR State ─────────────────────────────────────────────────
  const [upiModalOpen, setUpiModalOpen]       = useState(false);
  const [upiData, setUpiData]                 = useState(null);
  const [qrCodeDataUrl, setQrCodeDataUrl]     = useState('');
  const [timeLeft, setTimeLeft]               = useState(300); // 5 mins in seconds
  const [copiedVpa, setCopiedVpa]             = useState(false);
  const [utrInput, setUtrInput]               = useState('');
  const [customVpa, setCustomVpa]             = useState(() => localStorage.getItem('cyber_upi_vpa') || '7008307149@nyes');
  const timerRef                              = useRef(null);

  useEffect(() => {
    setLocalPremium(isPremium);
  }, [isPremium]);

  const fetchData = useCallback(async () => {
    try {
      const [invRes, evtRes] = await Promise.all([
        paymentsApi.invoices(),
        paymentsApi.webhookEvents(),
      ]);
      setInvoices(invRes.data);
      setWebhookEvents(evtRes.data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Auto-verify Stripe redirect on return ─────────────────────────────────
  useEffect(() => {
    const sessionId = searchParams.get('session_id');
    const paymentStatus = searchParams.get('payment_status');
    if (sessionId && paymentStatus === 'success') {
      (async () => {
        try {
          const res = await paymentsApi.verifySession(sessionId);
          if (res.data?.access_token) {
            updateUser({ is_premium: true }, res.data.access_token);
          } else {
            updateUser({ is_premium: true });
          }
          setLocalPremium(true);
          toast.success('🎉 Card payment verified! Cyber Hawk Pro is now active.');
          fetchData();
        } catch {
          toast.info('Checking payment status...');
        } finally {
          searchParams.delete('session_id');
          searchParams.delete('payment_status');
          setSearchParams(searchParams, { replace: true });
        }
      })();
    }
  }, [searchParams, setSearchParams, updateUser, toast, fetchData]);

  // ── 5-Minute Countdown Timer for UPI ──────────────────────────────────────
  useEffect(() => {
    if (upiModalOpen && timeLeft > 0) {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [upiModalOpen, timeLeft]);

  // ── Render High-Contrast Clean QR Code ────────────────────────────────────
  const renderQr = async (upiUri) => {
    try {
      const dataUrl = await QRCode.toDataURL(upiUri, {
        width: 280,
        margin: 3,
        errorCorrectionLevel: 'M',
        color: {
          dark: '#000000',
          light: '#ffffff',
        },
      });
      setQrCodeDataUrl(dataUrl);
    } catch (err) {
      console.error('Failed to render QR Code', err);
    }
  };

  // ── Generate Dynamic UPI Session (₹1 Demo) ────────────────────────────────
  const handleOpenUpiModal = async (vpaOverride) => {
    setProcessing(true);
    const target = (typeof vpaOverride === 'string' && vpaOverride) ? vpaOverride : (customVpa || '7008307149@nyes');
    const vpaToUse = String(target).trim();
    try {
      const res = await paymentsApi.createUpiSession({ vpa: vpaToUse });
      setUpiData(res.data);
      setTimeLeft(res.data.expires_in_seconds || 300);
      await renderQr(res.data.upi_string);
      setUpiModalOpen(true);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to initialize UPI session.');
    } finally {
      setProcessing(false);
    }
  };

  // ── Live VPA change handler ───────────────────────────────────────────────
  const handleVpaChange = async (newVpa) => {
    setCustomVpa(newVpa);
    localStorage.setItem('cyber_upi_vpa', newVpa);
    const cleanVpa = newVpa.trim();
    if (cleanVpa) {
      const cleanUri = `upi://pay?pa=${encodeURIComponent(cleanVpa)}&pn=CyberHawk&am=1.00&cu=INR&tn=CyberHawkPro`;
      setUpiData((prev) => (prev ? { ...prev, vpa: cleanVpa, upi_string: cleanUri } : null));
      await renderQr(cleanUri);
    }
  };

  // ── Copy VPA ─────────────────────────────────────────────────────────────
  const handleCopyVpa = () => {
    if (upiData?.vpa) {
      navigator.clipboard.writeText(upiData.vpa);
      setCopiedVpa(true);
      toast.success('UPI ID copied to clipboard: ' + upiData.vpa);
      setTimeout(() => setCopiedVpa(false), 2000);
    }
  };

  // ── Confirm UPI Payment (₹1 Demo) ─────────────────────────────────────────
  const handleConfirmUpi = async () => {
    if (timeLeft <= 0) {
      toast.error('This QR code has expired after 5 minutes. Please generate a new one.');
      return;
    }
    setProcessing(true);
    try {
      const res = await paymentsApi.confirmUpi({
        session_id: upiData?.session_id,
        utr_number: utrInput.trim() || undefined,
      });

      if (res.data?.access_token) {
        updateUser({ is_premium: true }, res.data.access_token);
      } else {
        updateUser({ is_premium: true });
      }

      setLocalPremium(true);
      setUpiModalOpen(false);
      toast.success('🎉 ₹1.00 demo payment verified! Cyber Hawk Pro activated.');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Verification failed. Please check UTR or try again.');
    } finally {
      setProcessing(false);
    }
  };

  // ── Real Stripe Checkout (New Tab) ───────────────────────────────────────
  const handleStartStripeCheckout = async () => {
    setProcessing(true);
    try {
      const res = await paymentsApi.createSession({ user_id: user?.id });
      setStripeSession(res.data);
      setStripeModalOpen(true);

      // Open official Stripe hosted checkout in new tab
      if (res.data?.url) {
        window.open(res.data.url, '_blank', 'noopener,noreferrer');
      }
      toast.info('Stripe checkout opened in a new tab.');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to create Stripe checkout session.');
    } finally {
      setProcessing(false);
    }
  };

  // ── Check Stripe Status Manually from Modal ──────────────────────────────
  const handleCheckStripeStatus = async () => {
    if (!stripeSession?.session_id) return;
    setProcessing(true);
    try {
      const res = await paymentsApi.verifySession(stripeSession.session_id);
      if (res.data?.is_premium) {
        if (res.data?.access_token) {
          updateUser({ is_premium: true }, res.data.access_token);
        } else {
          updateUser({ is_premium: true });
        }
        setLocalPremium(true);
        setStripeModalOpen(false);
        toast.success('🎉 Stripe payment verified! Cyber Hawk Pro is active.');
        fetchData();
      } else {
        toast.info('Payment still pending on Stripe. Complete checkout and try again.');
      }
    } catch {
      toast.error('Could not verify Stripe session status.');
    } finally {
      setProcessing(false);
    }
  };

  // ── 1-Click Instant Upgrade (Quick dev bypass) ─────────────────────────────
  const handleDirectUpgrade = async () => {
    setProcessing(true);
    try {
      const res = await paymentsApi.upgrade();
      if (res.data?.access_token) {
        updateUser({ is_premium: true }, res.data.access_token);
      } else {
        updateUser({ is_premium: true });
      }
      setLocalPremium(true);
      toast.success('🎉 Upgraded to Cyber Hawk Pro! Google Pro avatar badge active.');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Upgrade failed.');
    } finally {
      setProcessing(false);
    }
  };

  // ── Downgrade (Testing) ───────────────────────────────────────────────────
  const handleDowngrade = async () => {
    setProcessing(true);
    try {
      const res = await paymentsApi.downgrade();
      if (res.data?.access_token) {
        updateUser({ is_premium: false }, res.data.access_token);
      } else {
        updateUser({ is_premium: false });
      }
      setLocalPremium(false);
      toast.info('Downgraded to Free plan.');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Downgrade failed.');
    } finally {
      setProcessing(false);
    }
  };

  // Format time remaining MM:SS
  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-sora font-700 text-xl" style={{ color: 'var(--fg)' }}>Billing & Plans</h1>
        <p className="text-sm text-muted">Upgrade to Cyber Hawk Pro using UPI QR Code or Credit Card via Stripe</p>
      </div>

      {/* ── Plan Cards ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Free Plan */}
        <div
          className="card p-6 space-y-5"
          style={!localPremium ? { borderColor: 'var(--accent)', borderWidth: 2 } : {}}
        >
          <div className="flex items-start justify-between">
            <div>
              <div className="font-sora font-700 text-lg" style={{ color: 'var(--fg)' }}>Free Tier</div>
              <div className="text-3xl font-sora font-700 mt-2" style={{ color: 'var(--fg)' }}>$0</div>
              <div className="text-xs text-muted">Standard incident tracking</div>
            </div>
            {!localPremium && (
              <span className="chip" style={{ background: 'var(--accent-soft)', color: 'var(--accent)', borderColor: 'var(--accent)' }}>
                Current plan
              </span>
            )}
          </div>
          <ul className="space-y-2.5">
            {FREE_FEATURES.map((f) => (
              <li key={f} className="flex items-center gap-2.5 text-sm text-muted">
                <CheckCircle size={14} style={{ color: 'var(--ok)' }} /> {f}
              </li>
            ))}
          </ul>
        </div>

        {/* Pro Plan */}
        <div
          className="card p-6 space-y-5 relative overflow-hidden"
          style={localPremium ? { borderColor: 'var(--accent)', borderWidth: 2 } : {}}
        >
          {/* Top highlight bar */}
          <div
            className="absolute top-0 left-0 right-0 h-1.5"
            style={{
              background: 'linear-gradient(90deg, #4285F4, #9B72CB, #D96570, #F4B400, #00C853)',
            }}
          />

          <div className="flex items-start justify-between pt-1">
            <div>
              <div className="flex items-center gap-2">
                <div className="font-sora font-700 text-lg" style={{ color: 'var(--fg)' }}>Cyber Hawk Pro</div>
                {localPremium && (
                  <span
                    className="chip text-[11px] font-bold flex items-center gap-1"
                    style={{ background: 'var(--ok-soft)', color: 'var(--ok)', borderColor: 'var(--ok)' }}
                  >
                    <CheckCircle size={11} /> Active
                  </span>
                )}
              </div>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-3xl font-sora font-700" style={{ color: 'var(--fg)' }}>$29.00</span>
                <span className="text-xs text-muted">/ month</span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-700 dark:text-teal-300 border border-teal-500/20">
                  ₹1 Demo Active
                </span>
              </div>
              <div className="text-xs text-muted mt-1">Unlock live port scans & automated CVE correlation</div>
            </div>
          </div>

          <ul className="space-y-2.5">
            {PREM_FEATURES.map((f) => (
              <li
                key={f}
                className="flex items-center gap-2.5 text-sm"
                style={{ color: localPremium ? 'var(--fg)' : 'var(--muted)' }}
              >
                <CheckCircle size={14} style={{ color: localPremium ? 'var(--accent)' : 'var(--ok)' }} />
                <span>{f}</span>
              </li>
            ))}
          </ul>

          {localPremium ? (
            <div className="pt-2">
              <button
                onClick={handleDowngrade}
                disabled={processing}
                className="btn btn-outline btn-sm w-full justify-center text-xs"
              >
                Downgrade to Free plan (testing)
              </button>
            </div>
          ) : (
            <div className="space-y-3 pt-2">
              {/* Option A: UPI QR Code (₹1 Demo) */}
              <button
                id="upi-upgrade-btn"
                onClick={() => handleOpenUpiModal()}
                disabled={processing}
                className="btn btn-primary w-full justify-center shadow-md py-2.5 font-medium flex items-center gap-2 text-sm"
                style={{
                  background: 'linear-gradient(135deg, #0f766e, #0d9488)',
                }}
              >
                <QrCode size={18} />
                <span>Pay ₹1 with UPI QR Code (Instant Demo)</span>
              </button>

              {/* Option B: Real Stripe Card Payment */}
              <button
                id="stripe-upgrade-btn"
                onClick={handleStartStripeCheckout}
                disabled={processing}
                className="btn btn-outline w-full justify-center py-2.5 text-xs font-medium flex items-center gap-2"
              >
                <CreditCard size={15} />
                <span>Pay with Card (Stripe Checkout)</span>
                <ExternalLink size={12} className="opacity-60 ml-auto" />
              </button>

              {/* Quick direct bypass */}
              <div className="text-center pt-1">
                <button
                  onClick={handleDirectUpgrade}
                  disabled={processing}
                  className="text-[11px] text-muted hover:text-accent underline transition-colors"
                >
                  ⚡ Direct 1-Click Upgrade (Dev Sandbox)
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Invoices History Table ───────────────────────────────────────────── */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-sm" style={{ color: 'var(--fg)' }}>Invoices & Billing Receipts</h2>
          <span className="text-xs text-muted">Persisted in Supabase Database</span>
        </div>

        {invoices.length === 0 ? (
          <p className="text-sm text-muted py-4 text-center">No invoice records generated yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--line)' }}>
                  {['Invoice Number', 'Issue Date', 'Amount', 'Currency', 'Payment Status'].map((h) => (
                    <th key={h} className="text-left px-3.5 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} className="border-b" style={{ borderColor: 'var(--line)' }}>
                    <td className="px-3.5 py-3 font-mono text-xs font-semibold" style={{ color: 'var(--fg)' }}>
                      {inv.invoice_number}
                    </td>
                    <td className="px-3.5 py-3 text-xs text-muted">
                      {formatDateTime(inv.created_at)}
                    </td>
                    <td className="px-3.5 py-3 font-semibold tabular-nums" style={{ color: 'var(--fg)' }}>
                      {inv.currency?.toLowerCase() === 'inr'
                        ? `₹${(inv.amount_cents / 100).toFixed(2)}`
                        : `$${(inv.amount_cents / 100).toFixed(2)}`}
                    </td>
                    <td className="px-3.5 py-3 text-xs uppercase font-mono text-muted">
                      {inv.currency}
                    </td>
                    <td className="px-3.5 py-3">
                      <span
                        className="chip text-[10px] font-bold"
                        style={{ background: 'var(--ok-soft)', color: 'var(--ok)', borderColor: 'var(--ok)' }}
                      >
                        ✓ PAID
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Webhook Security Telemetry ───────────────────────────────────────── */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-sm" style={{ color: 'var(--fg)' }}>Payment Telemetry & Webhook Audit</h2>
            <span className="chip text-[10px]">Real-Time Feed</span>
          </div>
        </div>

        {webhookEvents.length === 0 ? (
          <div className="text-xs text-muted py-3">No payment events logged yet.</div>
        ) : (
          <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
            {webhookEvents.map((evt) => (
              <div
                key={evt.id}
                className="flex items-center gap-3 p-2.5 rounded-lg text-xs"
                style={{ background: 'var(--surface-2)' }}
              >
                <span
                  className="font-bold px-1.5 py-0.5 rounded text-[10px] flex-shrink-0"
                  style={{
                    background: evt.status_code < 300 ? 'var(--ok-soft)' : 'var(--critical-soft)',
                    color: evt.status_code < 300 ? 'var(--ok)' : 'var(--critical)',
                  }}
                >
                  {evt.status_code}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-mono font-medium truncate" style={{ color: 'var(--accent)' }}>
                    {evt.event_type}
                  </div>
                  <div className="text-muted mt-0.5">{evt.message}</div>
                </div>
                <span className="text-muted flex-shrink-0 text-[11px]">{formatRelativeTime(evt.received_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* ── MODAL: Dynamic 5-Minute UPI QR Code Payment (₹1 Demo) ───────────── */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <Modal
        isOpen={upiModalOpen}
        onClose={() => setUpiModalOpen(false)}
        title="UPI Payment — Cyber Hawk Pro"
        footer={
          <div className="flex items-center justify-between w-full">
            <button onClick={() => setUpiModalOpen(false)} className="btn btn-outline text-xs">
              Close
            </button>
            {timeLeft > 0 ? (
              <div className="flex items-center gap-2">
                <button
                  id="simulate-upi-btn"
                  onClick={handleConfirmUpi}
                  disabled={processing}
                  className="btn btn-outline text-xs flex items-center gap-1.5"
                  title="Simulate instant payment verification for testing"
                >
                  <Zap size={13} className="text-amber-500" />
                  <span>Instant Demo Verify</span>
                </button>
                <button
                  id="verify-upi-btn"
                  onClick={handleConfirmUpi}
                  disabled={processing}
                  className="btn btn-primary text-xs flex items-center gap-1.5"
                  style={{ background: 'var(--accent)' }}
                >
                  <CheckCircle size={14} />
                  <span>{processing ? 'Verifying…' : 'I Have Paid ₹1 (Activate Pro)'}</span>
                </button>
              </div>
            ) : (
              <button
                onClick={() => handleOpenUpiModal(customVpa)}
                disabled={processing}
                className="btn btn-primary text-xs flex items-center gap-1.5"
              >
                <RefreshCw size={14} />
                <span>Generate New QR Code</span>
              </button>
            )}
          </div>
        }
      >
        <div className="space-y-4">
          {/* 5-Minute Live Countdown Timer Pill */}
          <div
            className={`p-2.5 rounded-xl flex items-center justify-between border ${
              timeLeft > 60
                ? 'bg-teal-500/10 border-teal-500/30 text-teal-800 dark:text-teal-200'
                : timeLeft > 0
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-800 dark:text-amber-200'
                : 'bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <Clock size={15} className={timeLeft > 0 ? 'animate-pulse' : ''} />
              <span className="text-xs font-semibold">
                {timeLeft > 0 ? 'QR Code Valid for 5 Minutes' : 'QR Code Expired'}
              </span>
            </div>
            <div className="font-mono font-bold text-xs tracking-widest px-2.5 py-0.5 rounded-lg bg-black/10 dark:bg-white/10">
              {formatTime(timeLeft)}
            </div>
          </div>

          {/* QR Code Container */}
          <div className="flex flex-col items-center justify-center p-3.5 rounded-2xl bg-white border border-slate-200 shadow-md relative">
            {qrCodeDataUrl ? (
              <div className={`relative ${timeLeft <= 0 ? 'filter blur-sm opacity-40' : ''}`}>
                <img
                  src={qrCodeDataUrl}
                  alt="Scan UPI QR Code to pay ₹1.00"
                  className="w-56 h-56 rounded-lg object-contain"
                />
              </div>
            ) : (
              <div className="w-56 h-56 flex items-center justify-center text-xs text-muted">
                Generating QR code…
              </div>
            )}

            {/* Expired Overlay */}
            {timeLeft <= 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-xs rounded-2xl text-white p-4 text-center">
                <AlertCircle size={28} className="text-red-400 mb-2" />
                <div className="font-bold text-sm">QR Code Expired</div>
                <div className="text-xs text-white/80 mt-1 mb-3">5 minutes elapsed for this session</div>
                <button
                  onClick={() => handleOpenUpiModal(customVpa)}
                  className="btn btn-sm btn-primary text-xs"
                >
                  <RefreshCw size={13} /> Generate Fresh QR
                </button>
              </div>
            )}

            {/* Amount & Merchant Details */}
            <div className="mt-2.5 text-center">
              <div className="text-2xl font-bold font-sora text-slate-900">
                ₹1.00 <span className="text-xs font-normal text-slate-500">INR</span>
              </div>
              <div className="text-xs font-semibold text-teal-700 mt-0.5">
                Cyber Hawk Security Pro Activation
              </div>
            </div>
          </div>

          {/* Interactive Payee VPA / Custom UPI handle */}
          <div className="p-3 rounded-xl border space-y-2" style={{ background: 'var(--surface-2)', borderColor: 'var(--line)' }}>
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-medium text-muted flex-shrink-0">
                Receiving UPI ID:
              </label>
              <div className="flex items-center gap-1.5 flex-1 max-w-[240px]">
                <input
                  type="text"
                  value={customVpa}
                  onChange={(e) => handleVpaChange(e.target.value)}
                  placeholder="e.g. yourname@okaxis"
                  className="input input-sm text-xs font-mono w-full px-2 py-1 border text-right font-semibold"
                  style={{ color: 'var(--fg)' }}
                  title="Enter your real PhonePe / GPay / Paytm UPI ID to receive the ₹1 test payment directly!"
                />
                <button
                  onClick={handleCopyVpa}
                  className="btn-icon p-1 text-muted hover:text-accent transition-colors flex-shrink-0"
                  title="Copy UPI ID"
                >
                  {copiedVpa ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
                </button>
              </div>
            </div>

            <div className="text-[11px] text-muted flex items-start gap-1">
              <span>💡</span>
              <span>
                To test a live ₹1 payment with PhonePe/GPay, enter <strong>your personal UPI ID</strong> above (e.g. <code>yourname@okhdfcbank</code> or <code>yourname@paytm</code>). The QR updates instantly!
              </span>
            </div>
          </div>

          {/* Supported Apps Chips */}
          <div className="flex items-center justify-center gap-2 flex-wrap">
            {['Google Pay', 'PhonePe', 'Paytm', 'BHIM UPI', 'Cred'].map((app) => (
              <span
                key={app}
                className="text-[10px] font-medium px-2 py-0.5 rounded-md border text-muted"
                style={{ background: 'var(--surface)', borderColor: 'var(--line)' }}
              >
                {app}
              </span>
            ))}
          </div>

          {/* Optional UTR input & mobile deep-link */}
          <div className="space-y-2 pt-1 border-t" style={{ borderColor: 'var(--line)' }}>
            {upiData?.upi_string && (
              <a
                href={upiData.upi_string}
                className="btn btn-outline btn-sm w-full justify-center text-xs lg:hidden"
              >
                <ExternalLink size={13} /> Open in Installed UPI App
              </a>
            )}

            <div>
              <label className="text-[11px] text-muted block mb-1">
                12-digit UPI Reference / UTR Number (Optional):
              </label>
              <input
                type="text"
                value={utrInput}
                onChange={(e) => setUtrInput(e.target.value)}
                placeholder="e.g. 430182940182"
                maxLength={20}
                className="input input-sm w-full font-mono text-xs"
              />
            </div>
          </div>
        </div>
      </Modal>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* ── MODAL: Stripe Card Checkout Status ──────────────────────────────── */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <Modal
        isOpen={stripeModalOpen}
        onClose={() => setStripeModalOpen(false)}
        title="Stripe Checkout Portal"
        footer={
          <div className="flex items-center justify-between w-full">
            <button onClick={() => setStripeModalOpen(false)} className="btn btn-outline text-xs">
              Close
            </button>
            <button
              onClick={handleCheckStripeStatus}
              disabled={processing}
              className="btn btn-primary text-xs flex items-center gap-1.5"
            >
              <CheckCircle size={14} />
              <span>{processing ? 'Verifying…' : 'Verify Stripe Payment'}</span>
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="p-4 rounded-xl" style={{ background: 'var(--surface-2)' }}>
            <div className="flex items-center justify-between mb-2">
              <div className="font-sora font-semibold text-base" style={{ color: 'var(--fg)' }}>
                Cyber Hawk Pro Plan
              </div>
              <div className="font-sora font-bold text-xl" style={{ color: 'var(--fg)' }}>
                $29.00
              </div>
            </div>
            <div className="text-xs text-muted">Billed to: {user?.email}</div>
            <div className="text-xs text-muted truncate mt-0.5">Session: {stripeSession?.session_id}</div>
          </div>

          <div className="p-3 rounded-lg text-xs flex items-start gap-2" style={{ background: 'var(--accent-soft)', color: 'var(--fg)' }}>
            <ExternalLink size={16} className="text-teal-600 flex-shrink-0 mt-0.5" />
            <div>
              <strong>Stripe Hosted Checkout</strong> opened in your browser window. You can enter credit card, debit card, or Google Pay details securely on Stripe's domain.
              <div className="mt-2">
                Once payment completes, click <strong>Verify Stripe Payment</strong> below or return to this tab.
              </div>
            </div>
          </div>

          {stripeSession?.url && (
            <a
              href={stripeSession.url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-outline btn-sm w-full justify-center text-xs flex items-center gap-1.5"
            >
              <ExternalLink size={13} /> Re-open Stripe Checkout Page
            </a>
          )}
        </div>
      </Modal>
    </div>
  );
}
