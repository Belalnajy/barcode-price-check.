import { useEffect, useRef, useState } from 'react';
import { normalize } from '../lib/format';

/**
 * Camera barcode scanning via html5-qrcode inside a native <dialog>.
 * Calls onScan(code) with the normalized decoded text, then closes.
 */
export default function CameraDialog({ t, open, onClose, onScan }) {
  const dlgRef = useRef(null);
  const scannerRef = useRef(null);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    const dlg = dlgRef.current;
    if (!dlg) return;

    if (open && !dlg.open) {
      setMsg(t.camAim);
      dlg.showModal();
      // Camera library is lazy-loaded only when the dialog opens.
      import('html5-qrcode')
        .then(({ Html5Qrcode }) => {
          if (!dlg.open) return; // dialog closed before the lib loaded
          const scanner = new Html5Qrcode('reader');
          scannerRef.current = scanner;
          return scanner.start(
            { facingMode: 'environment' },
            { fps: 10, qrbox: { width: 260, height: 160 } },
            (text) => {
              const code = normalize(text);
              stop();
              onScan(code);
            },
            () => {}
          );
        })
        .catch((e) => setMsg(e && e.name === 'TypeError' ? t.camNoLib : t.camDenied));
    } else if (!open && dlg.open) {
      stop();
    }

    function stop() {
      const s = scannerRef.current;
      scannerRef.current = null;
      if (s) {
        s.stop().then(() => s.clear()).catch(() => {});
      }
      if (dlg.open) dlg.close();
    }

    return () => { if (!open) return; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /* Stop the camera if the dialog is dismissed via Esc. */
  useEffect(() => {
    const dlg = dlgRef.current;
    if (!dlg) return;
    const handleClose = () => {
      const s = scannerRef.current;
      scannerRef.current = null;
      if (s) s.stop().then(() => s.clear()).catch(() => {});
      onClose();
    };
    dlg.addEventListener('close', handleClose);
    return () => dlg.removeEventListener('close', handleClose);
  }, [onClose]);

  return (
    <dialog ref={dlgRef}>
      <div className="d-head">
        <h2>{t.camera}</h2>
        <button className="ghost" onClick={() => dlgRef.current?.close()}>{t.close}</button>
      </div>
      <div className="d-body">
        <div id="reader" />
        <p style={{ marginTop: 13 }}>{msg}</p>
      </div>
    </dialog>
  );
}
