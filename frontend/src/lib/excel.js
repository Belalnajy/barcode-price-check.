import { VAT, round2 } from './format';

/* Column headers must match the original sheet. */
const H = {
  name: 'اسم الصنف',
  barcode: 'الباركود',
  price: 'سعر البيع',
  vat: 'السعر بعد الضريبة',
  note: 'ملاحظات',
};

/**
 * Parse an .xlsx/.xls file into catalog items.
 * @returns {Promise<{items: Array, warn: number}>}
 * @throws {Error('no_rows')} when no rows carry a barcode
 */
export async function parseWorkbook(file) {
  const XLSX = await import('xlsx'); // lazy-loaded: only needed when importing a sheet
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(new Uint8Array(buf), { type: 'array' });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null, raw: true });

  const items = [];
  let warn = 0;
  rows.forEach((r) => {
    const k = {};
    Object.keys(r).forEach((key) => { k[String(key).trim()] = r[key]; });
    const bc = k[H.barcode];
    if (bc === null || bc === undefined || String(bc).trim() === '') return;
    let price = k[H.price];
    price = price === null || price === undefined || price === '' ? null : Number(price);
    if (price !== null && Number.isNaN(price)) price = null;
    const sv = Number(k[H.vat]);
    if (price !== null && !Number.isNaN(sv) && sv > 0 && Math.abs(sv - price * (1 + VAT)) > 0.01) warn++;
    items.push({
      name: k[H.name] == null ? '' : String(k[H.name]).trim(),
      barcode: String(bc).trim(),
      price: price === null ? null : round2(price),
      priceWithVat: price === null ? null : round2(price * (1 + VAT)),
      note: k[H.note] == null ? null : String(k[H.note]).trim(),
    });
  });

  if (!items.length) {
    const err = new Error('no_rows');
    err.code = 'no_rows';
    throw err;
  }
  return { items, warn };
}

/** Export the current catalog as a UTF-8 CSV (Excel-friendly). */
export function exportCsv(catalog, filename) {
  const lines = [[H.name, H.barcode, H.price, H.vat, H.note].join(',')];
  catalog.forEach((p) => {
    const none = p.price === null || p.price === undefined;
    const cells = [
      p.name,
      `="${p.barcode}"`,
      none ? '' : p.price,
      none ? '' : round2(p.price * (1 + VAT)),
      p.note || '',
    ];
    lines.push(
      cells
        .map((c) => {
          c = String(c);
          return /[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c;
        })
        .join(',')
    );
  });
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
