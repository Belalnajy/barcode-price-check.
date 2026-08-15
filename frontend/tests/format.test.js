import { describe, expect, it } from 'vitest';
import {
  digitsOnly, hasPrice, isBarcode, lineTotal, money, normalize,
  parseAmount, parsePrice, round2, withVat, VAT,
} from '../src/lib/format';

describe('round2', () => {
  it('rounds half up past binary float artefacts', () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(2.675)).toBe(2.68);
    expect(round2(10 * 1.15)).toBe(11.5);
  });

  it('is a no-op on clean values and safe on junk', () => {
    expect(round2(5)).toBe(5);
    expect(round2(NaN)).toBe(0);
    expect(round2(Infinity)).toBe(0);
  });
});

describe('money', () => {
  it('always shows two decimals with grouping', () => {
    expect(money(0)).toBe('0.00');
    expect(money(5)).toBe('5.00');
    expect(money(1234.5)).toBe('1,234.50');
  });

  it('never renders a negative zero', () => {
    expect(money(-0)).toBe('0.00');
    expect(money(-0.001)).toBe('0.00');
  });
});

describe('VAT maths', () => {
  it('adds 15% and rounds once', () => {
    expect(VAT).toBe(0.15);
    expect(withVat(10)).toBe(11.5);
    expect(withVat(5)).toBe(5.75);
    expect(withVat(3.33)).toBe(3.83);
  });

  it('keeps line totals consistent with the per-unit price', () => {
    expect(lineTotal(10, 2)).toBe(23);
    expect(lineTotal(3.33, 3)).toBe(11.49);
    expect(lineTotal(0, 4)).toBe(0);
  });
});

describe('hasPrice', () => {
  it('treats only finite numbers as priced', () => {
    expect(hasPrice({ price: 0 })).toBe(true);
    expect(hasPrice({ price: 12.5 })).toBe(true);
    expect(hasPrice({ price: null })).toBe(false);
    expect(hasPrice({ price: undefined })).toBe(false);
    expect(hasPrice({})).toBe(false);
    expect(hasPrice(null)).toBe(false);
  });
});

describe('normalize', () => {
  it('converts Arabic-Indic and Persian digits to Latin', () => {
    expect(normalize('١٢٣٤٥')).toBe('12345');
    expect(normalize('۶۷۸۹۰')).toBe('67890');
  });

  it('folds the interchangeable Arabic letter forms', () => {
    expect(normalize('أقلام')).toBe('ا' + 'قلام');
    expect(normalize('مكتبة')).toBe(normalize('مكتبه'));
    expect(normalize('ليلى')).toBe(normalize('ليلي'));
    expect(normalize('مسؤول')).toBe(normalize('مسوول'));
  });

  it('strips diacritics and collapses whitespace', () => {
    expect(normalize('  قَلَم   أزرق ')).toBe('قلم ازرق');
  });

  it('handles empty input without throwing', () => {
    expect(normalize(null)).toBe('');
    expect(normalize(undefined)).toBe('');
    expect(normalize('')).toBe('');
  });
});

describe('isBarcode', () => {
  it('accepts 4–32 digit codes only', () => {
    expect(isBarcode('6285534145371')).toBe(true);
    expect(isBarcode('1234')).toBe(true);
    expect(isBarcode('123')).toBe(false);
    expect(isBarcode('1'.repeat(33))).toBe(false);
    expect(isBarcode('12a4')).toBe(false);
    expect(isBarcode('')).toBe(false);
  });
});

describe('digitsOnly', () => {
  it('keeps digits and converts Arabic numerals', () => {
    expect(digitsOnly(' 628-553 4145371 ')).toBe('6285534145371');
    expect(digitsOnly('١٢٣')).toBe('123');
  });
});

describe('parseAmount', () => {
  it('parses plain numbers', () => {
    expect(parseAmount('12.5')).toBe(12.5);
    expect(parseAmount('12.50')).toBe(12.5);
    expect(parseAmount('1250')).toBe(1250);
    expect(parseAmount('0')).toBe(0);
    expect(parseAmount(25)).toBe(25);
  });

  it('accepts Arabic-Indic digits and the Arabic decimal separator', () => {
    expect(parseAmount('١٢')).toBe(12);
    expect(parseAmount('٥٫٥٠')).toBe(5.5);
    expect(parseAmount('12٫75')).toBe(12.75);
  });

  it('treats a comma as a decimal separator, not a silent ×100', () => {
    expect(parseAmount('5,50')).toBe(5.5);
    expect(parseAmount('0,99')).toBe(0.99);
  });

  it('rejects an ambiguous thousands separator instead of guessing', () => {
    expect(parseAmount('1,250')).toBe(undefined);
    expect(parseAmount('1.250')).toBe(undefined);
  });

  it('tolerates a currency label without letting its dot become a decimal point', () => {
    // "ر.س" contains an ASCII dot — the classic way this goes wrong.
    expect(parseAmount('ر.س 25')).toBe(25);
    expect(parseAmount('25 ر.س')).toBe(25);
    expect(parseAmount('25 SAR')).toBe(25);
  });

  it('reports blank as "no price" and junk as invalid', () => {
    expect(parseAmount('')).toBe(null);
    expect(parseAmount('   ')).toBe(null);
    expect(parseAmount(null)).toBe(null);
    expect(parseAmount(undefined)).toBe(null);

    expect(parseAmount('abc')).toBe(undefined);
    expect(parseAmount('N/A')).toBe(undefined);
    expect(parseAmount('غير مسعر')).toBe(undefined);
    expect(parseAmount('1.2.3')).toBe(undefined);
  });

  it('refuses negative amounts rather than dropping the sign', () => {
    expect(parseAmount('-5')).toBe(undefined);
    expect(parseAmount(-5)).toBe(undefined);
  });

  it('is what the manual add form uses', () => {
    expect(parsePrice).toBe(parseAmount);
  });
});
