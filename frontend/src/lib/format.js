export const VAT = 0.15;

const fmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function money(n) {
  return fmt.format(Math.round((n + Number.EPSILON) * 100) / 100);
}

export function withVat(p) {
  return p * (1 + VAT);
}

export function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Normalize digits (Arabic-Indic → Latin) and Arabic letter variants for search. */
export function normalize(s) {
  if (!s) return '';
  return String(s)
    .replace(/[٠-٩]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0x0660 + 48))
    .replace(/[۰-۹]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0x06F0 + 48))
    .replace(/[ً-ْٰـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function isBarcode(v) {
  return /^[0-9]{4,}$/.test(v);
}
