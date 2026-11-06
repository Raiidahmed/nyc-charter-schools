import { useEffect, useId, useRef, type ReactNode } from 'react';
import { CloseIcon } from './icons.tsx';

/** A real modal dialog (the browser's own), with a close button that stays visible. */
export function Dialog({
  open,
  onClose,
  title,
  className = '',
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  className?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`dialog ${className}`}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      {open && (
        <div className="dialog-frame">
          <header className="dialog-header">
            <h2 id={titleId} className="dialog-title">
              {title}
            </h2>
            <button type="button" className="icon-button" onClick={onClose} aria-label="Close" title="Close">
              <CloseIcon />
            </button>
          </header>
          <div className="dialog-body">{children}</div>
          {footer && <footer className="dialog-footer">{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}
