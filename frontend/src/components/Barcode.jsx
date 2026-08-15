import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

function barcodeFormat(code) {
  if (/^[0-9]{13}$/.test(code)) return 'EAN13';
  if (/^[0-9]{12}$/.test(code)) return 'UPC';
  if (/^[0-9]{8}$/.test(code)) return 'EAN8';
  return 'CODE128';
}

/** White-on-transparent barcode rendered inside the dark display panel. */
export default function Barcode({ code }) {
  const ref = useRef(null);

  useEffect(() => {
    const svg = ref.current;
    if (!svg) return;
    svg.innerHTML = '';
    let ok = true;
    const opts = {
      format: barcodeFormat(code),
      lineColor: '#ffffff',
      background: 'transparent',
      width: 2,
      height: 36,
      margin: 0,
      displayValue: false,
      valid: (v) => { ok = v; },
    };
    try {
      JsBarcode(svg, code, opts);
    } catch {
      ok = false;
    }
    if (!ok) {
      try {
        ok = true;
        JsBarcode(svg, code, { ...opts, format: 'CODE128', valid: (v) => { ok = v; } });
      } catch {
        ok = false;
      }
    }
    if (!ok) svg.innerHTML = '';
  }, [code]);

  return <svg ref={ref} />;
}
