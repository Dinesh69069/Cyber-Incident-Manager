/**
 * CyberShieldLogo.jsx
 * -------------------
 * Futuristic Cyber Hawk Shield logo with metallic/neon gradients,
 * layered cybernetic facets, and glowing hawk crest.
 */

export default function CyberShieldLogo({ size = 28, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 44 44"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ overflow: 'visible' }}
    >
      <defs>
        {/* Cyber Neon Shield Border Gradient */}
        <linearGradient id="csl-border" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#2dd4bf" />
          <stop offset="45%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#0f766e" />
        </linearGradient>

        {/* Shield Body Glow */}
        <linearGradient id="csl-body" x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="#14b8a6" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#042f2e" stopOpacity="0.85" />
        </linearGradient>

        {/* Hawk Wings Silver-Teal Gradient */}
        <linearGradient id="csl-hawk" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f0fdfa" />
          <stop offset="50%" stopColor="#99f6e4" />
          <stop offset="100%" stopColor="#2dd4bf" />
        </linearGradient>

        {/* Beak / Core Accent */}
        <linearGradient id="csl-beak" x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#0f766e" />
        </linearGradient>

        {/* Soft Ambient Glow Filter */}
        <filter id="csl-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {/* ── 1. Outer Cyber Shield Hull ────────────────────────────────────────── */}
      <path
        d="M22 3.5 L7 9.5 V21.5 C7 31 13.5 38.5 22 41.5 C30.5 38.5 37 31 37 21.5 V9.5 L22 3.5 Z"
        fill="url(#csl-body)"
        stroke="url(#csl-border)"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />

      {/* ── 2. Inner Telemetry Dashed Contour ─────────────────────────────────── */}
      <path
        d="M22 7.5 L11 12 V20.5 C11 27.5 15.5 33.5 22 36.5 C28.5 33.5 33 27.5 33 20.5 V12 L22 7.5 Z"
        stroke="rgba(45, 212, 191, 0.45)"
        strokeWidth="1.2"
        strokeDasharray="2.5 2"
        fill="none"
      />

      {/* ── 3. Geometric Cyber Hawk Wings (Upper Shield) ─────────────────────── */}
      <path
        d="M22 13 L9.5 17.5 L15.5 23.5 L22 19 L28.5 23.5 L34.5 17.5 L22 13 Z"
        fill="url(#csl-hawk)"
        filter="url(#csl-glow)"
      />

      {/* ── 4. Hawk Beak / Arrow Center (Lower Shield) ───────────────────────── */}
      <path
        d="M22 19.5 L17.5 25.5 L22 31.5 L26.5 25.5 L22 19.5 Z"
        fill="url(#csl-beak)"
        stroke="#2dd4bf"
        strokeWidth="1"
      />

      {/* ── 5. Cyber Core Eye Node (Center Glow) ─────────────────────────────── */}
      <circle cx="22" cy="18.5" r="2" fill="#ffffff" filter="url(#csl-glow)" />
      <circle cx="22" cy="18.5" r="0.8" fill="#0f766e" />
    </svg>
  );
}
