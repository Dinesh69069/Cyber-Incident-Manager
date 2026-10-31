/**
 * KanbanBoard.jsx
 * ---------------
 * Three-column Kanban board for incidents (Open / In Progress / Resolved).
 * Supports HTML5 drag-and-drop between columns.
 * Cards are sorted by calculated_score descending.
 */

import { useState, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import SeverityPill from './SeverityPill';
import StatusPill from './StatusPill';
import { formatRelativeTime } from '../utils/time';

const COLUMNS = [
  { id: 'Open',        label: 'Open',        status: 'Open' },
  { id: 'In Progress', label: 'In Progress',  status: 'In Progress' },
  { id: 'Resolved',    label: 'Resolved',     status: 'Resolved' },
];

export default function KanbanBoard({ incidents, onStatusChange, onCardClick }) {
  const [draggingId, setDraggingId] = useState(null);
  const [overColumn, setOverColumn] = useState(null);
  const dragTarget = useRef(null);

  const grouped = COLUMNS.reduce((acc, col) => {
    acc[col.id] = incidents
      .filter((i) => i.status === col.status)
      .sort((a, b) => (b.calculated_score ?? 0) - (a.calculated_score ?? 0));
    return acc;
  }, {});

  // ── Drag handlers ───────────────────────────────────────────────────────────
  const handleDragStart = (e, incident) => {
    setDraggingId(incident.id);
    dragTarget.current = incident;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(incident.id));
  };

  const handleDragEnd = () => {
    setDraggingId(null);
    setOverColumn(null);
    dragTarget.current = null;
  };

  const handleDragOver = (e, colId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setOverColumn(colId);
  };

  const handleDrop = (e, colId) => {
    e.preventDefault();
    const incident = dragTarget.current;
    if (incident && incident.status !== colId) {
      onStatusChange(incident.id, colId);
    }
    setDraggingId(null);
    setOverColumn(null);
    dragTarget.current = null;
  };

  return (
    <div
      className="flex gap-4 overflow-x-auto pb-2"
      style={{ minWidth: '880px' }}
    >
      {COLUMNS.map((col) => {
        const cards = grouped[col.id] || [];
        const isDragTarget = overColumn === col.id;

        return (
          <div
            key={col.id}
            className={`flex-1 min-w-[260px] rounded-card p-3 transition-all duration-150 kanban-col ${isDragTarget ? 'drag-over' : ''}`}
            style={{ background: 'var(--surface-2)', border: '1px solid var(--line)' }}
            onDragOver={(e) => handleDragOver(e, col.id)}
            onDragLeave={() => setOverColumn(null)}
            onDrop={(e) => handleDrop(e, col.id)}
          >
            {/* Column header */}
            <div className="flex items-center gap-2 mb-3 px-1">
              <StatusPill status={col.status} />
              <span className="text-xs text-muted tabular-nums">({cards.length})</span>
            </div>

            {/* Cards */}
            <div className="space-y-2.5">
              {cards.length === 0 ? (
                <div
                  className="flex items-center justify-center h-24 rounded-lg border-2 border-dashed text-xs text-muted"
                  style={{ borderColor: 'var(--line)' }}
                >
                  Drop an incident here
                </div>
              ) : (
                cards.map((incident, idx) => (
                  <KanbanCard
                    key={incident.id}
                    incident={incident}
                    columnCards={cards}
                    index={idx}
                    isDragging={draggingId === incident.id}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    onStatusChange={onStatusChange}
                    onClick={() => onCardClick(incident)}
                    columns={COLUMNS}
                  />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function KanbanCard({ incident, columnCards, index, isDragging, onDragStart, onDragEnd, onStatusChange, onClick, columns }) {
  const colIndex = columns.findIndex((c) => c.id === incident.status);

  const moveBack = (e) => {
    e.stopPropagation();
    if (colIndex > 0) onStatusChange(incident.id, columns[colIndex - 1].id);
  };

  const moveForward = (e) => {
    e.stopPropagation();
    if (colIndex < columns.length - 1) onStatusChange(incident.id, columns[colIndex + 1].id);
  };

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, incident)}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={`
        card p-3 cursor-pointer select-none
        hover:border-accent transition-all duration-150 group
        ${isDragging ? 'opacity-40 scale-95' : ''}
      `}
      style={{ borderColor: isDragging ? 'var(--accent)' : undefined }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
      aria-label={`Incident: ${incident.title}`}
    >
      {/* Severity + Score */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <SeverityPill severity={incident.severity} score={incident.calculated_score} />
        <span className="text-[10px] text-muted font-mono tabular-nums">
          #{incident.id}
        </span>
      </div>

      {/* Title */}
      <div className="text-sm font-medium leading-snug mb-2 group-hover:text-accent transition-colors line-clamp-2">
        {incident.title}
      </div>

      {/* Asset + Age */}
      <div className="flex items-center justify-between text-xs text-muted">
        <span className="truncate">{incident.asset_name || 'No asset'}</span>
        <span className="tabular-nums flex-shrink-0">{formatRelativeTime(incident.created_at)}</span>
      </div>

      {/* Arrow buttons */}
      <div className="flex items-center justify-end gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={moveBack}
          disabled={colIndex === 0}
          className="btn btn-ghost btn-icon btn-sm disabled:opacity-20"
          aria-label="Move back"
          title="Move back"
        >
          <ChevronLeft size={14} />
        </button>
        <button
          onClick={moveForward}
          disabled={colIndex === columns.length - 1}
          className="btn btn-ghost btn-icon btn-sm disabled:opacity-20"
          aria-label="Move forward"
          title="Move forward"
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
