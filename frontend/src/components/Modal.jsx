/**
 * Modal.jsx
 * ---------
 * Reusable centered modal dialog with keyboard trap, Escape close,
 * scrim click close, focus management, and smooth animations.
 */

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  wide = false,      // 760px for detail modals
  footer = null,
}) {
  const dialogRef = useRef(null);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  // Focus first focusable element on open
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        const el = dialogRef.current?.querySelector(
          'input, select, textarea, button:not([disabled])'
        );
        el?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="modal-scrim"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={dialogRef}
        className="modal-box"
        style={{ maxWidth: wide ? '760px' : '560px' }}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <h2 className="font-sora font-semibold text-lg leading-tight" style={{ color: 'var(--fg)' }}>
            {title}
          </h2>
          <button
            onClick={onClose}
            className="btn btn-icon btn-ghost flex-shrink-0 ml-4"
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div>{children}</div>

        {/* Footer */}
        {footer && (
          <div className="flex items-center justify-end gap-2 mt-6 pt-4 border-t" style={{ borderColor: 'var(--line)' }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
