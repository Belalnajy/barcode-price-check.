/**
 * Express app served as a single Vercel Serverless Function.
 * All /api/* requests are rewritten here (see vercel.json).
 */
const express = require('express');
const { store, round2 } = require('./_lib/db');

const app = express();
app.use(express.json({ limit: '4mb' }));

/* Ensure the database schema exists + is seeded before handling any request. */
app.use((req, res, next) => {
  Promise.resolve(store.init()).then(() => next(), next);
});

const router = express.Router();

/* ------------------------- validation helpers ------------------------- */
function cleanBarcode(v) {
  const s = String(v == null ? '' : v).trim();
  return /^[0-9]{4,32}$/.test(s) ? s : null;
}

function cleanItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const barcode = cleanBarcode(raw.barcode);
  if (!barcode) return null;
  const name = String(raw.name == null ? '' : raw.name).trim();
  let price = raw.price;
  if (price === '' || price === undefined) price = null;
  if (price !== null) {
    price = Number(price);
    if (!Number.isFinite(price) || price < 0) return null;
    price = round2(price);
  }
  const note = raw.note == null || String(raw.note).trim() === '' ? null : String(raw.note).trim();
  return { barcode, name, price, note };
}

/* ------------------------------ routes ------------------------------ */
router.get('/health', async (req, res) => {
  res.json({ ok: true, db: store.kind });
});

/* Full catalog + meta */
router.get('/products', async (req, res, next) => {
  try {
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
    res.json(product);
  } catch (e) { next(e); }
});

/* Add / update a single product (manual add form) */
router.post('/products', async (req, res, next) => {
  try {
    const item = cleanItem(req.body);
    if (!item) return res.status(400).json({ error: 'invalid_item' });
    if (!item.name) return res.status(400).json({ error: 'name_required' });
    const result = await store.upsert(item);
    res.status(result.created ? 201 : 200).json(result);
  } catch (e) { next(e); }
});

/* Bulk import from Excel (parsed client-side): { mode: 'merge'|'replace', items: [...] } */
router.post('/products/bulk', async (req, res, next) => {
  try {
    const mode = req.body && req.body.mode === 'replace' ? 'replace' : 'merge';
    const raw = req.body && Array.isArray(req.body.items) ? req.body.items : null;
    if (!raw || !raw.length) return res.status(400).json({ error: 'no_items' });
    if (raw.length > 20000) return res.status(400).json({ error: 'too_many_items' });

    // Validate + de-duplicate by barcode (last row wins, same as the original app)
    const map = new Map();
    for (const r of raw) {
      const item = cleanItem(r);
      if (item) map.set(item.barcode, item);
    }
    const items = Array.from(map.values());
    if (!items.length) return res.status(400).json({ error: 'no_valid_items' });

    res.json(await store.bulk(items, mode));
  } catch (e) { next(e); }
});

/* Reset the catalog back to the original seed list */
router.post('/products/reset', async (req, res, next) => {
  try {
    res.json(await store.reset());
  } catch (e) { next(e); }
});

/* Mount with and without the /api prefix so the app works both behind
   Vercel's rewrite (original URL preserved) and when run directly. */
app.use('/api', router);
app.use('/', router);

/* 404 + error handling */
app.use((req, res) => res.status(404).json({ error: 'route_not_found' }));
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error('[api]', err);
  const dbDown = err && /ECONNREFUSED|ENOTFOUND|password|SSL|timeout/i.test(String(err.message));
  res.status(dbDown ? 503 : 500).json({ error: dbDown ? 'database_unavailable' : 'internal_error' });
});

module.exports = app;
