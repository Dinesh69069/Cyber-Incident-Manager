/**
 * time.js — Date/time formatting utilities
 */

/** Format an ISO date string as "X time ago" */
export function formatRelativeTime(isoString) {
  if (!isoString) return '—';
  try {
    const date = new Date(isoString);
    const now = Date.now();
    const diff = now - date.getTime();
    const secs = Math.floor(diff / 1000);
    if (secs < 60)          return 'just now';
    if (secs < 3600)        return `${Math.floor(secs / 60)}m ago`;
    if (secs < 86400)       return `${Math.floor(secs / 3600)}h ago`;
    if (secs < 2592000)     return `${Math.floor(secs / 86400)}d ago`;
    return `${Math.floor(secs / 2592000)}mo ago`;
  } catch {
    return '—';
  }
}

/** Format an ISO date string as "Oct 31, 2026 · 21:25" */
export function formatDateTime(isoString) {
  if (!isoString) return '—';
  try {
    const date = new Date(isoString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return '—';
  }
}

/** Format as short date */
export function formatDate(isoString) {
  if (!isoString) return '—';
  try {
    return new Date(isoString).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  } catch { return '—'; }
}
