/**
 * Express app served as a single Vercel Serverless Function.
 * All /api/* requests are rewritten here (see vercel.json).
 */
const express = require('express');
const { store, round2 } = require('./_lib/db');

const MAX_BULK_ITEMS = 20000;

const app = express();
app.disable('x-powered-by');
app.set('etag', 'strong');
app.use(express.json({ limit: '8mb' }));

/* Baseline hardening. The API serves same-origin JSON only — no cookies, no
   credentials — so this is deliberately short rather than a helmet dependency. */
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
    'X-Frame-Options': 'DENY',
  });
  next();
});

/* Ensure the schema exists and is seeded before handling any request. */
app.use((req, res, next) => {
  Promise.resolve(store.init()).then(() => next(), next);
});

const router = express.Router();

/* ------------------------- validation helpers ------------------------- */
function cleanBarcode(v) {
  const s = String(v === null || v === undefined ? '' : v).trim();
  return /^[0-9]{4,32}$/.test(s) ? s : null;
}

/**
 * Coerce an untrusted product payload into a storable row.
 * @returns {object|null} null when the row can't be salvaged.
 */
function cleanItem(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const barcode = cleanBarcode(raw.barcode);
  if (!barcode) return null;

  const name = String(raw.name === null || raw.name === undefined ? '' : raw.name).trim().slice(0, 300);

  let price = raw.price;
  if (price === '' || price === undefined) price = null;
  if (price !== null) {
    price = Number(price);
    if (!Number.isFinite(price) || price < 0 || price > 9999999999) return null;
    price = round2(price);
  }

  const noteText = raw.note === null || raw.note === undefined ? '' : String(raw.note).trim();

  return { barcode, name, price, note: noteText ? noteText.slice(0, 300) : null };
}

/* ------------------------------ routes ------------------------------ */
router.get('/health', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ ok: true, db: store.kind });
});

/* Full catalog + meta. Revalidated on every load, but the ETag means an
   unchanged catalog costs a 304 instead of ~140 KB. */
router.get('/products', async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-cache');
    res.json(await store.list());
  } catch (e) { next(e); }
});

/* Single product lookup by barcode */
router.get('/products/:barcode', async (req, res, next) => {
  try {
    const barcode = cleanBarcode(req.params.barcode);
    if (!barcode) return res.status(400).json({ error: 'invalid_barcode' });

    const product = await store.get(barcode);
    if (!product) return res.status(404).json({ error: 'not_found', barcode });

    res.set('Cache-Control', 'no-cache');
    return res.json(product);
  } catch (e) { return next(e); }
});

/* Add / update a single product (manual add form) */
router.post('/products', async (req, res, next) => {
  try {
    const item = cleanItem(req.body);
    if (!item) return res.status(400).json({ error: 'invalid_item' });
    if (!item.name) return res.status(400).json({ error: 'name_required' });

    const result = await store.upsert(item);
    return res.status(result.created ? 201 : 200).json(result);
  } catch (e) { return next(e); }
});

/* Remove a single product from the catalog */
router.delete('/products/:barcode', async (req, res, next) => {
  try {
    const barcode = cleanBarcode(req.params.barcode);
    if (!barcode) return res.status(400).json({ error: 'invalid_barcode' });

    const removed = await store.remove(barcode);
    if (!removed) return res.status(404).json({ error: 'not_found', barcode });

    return res.json({ deleted: true, barcode });
  } catch (e) { return next(e); }
});

/* Bulk import from a client-parsed sheet: { mode:'merge'|'replace', items:[...] } */
router.post('/products/bulk', async (req, res, next) => {
  try {
    const body = req.body || {};
    const mode = body.mode === 'replace' ? 'replace' : 'merge';
    const raw = Array.isArray(body.items) ? body.items : null;

    if (!raw || !raw.length) return res.status(400).json({ error: 'no_items' });
    if (raw.length > MAX_BULK_ITEMS) return res.status(400).json({ error: 'too_many_items' });

    // Validate and de-duplicate by barcode (last row wins, as the sheet reads).
    const byBarcode = new Map();
    for (const row of raw) {
      const item = cleanItem(row);
      if (item) byBarcode.set(item.barcode, item);
    }
    const items = Array.from(byBarcode.values());
    if (!items.length) return res.status(400).json({ error: 'no_valid_items' });

    const state = await store.bulk(items, mode);
    return res.json({ ...state, imported: items.length, skipped: raw.length - items.length });
  } catch (e) { return next(e); }
});

/* Reset the catalog back to the original seed list */
router.post('/products/reset', async (req, res, next) => {
  try {
    res.json(await store.reset());
  } catch (e) { next(e); }
});

/* Mounted twice so the same app works behind Vercel's rewrite (which keeps
   the original /api/... URL) and when run directly by server.js. */
app.use('/api', router);
app.use('/', router);

/* 404 + error handling */
app.use((req, res) => res.status(404).json({ error: 'route_not_found' }));

// eslint-disable-next-line no-unused-vars -- Express identifies handlers by arity
app.use((err, req, res, next) => {
  const status = Number(err && (err.status || err.statusCode)) || 0;

  /* Malformed or oversized JSON is the caller's mistake, not a server fault —
     body-parser marks these with a 4xx status, so pass it straight through. */
  if (status >= 400 && status < 500) {
    return res.status(status).json({
      error: err.type === 'entity.too.large' ? 'payload_too_large' : 'invalid_json',
    });
  }

  console.error('[api]', err);
  const message = String((err && err.message) || '');
  const dbDown = /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|ECONNRESET|password|SSL|timeout|too many connections/i
    .test(message);
  return res.status(dbDown ? 503 : 500)
    .json({ error: dbDown ? 'database_unavailable' : 'internal_error' });
});

module.exports = app;
