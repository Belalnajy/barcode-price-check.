import { VAT, normalize, parseAmount, round2 } from './format';

/* Accepted column headers, matched after `normalize()` so spacing, diacritics
   and alef/ya variants in the uploaded sheet don't break the import. */
const HEADERS = {
  name: ['اسم الصنف', 'الصنف', 'المنتج', 'name', 'product', 'item'],
  barcode: ['الباركود', 'باركود', 'الكود', 'barcode', 'code', 'ean'],
  price: ['سعر البيع', 'السعر', 'سعر', 'price', 'selling price'],
  vat: ['السعر بعد الضريبة', 'شامل الضريبة', 'price with vat', 'price incl vat'],
  note: ['ملاحظات', 'ملاحظة', 'note', 'notes'],
};

/* Canonical headers used when writing a file back out. */
const OUT = {
  name: 'اسم الصنف',
  barcode: 'الباركود',
  price: 'سعر البيع',
  vat: 'السعر بعد الضريبة',
  note: 'ملاحظات',
};

const LOOKUP = new Map();
for (const [field, aliases] of Object.entries(HEADERS)) {
  for (const alias of aliases) LOOKUP.set(normalize(alias), field);
}

const MAX_ROWS = 20000;

/** Map one sheet row onto our field names using the header lookup. */
function fields(row) {
  const out = {};
  for (const key of Object.keys(row)) {
    const field = LOOKUP.get(normalize(key));
    if (field && out[field] === undefined) out[field] = row[key];
  }
  return out;
}

function toText(v) {
  if (v === null || v === undefined) return '';
  // Excel hands back barcodes as numbers; keep every digit, drop any exponent.
  if (typeof v === 'number') return Number.isInteger(v) ? v.toFixed(0) : String(v);
  return String(v).trim();
}

/** A cell that isn't a number ("N/A", "غير مسعر") means the product has no price. */
function toPrice(v) {
  const amount = parseAmount(v);
  return amount === undefined ? null : amount;
}

/**
 * Parse an .xlsx/.xls file into catalog items.
 * @returns {Promise<{items: Array, warn: number, skipped: number}>}
 * @throws {Error & {code:'no_rows'|'too_many_rows'}}
 */
export async function parseWorkbook(file) {
  const XLSX = await import('xlsx'); // lazy: only pulled in when a sheet is imported
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(new Uint8Array(buf), { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = sheet ? XLSX.utils.sheet_to_json(sheet, { defval: null, raw: true }) : [];

  if (rows.length > MAX_ROWS) {
    throw Object.assign(new Error('too_many_rows'), { code: 'too_many_rows' });
  }

  const byBarcode = new Map(); // de-duplicate, last row wins
  let warn = 0;
  let skipped = 0;

  for (const row of rows) {
    const f = fields(row);
    const barcode = toText(f.barcode);
    if (!/^[0-9]{4,32}$/.test(barcode)) {
      if (barcode || toText(f.name)) skipped++;
      continue;
    }
    const price = toPrice(f.price);

    // Flag rows whose "with VAT" column disagrees with 15% of the selling price.
    const stated = Number(f.vat);
    if (price !== null && Number.isFinite(stated) && stated > 0
        && Math.abs(stated - price * (1 + VAT)) > 0.01) warn++;

    const note = toText(f.note);
    byBarcode.set(barcode, {
      name: toText(f.name),
      barcode,
      price,
      priceWithVat: price === null ? null : round2(price * (1 + VAT)),
      note: note || null,
    });
  }

  const items = Array.from(byBarcode.values());
  if (!items.length) {
    throw Object.assign(new Error('no_rows'), { code: 'no_rows' });
  }
  return { items, warn, skipped };
}

/**
 * Parse several sheets into one import set. Files are applied in the order
 * given, so a later file wins where the same barcode appears twice.
 * @returns {Promise<{items, warn, skipped, files: Array<{name,count,warn,skipped,error?}>}>}
 */
export async function parseWorkbooks(fileList) {
  const files = [];
  const merged = new Map();
  let warn = 0;
  let skipped = 0;

  for (const file of fileList) {
    try {
      const parsed = await parseWorkbook(file);
      for (const item of parsed.items) merged.set(item.barcode, item);
      warn += parsed.warn;
      skipped += parsed.skipped;
      files.push({
        name: file.name,
        count: parsed.items.length,
        warn: parsed.warn,
        skipped: parsed.skipped,
      });
    } catch (e) {
      // One bad sheet shouldn't discard the ones that read fine.
      files.push({ name: file.name, count: 0, warn: 0, skipped: 0, error: (e && e.code) || 'bad_file' });
    }
  }

  if (!merged.size) {
    const failed = files.find((f) => f.error);
    throw Object.assign(new Error('no_rows'), { code: (failed && failed.error) || 'no_rows', files });
  }
  return { items: Array.from(merged.values()), warn, skipped, files };
}

/* A leading =, +, - or @ makes Excel treat a cell as a formula. Product names
   come from an uploaded file, so neutralise them on the way out. */
function csvCell(value) {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Export the catalog as a UTF-8 CSV that Excel opens cleanly. */
export function exportCsv(catalog, filename) {
  const lines = [[OUT.name, OUT.barcode, OUT.price, OUT.vat, OUT.note].map(csvCell).join(',')];

  for (const p of catalog) {
    const none = p.price === null || p.price === undefined;
    lines.push([
      csvCell(p.name),
      csvCell(p.barcode),
      none ? '' : round2(p.price),
      none ? '' : round2(p.price * (1 + VAT)),
      csvCell(p.note || ''),
    ].join(','));
  }

  // BOM so Excel detects UTF-8 and renders Arabic correctly.
  const blob = new Blob(['﻿' + lines.join('\r\n') + '\r\n'], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
