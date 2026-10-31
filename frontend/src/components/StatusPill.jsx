/**
 * StatusPill.jsx — incident status badge component
 */
export default function StatusPill({ status }) {
  const map = {
    'Open':        'status-open',
    'In Progress': 'status-inprogress',
    'Resolved':    'status-resolved',
  };
  const cls = map[status] || 'status-open';
  const dot = {
    'Open':        'bg-gray-400',
    'In Progress': 'bg-blue-400',
    'Resolved':    'bg-green-400',
  }[status] || 'bg-gray-400';

  return (
    <span className={`status-pill ${cls}`} aria-label={`Status: ${status}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}`} />
      {status}
    </span>
  );
}
