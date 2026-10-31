/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sora: ['Sora', 'sans-serif'],
        plex: ['"IBM Plex Sans"', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
      colors: {
        bg:          { DEFAULT: '#f2f5f9', dark: '#0a121e' },
        surface:     { DEFAULT: '#ffffff', dark: '#111d2e' },
        surface2:    { DEFAULT: '#f7f9fc', dark: '#0e1927' },
        line:        { DEFAULT: '#e0e6ef', dark: '#203048' },
        fg:          { DEFAULT: '#0f1b2d', dark: '#e8eef7' },
        muted:       { DEFAULT: '#5a6a82', dark: '#8fa1ba' },
        accent:      { DEFAULT: '#0b7f77', dark: '#2dd4bf' },
        'accent-soft':{ DEFAULT: '#dcf2ef', dark: '#11373a' },
        rail:        { DEFAULT: '#0d1a2b', dark: '#070f1a' },
        critical:    { DEFAULT: '#d02a3c', soft: '#fde7ea', dark: '#ff7080', 'dark-soft': '#3b1a22' },
        high:        { DEFAULT: '#c9611a', soft: '#fdeddc', dark: '#ff9d52', 'dark-soft': '#38240f' },
        medium:      { DEFAULT: '#9a7406', soft: '#faf0cc', dark: '#f2c64f', 'dark-soft': '#33290d' },
        low:         { DEFAULT: '#2a6cc0', soft: '#e1ecfa', dark: '#6eaef7', 'dark-soft': '#15294a' },
        ok:          { DEFAULT: '#1b8450', soft: '#dcf2e5', dark: '#52d38e', 'dark-soft': '#123423' },
      },
      borderRadius: {
        card: '14px',
        btn:  '8px',
      },
      boxShadow: {
        card: '0 2px 12px 0 rgba(15,27,45,0.08)',
        'card-dark': '0 2px 20px 0 rgba(0,0,0,0.35)',
      },
    },
  },
  plugins: [],
}
