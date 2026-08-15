/**
 * Integration tests against the real Express app on an ephemeral port,
 * backed by the in-memory store (no DATABASE_URL in the test env).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import http from 'node:http';

const require = createRequire(import.meta.url);
const app = require('../../api/index.js');

let base;
let server;

beforeAll(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => new Promise((resolve) => server.close(resolve)));

const get = (path) => fetch(`${base}${path}`);
const post = (path, body) => fetch(`${base}${path}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

/* Raw http, because undici's fetch silently attaches `cache-control: no-cache`
   to any request carrying If-None-Match, which defeats the freshness check. */
function conditionalGet(path, etag) {
  return new Promise((resolve, reject) => {
    const req = http.get(
      `${base}${path}`,
      { headers: { 'If-None-Match': etag } },
      (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); }
    );
    req.on('error', reject);
  });
}

/* Each test starts from the seed catalog. */
beforeEach(async () => { await post('/api/products/reset'); });

describe('GET /api/health', () => {
  it('reports which backend is in use', async () => {
    const res = await get('/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, db: 'memory' });
  });

  it('sets the hardening headers', async () => {
    const res = await get('/api/health');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('x-powered-by')).toBe(null);
  });
});

describe('GET /api/products', () => {
  it('returns the seeded catalog with meta', async () => {
    const { items, meta } = await (await get('/api/products')).json();
    expect(items.length).toBeGreaterThan(1000);
    expect(meta.count).toBe(items.length);
    expect(meta.isOriginal).toBe(true);
  });

  it('computes priceWithVat for every priced product', async () => {
    const { items } = await (await get('/api/products')).json();
    const priced = items.find((p) => p.price !== null);
    expect(priced.priceWithVat).toBe(Math.round(priced.price * 1.15 * 100) / 100);
    const unpriced = items.find((p) => p.price === null);
    expect(unpriced.priceWithVat).toBe(null);
  });

  it('serves a 304 when the client already has the current catalog', async () => {
    const first = await get('/api/products');
    const etag = first.headers.get('etag');
    expect(etag).toBeTruthy();
    expect(first.headers.get('cache-control')).toBe('no-cache');

    expect(await conditionalGet('/api/products', etag)).toBe(304);
  });

  it('changes the ETag once the catalog changes', async () => {
    const etag = (await get('/api/products')).headers.get('etag');
    await post('/api/products', { name: 'etag probe', barcode: '7777777777777', price: 3 });
    expect(await conditionalGet('/api/products', etag)).toBe(200);
  });

  it('is reachable with and without the /api prefix', async () => {
    expect((await get('/products')).status).toBe(200);
  });
});

describe('GET /api/products/:barcode', () => {
  it('finds a seeded product', async () => {
    const res = await get('/api/products/6285534145371');
    expect(res.status).toBe(200);
    expect((await res.json()).barcode).toBe('6285534145371');
  });

  it('rejects a malformed barcode', async () => {
    const res = await get('/api/products/12');
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_barcode');
  });

  it('404s an unknown barcode', async () => {
    const res = await get('/api/products/9999999999999');
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('not_found');
  });
});

describe('POST /api/products', () => {
  it('creates a product and reports 201', async () => {
    const res = await post('/api/products', { name: 'صنف جديد', barcode: '4444555566667', price: 20 });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.created).toBe(true);
    expect(body.product.priceWithVat).toBe(23);
  });

  it('updates an existing product and reports 200', async () => {
    await post('/api/products', { name: 'a', barcode: '4444555566667', price: 20 });
    const res = await post('/api/products', { name: 'b', barcode: '4444555566667', price: 30 });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.created).toBe(false);
    expect(body.product.name).toBe('b');
  });

  it('accepts a product with no price', async () => {
    const res = await post('/api/products', { name: 'x', barcode: '4444555566667', price: null });
    expect((await res.json()).product.price).toBe(null);
  });

  it('rejects invalid payloads', async () => {
    expect((await post('/api/products', { name: 'x', barcode: 'abc' })).status).toBe(400);
    expect((await post('/api/products', { name: '', barcode: '4444555566667' })).status).toBe(400);
    expect((await post('/api/products', { name: 'x', barcode: '4444555566667', price: -5 })).status).toBe(400);
    expect((await post('/api/products', { name: 'x', barcode: '4444555566667', price: 'lots' })).status).toBe(400);
  });

  it('answers malformed JSON with 400, not a server error', async () => {
    const res = await fetch(`${base}/api/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{ not json',
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_json');
  });

  it('flips the catalog out of its "original" state', async () => {
    await post('/api/products', { name: 'x', barcode: '4444555566667', price: 1 });
    const { meta } = await (await get('/api/products')).json();
    expect(meta.isOriginal).toBe(false);
    expect(meta.updatedAt).toBeTruthy();
  });
});

describe('DELETE /api/products/:barcode', () => {
  const del = (path) => fetch(`${base}${path}`, { method: 'DELETE' });

  it('removes a product from the catalog', async () => {
    const before = (await (await get('/api/products')).json()).items.length;
    const res = await del('/api/products/6285534145371');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: true, barcode: '6285534145371' });

    expect((await get('/api/products/6285534145371')).status).toBe(404);
    const after = (await (await get('/api/products')).json()).items.length;
    expect(after).toBe(before - 1);
  });

  it('404s a barcode that is not there', async () => {
    const res = await del('/api/products/9999999999999');
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('not_found');
  });

  it('rejects a malformed barcode', async () => {
    expect((await del('/api/products/xx')).status).toBe(400);
  });

  it('marks the catalog as no longer the original list', async () => {
    await del('/api/products/6285534145371');
    const { meta } = await (await get('/api/products')).json();
    expect(meta.isOriginal).toBe(false);
  });

  it('leaves the catalog untouched when nothing matched', async () => {
    const before = (await (await get('/api/products')).json()).items.length;
    await del('/api/products/9999999999999');
    const { items, meta } = await (await get('/api/products')).json();
    expect(items.length).toBe(before);
    expect(meta.isOriginal).toBe(true);
  });
});

describe('POST /api/products/bulk', () => {
  const items = [
    { name: 'one', barcode: '1111111111111', price: 10 },
    { name: 'two', barcode: '2222222222222', price: 20 },
  ];

  it('merges into the existing catalog', async () => {
    const before = (await (await get('/api/products')).json()).items.length;
    const res = await post('/api/products/bulk', { mode: 'merge', items });
    const body = await res.json();
    expect(body.imported).toBe(2);
    expect(body.items.length).toBe(before + 2);
  });

  it('replaces the whole catalog', async () => {
    const body = await (await post('/api/products/bulk', { mode: 'replace', items })).json();
    expect(body.items).toHaveLength(2);
    expect(body.meta.isOriginal).toBe(false);
  });

  it('keeps the last row when a barcode repeats', async () => {
    const body = await (await post('/api/products/bulk', {
      mode: 'replace',
      items: [
        { name: 'first', barcode: '1111111111111', price: 5 },
        { name: 'last', barcode: '1111111111111', price: 9 },
      ],
    })).json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].name).toBe('last');
  });

  it('reports how many rows it had to skip', async () => {
    const body = await (await post('/api/products/bulk', {
      mode: 'replace',
      items: [...items, { name: 'bad', barcode: 'nope' }],
    })).json();
    expect(body.imported).toBe(2);
    expect(body.skipped).toBe(1);
  });

  it('rejects empty and oversized payloads', async () => {
    expect((await post('/api/products/bulk', { items: [] })).status).toBe(400);
    expect((await post('/api/products/bulk', { items: [{ barcode: 'x' }] })).status).toBe(400);

    const huge = Array.from({ length: 20001 }, (_, i) => ({
      name: 'x', barcode: String(1000000000000 + i), price: 1,
    }));
    const res = await post('/api/products/bulk', { items: huge });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('too_many_items');
  });
});

describe('POST /api/products/reset', () => {
  it('restores the seed catalog', async () => {
    await post('/api/products/bulk', {
      mode: 'replace',
      items: [{ name: 'only', barcode: '1111111111111', price: 1 }],
    });
    const body = await (await post('/api/products/reset')).json();
    expect(body.items.length).toBeGreaterThan(1000);
    expect(body.meta.isOriginal).toBe(true);
  });
});

describe('unknown routes', () => {
  it('404s as JSON, not HTML', async () => {
    const res = await get('/api/nope');
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('route_not_found');
  });
});
