import { useCallback, useEffect, useRef, useState } from 'react';
import Dialog from './Dialog';
import { hasNativeDetector, startScanner } from '../lib/scanner';
import { hasPrice, money, normalize, withVat } from '../lib/format';

const FEED_LIMIT = 4;

/** Phase is stored as a code, not a sentence, so switching language re-renders
    the message without restarting the camera. */
const messageFor = (t, phase, code) => {
  if (phase === 'starting') return t.camStarting;
  if (phase === 'live') return t.camAim;
  if (code === 'denied') return t.camDenied;
  if (code === 'no_camera') return t.camNoCamera;
  return t.camFailed;
};

/**
 * The camera stays open and keeps scanning: every read is confirmed in place
 * with a banner and a short history, so a whole basket can go through without
 * reopening the scanner between items.
 */
export default function CameraDialog({ t, open, onClose, onScan }) {
  const boxRef = useRef(null);
  const onScanRef = useRef(onScan);
  const seqRef = useRef(0);
  const [state, setState] = useState({ phase: 'starting', code: null });
  const [feed, setFeed] = useState([]);

  useEffect(() => { onScanRef.current = onScan; }, [onScan]);

  const handleDetect = useCallback((raw) => {
    const result = onScanRef.current(normalize(raw));
    if (!result) return;
    seqRef.current += 1;
    setFeed((prev) => [{ ...result, key: seqRef.current }, ...prev].slice(0, FEED_LIMIT));
  }, []);

  useEffect(() => {
    if (!open) return undefined;

    const box = boxRef.current;
    let stop = null;
    let cancelled = false;
    setState({ phase: 'starting', code: null });
    setFeed([]);
    seqRef.current = 0;

    startScanner(box, (raw) => { if (!cancelled) handleDetect(raw); })
      .then((stopFn) => {
        // The dialog may have closed while the camera was warming up.
        if (cancelled) stopFn();
        else {
          stop = stopFn;
          setState({ phase: 'live', code: null });
        }
      })
      .catch((e) => {
        if (cancelled) return;
        setState({ phase: 'error', code: (e && e.code) || 'failed' });
      });

    return () => {
      cancelled = true;
      if (stop) stop();
      if (box) box.replaceChildren();
    };
  }, [open, handleDetect]);

  const failed = state.phase === 'error';
  const latest = feed[0];
  const added = feed.filter((f) => f.status !== 'miss').length;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t.camera}
      closeLabel={t.close}
      footer={
        <>
          <p className="cam-count" aria-live="polite">
            {added > 0 ? <><span className="n">{added}</span> {t.camAdded}</> : t.camKeepScanning}
          </p>
          <span className="grow" />
          <button type="button" className="btn btn-solid" onClick={onClose}>{t.camDone}</button>
        </>
      }
    >
      {/* The mount always exists so the scanner has somewhere to attach; only
          its framing is hidden once the camera has failed. */}
      <div className={`cam-stage${failed ? ' is-error' : ''}`}>
        <div className="cam-mount" ref={boxRef} />
        {failed ? (
          <svg className="cam-fail" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M3 3l18 18" />
            <path d="M9.5 5h5l1.5 2.5H20a1 1 0 0 1 1 1V17M17 17H4a1 1 0 0 1-1-1V8.5a1 1 0 0 1 1-1h2" />
            <path d="M13.9 13.9a3 3 0 0 1-4.2-4.2" />
          </svg>
        ) : (
          <div className="cam-frame" aria-hidden="true">
            <span /><span /><span /><span />
            {state.phase === 'live' && <i className="cam-sweep" />}
          </div>
        )}

        {/* Confirmation sits over the viewfinder so eyes never leave the camera. */}
        {latest && !failed && (
          <p key={latest.key} className={`cam-toast is-${latest.status}`} role="status">
            {latest.status === 'miss' ? (
              <>
                <strong>{t.notFound}</strong>
                <span className="n">{latest.code}</span>
              </>
            ) : (
              <>
                <strong>{latest.product.name || latest.product.barcode}</strong>
                <span>
                  {hasPrice(latest.product)
                    ? <><span className="n">{money(withVat(latest.product.price))}</span> {t.cur}</>
                    : t.noPrice}
                </span>
              </>
            )}
          </p>
        )}
      </div>

      <p className={`cam-msg${failed ? ' msg-bad' : ''}`} role="status">
        {messageFor(t, state.phase, state.code)}
      </p>

      {feed.length > 1 && (
        <ul className="cam-feed">
          {feed.slice(1).map((entry) => (
            <li key={entry.key} className={`cam-feed-row is-${entry.status}`}>
              <span className="cam-feed-name">
                {entry.status === 'miss' ? t.notFound : entry.product.name || '—'}
              </span>
              <span className="n cam-feed-code">
                {entry.status === 'miss' ? entry.code : entry.product.barcode}
              </span>
            </li>
          ))}
        </ul>
      )}

      {state.phase === 'live' && !hasNativeDetector() && (
        <p className="hint">{t.camSlowHint}</p>
      )}
    </Dialog>
  );
}
