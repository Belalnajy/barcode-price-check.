import { memo, useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

/** Pick the symbology the digits actually belong to; CODE128 takes the rest. */
function symbology(code) {
  if (/^[0-9]{13}$/.test(code)) return 'EAN13';
  if (/^[0-9]{12}$/.test(code)) return 'UPC';
  if (/^[0-9]{8}$/.test(code)) return 'EAN8';
  return 'CODE128';
}

function render(svg, code, format) {
  let valid = true;
  JsBarcode(svg, code, {
    format,
    lineColor: '#ffffff',
    background: 'transparent',
    width: 2,
    height: 40,
    margin: 0,
    displayValue: false,
    valid: (v) => { valid = v; },
  });
  return valid;
}

/**
 * White-on-transparent barcode for the dark display panel.
 *
 * JsBarcode emits fixed pixel width/height; those are swapped for a viewBox so
 * the mark scales to its container instead of being squashed by CSS, and
 * crispEdges keeps the bars sharp at any size.
 */
function Barcode({ code, label }) {
  const ref = useRef(null);

  useEffect(() => {
    const svg = ref.current;
    if (!svg) return;
    svg.replaceChildren();
    svg.removeAttribute('viewBox');

    const value = String(code || '').trim();
    if (!value) return;

    let ok = false;
    try {
      ok = render(svg, value, symbology(value));
    } catch {
      ok = false;
    }
    if (!ok) {
      // A 13-digit code with a bad check digit is common in hand-typed data —
      // still worth drawing, just as CODE128.
      try {
        ok = render(svg, value, 'CODE128');
      } catch {
        ok = false;
      }
    }
    if (!ok) {
      svg.replaceChildren();
      return;
    }

    /* JsBarcode writes "190px"/"52px" — the viewBox needs bare numbers. */
    const w = parseFloat(svg.getAttribute('width'));
    const h = parseFloat(svg.getAttribute('height'));
    if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
      svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    }
    svg.removeAttribute('width');
    svg.removeAttribute('height');
    svg.removeAttribute('style');
  }, [code]);

  return (
    <svg
      ref={ref}
      className="barcode"
      role="img"
      aria-label={label || String(code || '')}
      preserveAspectRatio="none"
      shapeRendering="crispEdges"
    />
  );
}

export default memo(Barcode);
