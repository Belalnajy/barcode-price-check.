import { useCallback, useEffect, useMemo, useState } from 'react';
import { VAT, round2 } from '../lib/format';

const KEY = 'cart';
export const MAX_QTY = 999;

/** Accept only well-formed lines — stored data can be old, hand-edited or corrupt. */
export function sanitizeCart(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const line of raw) {
    if (!line || typeof line !== 'object') continue;
    const barcode = String(line.barcode || '').trim();
    if (!barcode || seen.has(barcode)) continue;
    const qty = Math.min(MAX_QTY, Math.max(1, Math.floor(Number(line.qty)) || 1));
    const price = Number.isFinite(Number(line.price)) && line.price !== null && line.price !== ''
      ? round2(Number(line.price))
      : null;
    seen.add(barcode);
    out.push({
      barcode,
      name: typeof line.name === 'string' ? line.name : '',
      price,
      note: typeof line.note === 'string' && line.note ? line.note : null,
      qty,
    });
  }
  return out;
}

/**
 * VAT is applied to the order subtotal, and every figure is rounded once, so
 * the printed lines and the grand total always add up.
 */
export function computeTotals(cart) {
  let sub = 0;
  let pieces = 0;
  let missing = 0;
  for (const line of cart) {
    pieces += line.qty;
    if (line.price === null || line.price === undefined) missing++;
    else sub += round2(line.price * line.qty);
  }
  sub = round2(sub);
  const vat = round2(sub * VAT);
  return { sub, vat, all: round2(sub + vat), pieces, missing, lines: cart.length };
}

function readStored() {
  try {
    return sanitizeCart(JSON.parse(localStorage.getItem(KEY) || '[]'));
  } catch {
    return [];
  }
}

/** The scan list lives on the device — each till keeps its own. */
export function useCart() {
  const [cart, setCart] = useState(readStored);
  /* `seq` increments on every scan so re-scanning the same product replays the
     row highlight — a ref alone would keep the same value and the one-shot CSS
     animation would never restart. */
  const [lastTouched, setLastTouched] = useState({ barcode: null, seq: 0 });

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(cart)); } catch { /* storage full/disabled */ }
  }, [cart]);

  const addProduct = useCallback((product) => {
    const barcode = String(product.barcode).trim();
    setLastTouched((prev) => ({ barcode, seq: prev.seq + 1 }));
    setCart((prev) => {
      const existing = prev.find((l) => l.barcode === barcode);
      if (existing) {
        return prev.map((l) =>
          l.barcode === barcode ? { ...l, qty: Math.min(MAX_QTY, l.qty + 1) } : l
        );
      }
      return prev.concat({
        barcode,
        name: product.name || '',
        price: product.price === undefined ? null : product.price,
        note: product.note || null,
        qty: 1,
      });
    });
  }, []);

  /** Nudge a line's quantity; dropping below 1 removes it. */
  const setQty = useCallback((barcode, delta) => {
    setLastTouched({ barcode: null, seq: 0 });
    setCart((prev) =>
      prev
        .map((l) =>
          l.barcode === barcode ? { ...l, qty: Math.min(MAX_QTY, l.qty + delta) } : l
        )
        .filter((l) => l.qty >= 1)
    );
  }, []);

  const removeLine = useCallback((barcode) => {
    setLastTouched({ barcode: null, seq: 0 });
    setCart((prev) => prev.filter((l) => l.barcode !== barcode));
  }, []);

  const clearCart = useCallback(() => {
    setLastTouched({ barcode: null, seq: 0 });
    setCart([]);
  }, []);

  /** Swap the whole list at once — used when a saved quote is reopened. */
  const replaceAll = useCallback((lines) => {
    setLastTouched({ barcode: null, seq: 0 });
    setCart(sanitizeCart(lines));
  }, []);

  /**
   * Refresh names and prices from the catalog. Without this a line scanned
   * before an price update would keep quoting the old figure indefinitely.
   */
  const reconcile = useCallback((byBarcode) => {
    if (!byBarcode || !byBarcode.size) return;
    setCart((prev) => {
      let changed = false;
      const next = prev.map((line) => {
        const p = byBarcode.get(line.barcode);
        if (!p) return line;
        const price = p.price === undefined ? null : p.price;
        const note = p.note || null;
        const name = p.name || line.name;
        if (price === line.price && note === line.note && name === line.name) return line;
        changed = true;
        return { ...line, name, price, note };
      });
      return changed ? next : prev;
    });
  }, []);

  const totals = useMemo(() => computeTotals(cart), [cart]);

  return { cart, totals, lastTouched, addProduct, setQty, removeLine, clearCart, replaceAll, reconcile };
}
