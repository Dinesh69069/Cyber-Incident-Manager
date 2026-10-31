/**
 * SeverityPill.jsx — severity badge with colored dot and score
 * StatusPill.jsx   — incident status badge
 * Modal.jsx        — reusable centered modal with scrim and escape-key close
 * Chip.jsx         — small info chip
 */

// ── SeverityPill ──────────────────────────────────────────────────────────────
export default function SeverityPill({ severity, score }) {
  const map = {
    Critical: 'severity-critical',
    High:     'severity-high',
    Medium:   'severity-medium',
    Low:      'severity-low',
  };
  const cls = map[severity] || 'severity-low';
  return (
    <span className={`severity-pill ${cls}`} aria-label={`Severity: ${severity}`}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: 'currentColor' }} />
      {score != null ? `${score} · ` : ''}{severity}
    </span>
  );
}
