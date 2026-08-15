import { describe, expect, it } from 'vitest';
import { computeTotals, sanitizeCart, MAX_QTY } from '../src/hooks/useCart';

describe('sanitizeCart', () => {
  it('drops anything that is not a usable line', () => {
    expect(sanitizeCart(null)).toEqual([]);
    expect(sanitizeCart('nope')).toEqual([]);
    expect(sanitizeCart([null, 3, 'x', {}, { barcode: '  ' }])).toEqual([]);
  });

  it('repairs bad quantities instead of trusting them', () => {
    const [a, b, c] = sanitizeCart([
      { barcode: '1', qty: 0 },
      { barcode: '2', qty: NaN },
      { barcode: '3', qty: 1e9 },
    ]);
    expect(a.qty).toBe(1);
    expect(b.qty).toBe(1);
    expect(c.qty).toBe(MAX_QTY);
  });

  it('de-duplicates by barcode', () => {
    const out = sanitizeCart([
      { barcode: '111', qty: 2 },
      { barcode: '111', qty: 5 },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].qty).toBe(2);
  });

  it('normalises prices and keeps unpriced lines as null', () => {
    const [priced, unpriced, garbage] = sanitizeCart([
      { barcode: '1', price: '10.005' },
      { barcode: '2', price: null },
      { barcode: '3', price: 'abc' },
    ]);
    expect(priced.price).toBe(10.01);
    expect(unpriced.price).toBe(null);
    expect(garbage.price).toBe(null);
  });

  it('coerces missing text fields to safe defaults', () => {
    const [line] = sanitizeCart([{ barcode: '9', name: 42, note: '' }]);
    expect(line.name).toBe('');
    expect(line.note).toBe(null);
  });
});

describe('computeTotals', () => {
  it('is zero for an empty cart', () => {
    expect(computeTotals([])).toEqual({
      sub: 0, vat: 0, all: 0, pieces: 0, missing: 0, lines: 0,
    });
  });

  it('adds VAT to the subtotal, not to each line', () => {
    const totals = computeTotals([
      { barcode: '1', price: 10, qty: 2 },
      { barcode: '2', price: 5, qty: 1 },
    ]);
    expect(totals.sub).toBe(25);
    expect(totals.vat).toBe(3.75);
    expect(totals.all).toBe(28.75);
    expect(totals.pieces).toBe(3);
    expect(totals.lines).toBe(2);
  });

  it('excludes unpriced lines from the money but counts them', () => {
    const totals = computeTotals([
      { barcode: '1', price: 10, qty: 1 },
      { barcode: '2', price: null, qty: 3 },
    ]);
    expect(totals.sub).toBe(10);
    expect(totals.all).toBe(11.5);
    expect(totals.missing).toBe(1);
    expect(totals.pieces).toBe(4);
  });

  it('stays exact across many awkward prices', () => {
    const cart = Array.from({ length: 30 }, (_, i) => ({
      barcode: String(i), price: 0.07, qty: 3,
    }));
    const totals = computeTotals(cart);
    // 30 lines × round2(0.07 × 3) = 30 × 0.21
    expect(totals.sub).toBe(6.3);
    expect(totals.vat).toBe(0.95);
    expect(totals.all).toBe(7.25);
  });

  it('never leaks floating point noise into the grand total', () => {
    const totals = computeTotals([{ barcode: '1', price: 3.33, qty: 3 }]);
    expect(totals.sub).toBe(9.99);
    expect(totals.vat).toBe(1.5);
    expect(totals.all).toBe(11.49);
    expect(Number.isInteger(totals.all * 100)).toBe(true);
  });
});
