export const VAT = 0.15;

const fmt = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Round to 2 decimals, immune to binary float artefacts (1.005 → 1.01). */
export function round2(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Format a number as a 2-decimal, grouped amount. Always Latin digits. */
export function money(n) {
  const v = round2(n);
  // Avoid rendering "-0.00".
  return fmt.format(Object.is(v, -0) ? 0 : v);
}

/** Selling price + 15% VAT, rounded once so downstream sums stay exact. */
export function withVat(price) {
  return round2(price * (1 + VAT));
}

/** VAT-inclusive total for a single cart line. */
export function lineTotal(price, qty) {
  return round2(withVat(price) * qty);
}

export function hasPrice(p) {
  return p != null && p.price !== null && p.price !== undefined && Number.isFinite(Number(p.price));
}

const ARABIC_INDIC = /[٠-٩]/g;   // ٠..٩
const EASTERN_ARABIC = /[۰-۹]/g; // ۰..۹
const TASHKEEL = /[ً-ْٰـ]/g;

/**
 * Fold a string for search: Arabic-Indic digits → Latin, strip diacritics,
 * unify the Arabic letter variants people type interchangeably.
 */
export function normalize(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(ARABIC_INDIC, (d) => String.fromCharCode(d.charCodeAt(0) - 0x0660 + 48))
    .replace(EASTERN_ARABIC, (d) => String.fromCharCode(d.charCodeAt(0) - 0x06f0 + 48))
    .replace(TASHKEEL, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Digits-only input long enough to be a scanned code (matches the API rule). */
export function isBarcode(v) {
  return /^[0-9]{4,32}$/.test(v);
}

/** Digits kept, everything else dropped — for the barcode form field. */
export function digitsOnly(s) {
  return normalize(s).replace(/[^0-9]/g, '');
}

/**
 * Parse an amount typed by a person or read out of a spreadsheet cell.
 *
 * Stripping non-digits and calling Number() is not safe here: "5,50" would
 * become 550, and the riyal sign "ر.س" contains an ASCII dot, so "ر.س 25"
 * would become 0.25. Both are silent hundred-fold pricing errors, so the
 * shape of the number is validated instead.
 *
 * @returns {number}    a valid amount
 * @returns {null}      blank — no amount given
 * @returns {undefined} something is there, but it isn't a valid amount
 */
export function parseAmount(input) {
  if (input === null || input === undefined) return null;

  if (typeof input === 'number') {
    return Number.isFinite(input) && input >= 0 ? round2(input) : undefined;
  }

  // Arabic-Indic digits → Latin, then every decimal separator in local use → "."
  const text = normalize(input).replace(/[,٫،]/g, '.').replace(/\s/g, '');
  if (text === '') return null;
  if (text.startsWith('-')) return undefined; // a negative price is never meant

  // Tolerate a currency label on either side: "ر.س 25", "25 SAR".
  const core = text.replace(/^[^\d]+/, '').replace(/[^\d]+$/, '');
  if (core === '') return undefined;

  // At most two decimals — "1,250" is ambiguous, so reject it rather than guess.
  return /^\d+(\.\d{1,2})?$/.test(core) ? round2(Number(core)) : undefined;
}

/** The manual add form: blank means "not priced yet", junk is an error. */
export const parsePrice = parseAmount;
