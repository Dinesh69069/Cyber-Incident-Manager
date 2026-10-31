/**
 * Scanner.jsx
 * -----------
 * Port scanner page — Premium-gated.
 * Shows simulated scan flow with a live terminal log, color-coded output,
 * API response preview, CVE results table, and scan history.
 * Free users see a 403 Forbidden simulation with an Upgrade prompt.
 */

import { useState, useEffect, useRef } from 'react';
import { Radar, Lock, CheckCircle, AlertTriangle, Info, Zap } from 'lucide-react';
import { assetsApi, paymentsApi } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import SeverityPill from '../components/SeverityPill';
import { useNavigate } from 'react-router-dom';
import { formatRelativeTime } from '../utils/time';

const PORTS_INFO = [
  { port: 22,   service: 'SSH',      label: '22 SSH' },
  { port: 80,   service: 'HTTP',     label: '80 HTTP' },
  { port: 443,  service: 'HTTPS',    label: '443 HTTPS' },
  { port: 8080, service: 'HTTP-alt', label: '8080 HTTP-alt' },
];

const CVE_CATALOGUE = {
  22:   [
    { id: 'CVE-2023-38408', cvss: 9.8, desc: 'OpenSSH ssh-agent PKCS#11 RCE' },
    { id: 'CVE-2024-6387',  cvss: 8.1, desc: 'regreSSHion — signal handler race in sshd' },
    { id: 'CVE-2023-48795', cvss: 5.9, desc: 'Terrapin SSH prefix truncation attack' },
  ],
  80:   [
    { id: 'CVE-2021-42013', cvss: 9.8, desc: 'Apache path traversal and RCE via mod_cgi' },
    { id: 'CVE-2022-31813', cvss: 9.8, desc: 'Apache mod_proxy X-Forwarded-For bypass' },
    { id: 'CVE-2021-41773', cvss: 7.5, desc: 'Apache path traversal — document root escape' },
  ],
  443:  [
    { id: 'CVE-2014-0160',  cvss: 7.5, desc: 'Heartbleed — OpenSSL TLS memory disclosure' },
    { id: 'CVE-2022-0778',  cvss: 7.5, desc: 'OpenSSL BN_mod_sqrt infinite loop (DoS)' },
    { id: 'CVE-2023-44487', cvss: 7.5, desc: 'HTTP/2 Rapid Reset DDoS amplification' },
  ],
  8080: [
    { id: 'CVE-2022-22965', cvss: 9.8, desc: 'Spring4Shell — Spring Framework RCE' },
    { id: 'CVE-2020-1938',  cvss: 9.8, desc: 'Ghostcat — Apache Tomcat AJP file read' },
    { id: 'CVE-2017-12615', cvss: 8.1, desc: 'Tomcat JSP upload via PUT — RCE' },
  ],
};

// Deterministic open/closed state per IP and port (seeded hash)
function isPortOpen(ip, port) {
  const probs = { 22: 0.72, 80: 0.70, 443: 0.75, 8080: 0.45 };
  const hashStr = `${ip}:${port}`;
  let hash = 0;
  for (let i = 0; i < hashStr.length; i++) hash = (hash << 5) - hash + hashStr.charCodeAt(i);
  const norm = (Math.abs(hash) % 100) / 100;
  return norm < (probs[port] || 0.5);
}

function severity(cvss) {
  if (cvss >= 9.0) return 'Critical';
  if (cvss >= 7.0) return 'High';
  if (cvss >= 4.0) return 'Medium';
  return 'Low';
}

export default function Scanner() {
  const { isPremium, updateUser } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [assets, setAssets]         = useState([]);
  const [selectedAsset, setSelectedAsset] = useState('');
  const [authorized, setAuthorized] = useState(false);
  const [scanning, setScanning]     = useState(false);
  const [upgrading, setUpgrading]   = useState(false);
  const [logs, setLogs]             = useState([]);
  const [apiResponse, setApiResponse] = useState(null);
  const [results, setResults]       = useState([]);
  const [history, setHistory]       = useState([]);
  const logRef = useRef(null);

  const handleInstantUpgrade = async () => {
    setUpgrading(true);
    try {
      const res = await paymentsApi.upgrade();
      if (res.data?.access_token) {
        updateUser({ is_premium: true }, res.data.access_token);
      } else {
        updateUser({ is_premium: true });
      }
      toast.success('🎉 Premium plan unlocked! You can now launch active scans.');
    } catch {
      toast.error('Could not upgrade automatically. Redirecting to billing...');
      navigate('/billing');
    } finally {
      setUpgrading(false);
    }
  };

  useEffect(() => {
    assetsApi.list().then((r) => setAssets(r.data)).catch(() => {});
  }, []);

  // Auto-scroll logs
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  const addLog = (text, type = 'info') => {
    setLogs((prev) => [...prev, { text, type, ts: new Date().toISOString() }]);
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const runScan = async () => {
    if (!selectedAsset) { toast.error('Select an asset to scan.'); return; }
    if (!authorized)    { toast.error('You must confirm authorization.'); return; }

    const asset = assets.find((a) => a.id === parseInt(selectedAsset));
    if (!asset) return;

    setLogs([]);
    setResults([]);
    setApiResponse(null);
    setScanning(true);

    addLog(`→ POST /api/scans  { asset_id: ${asset.id} }`, 'info');
    await sleep(400);

    if (!isPremium) {
      // ── Free user: 403 simulation ─────────────────────────────────────────
      addLog('← HTTP 403 Forbidden', 'error');
      addLog('Scan rejected — premium subscription required.', 'error');
      setApiResponse({
        status: 403,
        body: { detail: 'Premium subscription required to run network scans.' },
      });
      toast.error('403 Forbidden — upgrade to Premium to scan.');
      setScanning(false);
      return;
    }

    // ── Premium: simulated scan flow ──────────────────────────────────────
    addLog(`← HTTP 202 Accepted`, 'ok');
    addLog(`Scan initiated on ${asset.asset_name} (${asset.ip_address})`, 'info');
    await sleep(300);

    const portResults = [];
    let openCount = 0;
    let totalCves = 0;

    for (const { port, service } of PORTS_INFO) {
      addLog(`Testing port ${port}/${service} …`, 'info');
      await sleep(380);

      const open = isPortOpen(asset.ip_address, port);
      if (open) {
        addLog(`✓ Port ${port}/${service} — OPEN`, 'ok');
        openCount++;
        await sleep(250);
        addLog(`  Querying CVE database for port ${port} …`, 'info');
        await sleep(320);

        const portCves = CVE_CATALOGUE[port].slice(0, 2);
        totalCves += portCves.length;

        for (const cve of portCves) {
          const sev = severity(cve.cvss);
          const logType = sev === 'Critical' ? 'error' : sev === 'High' ? 'warn' : 'info';
          addLog(`  ↳ ${cve.id} (CVSS ${cve.cvss}) — ${sev}: ${cve.desc}`, logType);
          if (cve.cvss >= 9.0) {
            addLog(`  ⚠ Critical incident auto-created for ${cve.id}`, 'warn');
          }
        }

        portResults.push({ port, service, state: 'open', cves: portCves });
      } else {
        addLog(`✗ Port ${port}/${service} — closed`, 'info');
        portResults.push({ port, service, state: 'closed', cves: [] });
      }
      await sleep(100);
    }

    addLog(`━━━ Scan complete ━━━`, 'ok');
    addLog(`${openCount} open ports · ${totalCves} CVEs discovered`, 'ok');

    const responseBody = {
      asset_id:    asset.id,
      asset_name:  asset.asset_name,
      ip_address:  asset.ip_address,
      open_ports:  openCount,
      total_cves:  totalCves,
      results:     portResults,
    };

    setApiResponse({ status: 200, body: responseBody });
    setResults(portResults);

    // Record history
    setHistory((prev) => [{
      asset:      asset.asset_name,
      ip:         asset.ip_address,
      time:       new Date().toISOString(),
      openPorts:  openCount,
      cveCount:   totalCves,
    }, ...prev.slice(0, 9)]);

    toast.success(`Scan complete: ${openCount} open ports, ${totalCves} CVEs found.`);
    setScanning(false);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-sora font-700 text-xl flex items-center gap-2" style={{ color: 'var(--fg)' }}>
            Port Scanner
            {isPremium
              ? <span className="chip text-xs" style={{ background: 'var(--ok-soft)', color: 'var(--ok)', borderColor: 'var(--ok)' }}>
                  <CheckCircle size={10} /> Premium unlocked
                </span>
              : <span className="chip text-xs" style={{ background: 'var(--critical-soft)', color: 'var(--critical)', borderColor: 'var(--critical)' }}>
                  <Lock size={10} /> Premium required
                </span>
            }
          </h1>
          <p className="text-sm text-muted mt-0.5">Network port analysis with live CVE enrichment</p>
        </div>
      </div>

      {/* Free user banner */}
      {!isPremium && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-card text-sm"
             style={{ background: 'var(--medium-soft)', border: '1px solid var(--medium)', color: 'var(--medium)' }}>
          <div className="flex items-center gap-2.5">
            <AlertTriangle size={16} className="flex-shrink-0" />
            <span>
              Scans are locked on the free plan. Upgrade to Premium to run active TCP port scans and live CVE lookups.
            </span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={handleInstantUpgrade}
              disabled={upgrading}
              className="btn btn-sm shadow-sm"
              style={{ background: 'var(--accent)', color: '#fff' }}
            >
              <Zap size={13} /> {upgrading ? 'Upgrading…' : 'Upgrade to Premium Now'}
            </button>
            <button
              onClick={() => navigate('/billing')}
              className="btn btn-outline btn-sm"
            >
              Billing
            </button>
          </div>
        </div>
      )}

      {/* Main panel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* ── Target Card ──────────────────────────────────────────────────── */}
        <div className="card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm" style={{ color: 'var(--fg)' }}>Target</h2>
            <span className="chip">Simulated engine</span>
          </div>

          <div>
            <label htmlFor="scan-asset" className="input-label">Asset</label>
            <select
              id="scan-asset"
              className="input"
              value={selectedAsset}
              onChange={(e) => setSelectedAsset(e.target.value)}
            >
              <option value="">— Select an asset —</option>
              {assets.map((a) => (
                <option key={a.id} value={a.id}>{a.asset_name} ({a.ip_address})</option>
              ))}
            </select>
          </div>

          {/* Port chips */}
          <div>
            <div className="input-label mb-2">Ports to scan</div>
            <div className="flex flex-wrap gap-2">
              {PORTS_INFO.map(({ label }) => (
                <span key={label} className="chip" style={{ background: 'var(--accent-soft)', color: 'var(--accent)', borderColor: 'var(--accent)' }}>
                  {label}
                </span>
              ))}
            </div>
          </div>

          {/* Authorization checkbox */}
          <div className="flex items-start gap-2">
            <input
              id="scan-auth"
              type="checkbox"
              className="mt-0.5 accent-teal-600"
              checked={authorized}
              onChange={(e) => setAuthorized(e.target.checked)}
            />
            <label htmlFor="scan-auth" className="text-xs text-muted cursor-pointer select-none">
              I am authorized to scan this asset. Only scan systems you own or have written permission to test.
            </label>
          </div>

          <button
            id="run-scan-btn"
            onClick={runScan}
            disabled={scanning || !selectedAsset || !authorized}
            className="btn btn-primary w-full justify-center"
          >
            <Radar size={16} />
            {scanning ? 'Scanning…' : 'Run scan'}
          </button>

          <p className="text-[11px] text-muted leading-relaxed">
            <Info size={11} className="inline mr-1 opacity-60" />
            This prototype generates deterministic open/closed states and CVE data from a local catalogue.
            The real FastAPI <code className="font-mono bg-surface-2 px-1 rounded">scanner.py</code> uses
            Python <code className="font-mono">socket</code> connections and the CIRCL CVE-Search API.
          </p>
        </div>

        {/* ── Live Log Card ─────────────────────────────────────────────────── */}
        <div className="card p-5 space-y-4">
          <h2 className="font-semibold text-sm" style={{ color: 'var(--fg)' }}>Live log</h2>

          <div ref={logRef} className="terminal-box">
            {logs.length === 0 ? (
              <span className="log-info opacity-50">Awaiting scan…</span>
            ) : (
              logs.map((log, i) => (
                <div key={i} className={`log-${log.type} leading-relaxed`}>
                  {log.text}
                </div>
              ))
            )}
          </div>

          {/* API response */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs text-muted font-semibold uppercase tracking-wider">API Response</span>
              {apiResponse && (
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{
                    background: apiResponse.status < 300 ? 'var(--ok-soft)' : 'var(--critical-soft)',
                    color: apiResponse.status < 300 ? 'var(--ok)' : 'var(--critical)',
                  }}
                >
                  {apiResponse.status}
                </span>
              )}
            </div>
            <pre
              className="text-[11px] font-mono p-3 rounded-btn overflow-auto max-h-52"
              style={{ background: '#040d18', color: '#c0d4ed' }}
            >
              {apiResponse
                ? JSON.stringify(apiResponse.body, null, 2)
                : '// No response yet'
              }
            </pre>
          </div>
        </div>
      </div>

      {/* ── Results Table ─────────────────────────────────────────────────── */}
      {results.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b flex items-center gap-2" style={{ borderColor: 'var(--line)' }}>
            <Zap size={14} style={{ color: 'var(--accent)' }} />
            <h3 className="font-semibold text-sm" style={{ color: 'var(--fg)' }}>Scan results</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--line)' }}>
                  {['Port', 'Service', 'State', 'CVE', 'CVSS', 'Severity'].map((h) => (
                    <th key={h} className="text-left px-4 py-2.5 font-semibold uppercase tracking-wider text-muted">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.flatMap((r) =>
                  r.state === 'open' ? r.cves.map((cve, i) => (
                    <tr key={`${r.port}-${i}`} className="border-b" style={{ borderColor: 'var(--line)' }}>
                      {i === 0 && <td rowSpan={r.cves.length} className="px-4 py-2.5 font-mono font-semibold tabular-nums" style={{ color: 'var(--fg)' }}>{r.port}</td>}
                      {i === 0 && <td rowSpan={r.cves.length} className="px-4 py-2.5 text-muted">{r.service}</td>}
                      {i === 0 && (
                        <td rowSpan={r.cves.length} className="px-4 py-2.5">
                          <span className="status-pill status-resolved text-[10px]">OPEN</span>
                        </td>
                      )}
                      <td className="px-4 py-2.5 font-mono" style={{ color: 'var(--accent)' }}>
                        <a href={`https://nvd.nist.gov/vuln/detail/${cve.id}`} target="_blank" rel="noreferrer"
                           className="hover:underline">{cve.id}</a>
                      </td>
                      <td className="px-4 py-2.5 tabular-nums">{cve.cvss}</td>
                      <td className="px-4 py-2.5"><SeverityPill severity={severity(cve.cvss)} score={cve.cvss} /></td>
                    </tr>
                  )) : (
                    <tr key={r.port} className="border-b" style={{ borderColor: 'var(--line)' }}>
                      <td className="px-4 py-2.5 font-mono tabular-nums text-muted">{r.port}</td>
                      <td className="px-4 py-2.5 text-muted">{r.service}</td>
                      <td className="px-4 py-2.5">
                        <span className="chip text-[10px]">closed</span>
                      </td>
                      <td colSpan={3} className="px-4 py-2.5 text-muted">—</td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Scan History ──────────────────────────────────────────────────── */}
      {history.length > 0 && (
        <div className="card p-5">
          <h3 className="font-semibold text-sm mb-3" style={{ color: 'var(--fg)' }}>Scan history</h3>
          <div className="space-y-2">
            {history.map((h, i) => (
              <div key={i} className="flex items-center gap-4 text-xs py-1.5 border-b last:border-0"
                   style={{ borderColor: 'var(--line)' }}>
                <span className="font-medium" style={{ color: 'var(--fg)' }}>{h.asset}</span>
                <span className="font-mono text-muted">{h.ip}</span>
                <span className="text-muted">{formatRelativeTime(h.time)}</span>
                <span className="ml-auto tabular-nums text-muted">
                  {h.openPorts} open · {h.cveCount} CVEs
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
