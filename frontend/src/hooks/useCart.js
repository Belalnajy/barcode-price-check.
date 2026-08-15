import { useCallback, useMemo, useRef, useState } from 'react';
import { VAT } from '../lib/format';

const KEY = 'cart';

function readStored() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const c = JSON.parse(raw);
      if (Array.isArray(c)) return c;
    }
  } catch { /* storage unavailable */ }
  return [];
}

function persist(cart) {
  try { localStorage.setItem(KEY, JSON.stringify(cart)); } catch { /* ignore */ }
}

/** The scan list ("cart") lives on the device, like the original app. */
export function useCart() {
  const [cart, setCart] = useState(readStored);
  const lastTouchedRef = useRef(null);

  const addProduct = useCallback((p) => {
    const bc = String(p.barcode).trim();
    lastTouchedRef.current = bc;
    setCart((prev) => {
      const next = prev.map((l) => (l.barcode === bc ? { ...l, qty: l.qty + 1 } : l));
      if (!next.some((l) => l.barcode === bc)) {
        next.push({
          barcode: bc,
          name: p.name,
          price: p.price === undefined ? null : p.price,
          note: p.note || null,
          qty: 1,
        });
      }
      persist(next);
      return next;
    });
  }, []);

  const setQty = useCallback((bc, d) => {
    lastTouchedRef.current = null;
    setCart((prev) => {
      const next = prev
        .map((l) => (l.barcode === bc ? { ...l, qty: l.qty + d } : l))
        .filter((l) => l.qty >= 1);
      persist(next);
      return next;
    });
  }, []);

  const removeLine = useCallback((bc) => {
    lastTouchedRef.current = null;
    setCart((prev) => {
      const next = prev.filter((l) => l.barcode !== bc);
      persist(next);
      return next;
    });
  }, []);

  const clearCart = useCallback(() => {
    lastTouchedRef.current = null;
    setCart(() => {
      persist([]);
      return [];
    });
  }, []);

  const totals = useMemo(() => {
    let sub = 0, pieces = 0, missing = 0;
    for (const l of cart) {
      pieces += l.qty;
      if (l.price === null || l.price === undefined) missing++;
      else sub += l.price * l.qty;
    }
    return { sub, vat: sub * VAT, all: sub * (1 + VAT), pieces, missing };
  }, [cart]);

  return { cart, totals, addProduct, setQty, removeLine, clearCart, lastTouchedRef };
}
