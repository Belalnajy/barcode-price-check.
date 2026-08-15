import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import * as XLSX from 'xlsx';
import { exportCsv, parseWorkbook, parseWorkbooks } from '../src/lib/excel';

/** Build an in-memory .xlsx and wrap it in the File-like shape the parser needs. */
function sheetFile(rows) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Sheet1');
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return { name: 'test.xlsx', arrayBuffer: async () => buf };
}

describe('parseWorkbook', () => {
  it('reads the original column layout', async () => {
    const { items } = await parseWorkbook(sheetFile([
      { 'اسم الصنف': 'قلم أزرق', 'الباركود': '6285534145371', 'سعر البيع': 10, 'ملاحظات': 'رف 3' },
    ]));

    expect(items).toEqual([{
      name: 'قلم أزرق',
      barcode: '6285534145371',
      price: 10,
      priceWithVat: 11.5,
      note: 'رف 3',
    }]);
  });

  it('matches headers despite spacing and alef variants', async () => {
    const { items } = await parseWorkbook(sheetFile([
      { ' إسم الصنف ': 'دفتر', ' الباركود ': '1234567890123', 'السعر': 4 },
    ]));
    expect(items[0].name).toBe('دفتر');
    expect(items[0].price).toBe(4);
  });

  it('accepts the English aliases too', async () => {
    const { items } = await parseWorkbook(sheetFile([
      { name: 'Notebook', barcode: '1234567890123', price: 4 },
    ]));
    expect(items[0]).toMatchObject({ name: 'Notebook', price: 4, priceWithVat: 4.6 });
  });

  it('keeps every digit of a numeric barcode cell', async () => {
    const { items } = await parseWorkbook(sheetFile([
      { 'الباركود': 6285534145371, 'اسم الصنف': 'x' },
    ]));
    expect(items[0].barcode).toBe('6285534145371');
  });

  it('treats a blank price as unpriced rather than zero', async () => {
    const { items } = await parseWorkbook(sheetFile([
      { 'الباركود': '1111', 'اسم الصنف': 'x', 'سعر البيع': '' },
    ]));
    expect(items[0].price).toBe(null);
    expect(items[0].priceWithVat).toBe(null);
  });

  it('reads a price written with a currency label at its real value', async () => {
    // "ر.س" contains an ASCII dot; a naive strip-and-parse turns this into 0.25.
    const { items } = await parseWorkbook(sheetFile([
      { 'الباركود': '1111', 'سعر البيع': 'ر.س 25' },
      { 'الباركود': '2222', 'سعر البيع': '25 SAR' },
    ]));
    expect(items.map((p) => p.price)).toEqual([25, 25]);
  });

  it('reads a decimal comma as a decimal, not as a hundred-fold price', async () => {
    const { items } = await parseWorkbook(sheetFile([
      { 'الباركود': '1111', 'سعر البيع': '5,50' },
      { 'الباركود': '2222', 'سعر البيع': '٥٫٥٠' },
    ]));
    expect(items.map((p) => p.price)).toEqual([5.5, 5.5]);
  });

  it('treats non-numeric price text as unpriced, never as zero', async () => {
    const { items } = await parseWorkbook(sheetFile([
      { 'الباركود': '1111', 'سعر البيع': 'N/A' },
      { 'الباركود': '2222', 'سعر البيع': 'غير مسعر' },
    ]));
    expect(items.map((p) => p.price)).toEqual([null, null]);
    expect(items.map((p) => p.priceWithVat)).toEqual([null, null]);
  });

  it('counts rows whose VAT column disagrees with 15%', async () => {
    const { warn } = await parseWorkbook(sheetFile([
      { 'الباركود': '1111', 'سعر البيع': 10, 'السعر بعد الضريبة': 11.5 },
      { 'الباركود': '2222', 'سعر البيع': 10, 'السعر بعد الضريبة': 12.0 },
    ]));
    expect(warn).toBe(1);
  });

  it('skips rows without a valid barcode and reports the count', async () => {
    const { items, skipped } = await parseWorkbook(sheetFile([
      { 'الباركود': '1111', 'اسم الصنف': 'good' },
      { 'الباركود': 'abc', 'اسم الصنف': 'bad code' },
      { 'الباركود': '12', 'اسم الصنف': 'too short' },
    ]));
    expect(items).toHaveLength(1);
    expect(skipped).toBe(2);
  });

  it('de-duplicates by barcode, last row winning', async () => {
    const { items } = await parseWorkbook(sheetFile([
      { 'الباركود': '1111', 'سعر البيع': 5 },
      { 'الباركود': '1111', 'سعر البيع': 9 },
    ]));
    expect(items).toHaveLength(1);
    expect(items[0].price).toBe(9);
  });

  it('throws no_rows when nothing is importable', async () => {
    await expect(parseWorkbook(sheetFile([{ 'اسم الصنف': 'no barcode' }])))
      .rejects.toMatchObject({ code: 'no_rows' });
  });
});

describe('parseWorkbooks (multiple sheets)', () => {
  const named = (name, rows) => Object.assign(sheetFile(rows), { name });

  it('combines every sheet into one import set', async () => {
    const { items, files } = await parseWorkbooks([
      named('a.xlsx', [{ 'الباركود': '1111', 'اسم الصنف': 'one', 'سعر البيع': 1 }]),
      named('b.xlsx', [{ 'الباركود': '2222', 'اسم الصنف': 'two', 'سعر البيع': 2 }]),
    ]);
    expect(items).toHaveLength(2);
    expect(files.map((f) => [f.name, f.count])).toEqual([['a.xlsx', 1], ['b.xlsx', 1]]);
  });

  it('lets a later sheet override an earlier one on the same barcode', async () => {
    const { items } = await parseWorkbooks([
      named('old.xlsx', [{ 'الباركود': '1111', 'اسم الصنف': 'old', 'سعر البيع': 5 }]),
      named('new.xlsx', [{ 'الباركود': '1111', 'اسم الصنف': 'new', 'سعر البيع': 9 }]),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ name: 'new', price: 9 });
  });

  it('totals the warnings and skips across sheets', async () => {
    const { warn, skipped } = await parseWorkbooks([
      named('a.xlsx', [
        { 'الباركود': '1111', 'سعر البيع': 10, 'السعر بعد الضريبة': 99 },
        { 'الباركود': 'bad', 'اسم الصنف': 'x' },
      ]),
      named('b.xlsx', [
        { 'الباركود': '2222', 'سعر البيع': 10, 'السعر بعد الضريبة': 99 },
      ]),
    ]);
    expect(warn).toBe(2);
    expect(skipped).toBe(1);
  });

  it('keeps the good sheets when one is unreadable', async () => {
    const broken = { name: 'broken.xlsx', arrayBuffer: async () => new Uint8Array([1, 2, 3]) };
    const { items, files } = await parseWorkbooks([
      named('good.xlsx', [{ 'الباركود': '1111', 'اسم الصنف': 'one', 'سعر البيع': 1 }]),
      broken,
    ]);
    expect(items).toHaveLength(1);
    expect(files[1].error).toBeTruthy();
    expect(files[1].count).toBe(0);
  });

  it('throws only when nothing at all could be read', async () => {
    const broken = { name: 'broken.xlsx', arrayBuffer: async () => new Uint8Array([1, 2, 3]) };
    await expect(parseWorkbooks([broken])).rejects.toMatchObject({ files: expect.any(Array) });
  });
});

describe('exportCsv', () => {
  let written;

  beforeEach(() => {
    written = null;
    global.Blob = class {
      constructor(parts) { written = parts.join(''); }
    };
    global.URL = { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} };
    const link = { click: vi.fn(), remove: vi.fn(), setAttribute: vi.fn() };
    global.document = {
      createElement: () => link,
      body: { appendChild: vi.fn() },
    };
  });

  afterEach(() => {
    delete global.Blob;
    delete global.URL;
    delete global.document;
  });

  it('writes a BOM so Excel reads Arabic correctly', () => {
    exportCsv([{ name: 'قلم', barcode: '1111', price: 10, note: null }], 'x.csv');
    expect(written.startsWith('﻿')).toBe(true);
  });

  it('emits the price with and without VAT', () => {
    exportCsv([{ name: 'قلم', barcode: '1111', price: 10, note: null }], 'x.csv');
    expect(written).toContain('قلم,1111,10,11.5,');
  });

  it('leaves both price columns empty for unpriced products', () => {
    exportCsv([{ name: 'x', barcode: '1111', price: null, note: null }], 'x.csv');
    expect(written).toContain('x,1111,,,');
  });

  it('quotes fields containing commas or quotes', () => {
    exportCsv([{ name: 'a,b "c"', barcode: '1111', price: 1, note: null }], 'x.csv');
    expect(written).toContain('"a,b ""c"""');
  });

  it('neutralises formula injection from an uploaded product name', () => {
    exportCsv([{ name: '=SUM(A1:A9)', barcode: '1111', price: 1, note: '@cmd' }], 'x.csv');
    expect(written).toContain("'=SUM(A1:A9)");
    expect(written).toContain("'@cmd");
    expect(written).not.toMatch(/(^|,)=SUM/m);
  });
});
