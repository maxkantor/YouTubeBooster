import React, { useEffect, useRef } from 'react';

function focusableIn(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )].filter((el) => !el.hasAttribute('disabled') && el.tabIndex !== -1);
}

export function AdminConfirmDialog({
  title,
  children,
  cancelLabel = 'Cancel',
  confirmLabel,
  confirmDisabled = false,
  onCancel,
  onConfirm,
  returnFocusRef
}: {
  title: string;
  children: React.ReactNode;
  cancelLabel?: string;
  confirmLabel: string;
  confirmDisabled?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  returnFocusRef?: React.RefObject<HTMLElement | null>;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const initial = focusableIn(dialog || document.body)[0];
    (confirmDisabled ? initial : confirmRef.current || initial)?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancelRef.current();
        return;
      }
      if (e.key !== 'Tab' || !dialog) return;
      const nodes = focusableIn(dialog);
      if (nodes.length === 0) {
        e.preventDefault();
        return;
      }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
      const backTo = returnFocusRef?.current || previouslyFocused;
      backTo?.focus();
    };
  }, [confirmDisabled, returnFocusRef]);

  return (
    <div
      ref={overlayRef}
      className="modal-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === overlayRef.current) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        className="modal-content admin-confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-confirm-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="admin-confirm-title">{title}</h2>
        <div className="admin-confirm-body">{children}</div>
        <div className="admin-confirm-actions">
          <button type="button" className="ops-btn ops-btn-ghost" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className="ops-btn ops-btn-primary"
            disabled={confirmDisabled}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function scrollPanelIfNeeded(el: HTMLElement | null) {
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const viewH = window.innerHeight || document.documentElement.clientHeight;
  if (rect.top < 0 || rect.bottom > viewH) {
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}
