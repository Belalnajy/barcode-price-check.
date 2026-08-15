import { useCallback, useEffect, useRef } from 'react';

/**
 * Native <dialog> wrapper: modal semantics, Esc handling and focus trapping
 * come from the platform; this adds click-outside-to-close and a consistent
 * header / body / footer shell.
 */
export default function Dialog({ open, onClose, title, closeLabel, footer, wide = false, children }) {
  const ref = useRef(null);

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.open) dlg.showModal();
    else if (!open && dlg.open) dlg.close();
  }, [open]);

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return undefined;
    const handleClose = () => onClose();
    dlg.addEventListener('close', handleClose);
    return () => dlg.removeEventListener('close', handleClose);
  }, [onClose]);

  /* mousedown, not click: a text selection that ends on the backdrop
     shouldn't dismiss the dialog. */
  const onMouseDown = useCallback((e) => {
    if (e.target === ref.current) ref.current.close();
  }, []);

  return (
    <dialog ref={ref} className={wide ? 'dlg-root is-wide' : 'dlg-root'} onMouseDown={onMouseDown}>
      <div className="dlg">
        <header className="dlg-head">
          <h2>{title}</h2>
          <button
            type="button"
            className="icon-btn"
            aria-label={closeLabel}
            title={closeLabel}
            onClick={() => ref.current?.close()}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>
        <div className="dlg-body">{children}</div>
        {footer ? <footer className="dlg-foot">{footer}</footer> : null}
      </div>
    </dialog>
  );
}
