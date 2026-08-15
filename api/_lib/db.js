/**
 * Data layer: Postgres (Neon / Vercel Postgres / Supabase) via DATABASE_URL,
 * with an automatic in-memory fallback for local dev without a database.
 *
 * The catalog is seeded from api/_data/catalog.json on first run.
 */
const SEED = require('../_data/catalog.json');

const VAT = 0.15;
const CHUNK = 500;

function round2(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

/** Normalize one row — from the DB or the seed file — into the API shape. */
function shape(row) {
  const raw = row.price;
  const price = raw === null || raw === undefined || raw === '' ? null : Number(raw);
  const valid = price !== null && Number.isFinite(price);
  return {
    name: row.name || '',
    barcode: String(row.barcode).trim(),
    price: valid ? round2(price) : null,
    priceWithVat: valid ? round2(price * (1 + VAT)) : null,
    note: row.note || null,
  };
}

/* ---------------------------------------------------------------- *
 *  Postgres backend
 * ---------------------------------------------------------------- */
let pool = null;
let initPromise = null;

function getPool() {
  if (!pool) {
    const { Pool } = require('pg');
    const connectionString = process.env.DATABASE_URL;
    pool = new Pool({
      connectionString,
      // Serverless invocations are short-lived and concurrent; a small pool
      // that retires idle clients quickly avoids exhausting the DB's slots.
      max: 3,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 8000,
      // Managed Postgres providers (Neon, Vercel, Supabase) require TLS.
      ssl: /localhost|127\.0\.0\.1/.test(connectionString || '')
        ? false
        : { rejectUnauthorized: false },
    });
    // Without this an idle-client error crashes the function process.
    pool.on('error', (err) => console.error('[db] idle client error', err.message));
  }
  return pool;
}

/** Run `fn` inside a transaction, rolling back on any throw. */
async function transaction(fn) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/** Bulk upsert via UNNEST — one round trip per 500 rows instead of per row. */
async function writeItems(client, items) {
  for (let i = 0; i < items.length; i += CHUNK) {
    const part = items.slice(i, i + CHUNK);
    await client.query(
      `INSERT INTO products (barcode, name, price, note, updated_at)
       SELECT *, now() FROM UNNEST ($1::text[], $2::text[], $3::numeric[], $4::text[])
       ON CONFLICT (barcode) DO UPDATE
         SET name = EXCLUDED.name,
             price = EXCLUDED.price,
             note = EXCLUDED.note,
             updated_at = now()`,
      [
        part.map((p) => p.barcode),
        part.map((p) => p.name || ''),
        part.map((p) => (p.price === null || p.price === undefined ? null : p.price)),
        part.map((p) => p.note || null),
      ]
    );
  }
}

async function initPg() {
  const db = getPool();
  await db.query(`
    CREATE TABLE IF NOT EXISTS products (
      barcode    TEXT PRIMARY KEY,
      name       TEXT NOT NULL DEFAULT '',
      price      NUMERIC(12,2),
      note       TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS catalog_meta (
      id          INT PRIMARY KEY CHECK (id = 1),
      is_original BOOLEAN NOT NULL DEFAULT true,
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  /* Name lookups are served from the client's local index, but keep an index
     for admin queries and to make ORDER BY name cheap on a cold cache. */
  await db.query('CREATE INDEX IF NOT EXISTS products_name_idx ON products (name)');
  await db.query('INSERT INTO catalog_meta (id) VALUES (1) ON CONFLICT (id) DO NOTHING');

  const { rows } = await db.query('SELECT COUNT(*)::int AS c FROM products');
  if (rows[0].c === 0) {
    await transaction(async (client) => {
      await writeItems(client, SEED.map(shape));
      await client.query(
        `UPDATE catalog_meta SET is_original = true, updated_at = now() WHERE id = 1`
      );
    });
  }
}

const pgStore = {
  kind: 'postgres',

  async init() {
    // Cache the promise so concurrent requests share one bootstrap, but drop
    // it on failure so the next request retries instead of failing forever.
    if (!initPromise) {
      initPromise = initPg().catch((e) => { initPromise = null; throw e; });
    }
    return initPromise;
  },

  async list() {
    const db = getPool();
    const [items, meta] = await Promise.all([
      db.query('SELECT barcode, name, price, note FROM products ORDER BY name, barcode'),
      db.query('SELECT is_original, updated_at FROM catalog_meta WHERE id = 1'),
    ]);
    const row = meta.rows[0];
    return {
      items: items.rows.map(shape),
      meta: {
        count: items.rows.length,
        isOriginal: row ? row.is_original : true,
        updatedAt: row ? row.updated_at : null,
      },
    };
  },

  async get(barcode) {
    const { rows } = await getPool().query(
      'SELECT barcode, name, price, note FROM products WHERE barcode = $1',
      [barcode]
    );
    return rows[0] ? shape(rows[0]) : null;
  },

  async upsert(item) {
    const row = await transaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO products (barcode, name, price, note, updated_at)
         VALUES ($1, $2, $3, $4, now())
         ON CONFLICT (barcode) DO UPDATE
           SET name = EXCLUDED.name,
               price = EXCLUDED.price,
               note = EXCLUDED.note,
               updated_at = now()
         RETURNING (xmax = 0) AS inserted, barcode, name, price, note`,
        [item.barcode, item.name, item.price, item.note || null]
      );
      await client.query(
        'UPDATE catalog_meta SET is_original = false, updated_at = now() WHERE id = 1'
      );
      return rows[0];
    });
    return { product: shape(row), created: row.inserted };
  },

  async remove(barcode) {
    const removed = await transaction(async (client) => {
      const { rowCount } = await client.query('DELETE FROM products WHERE barcode = $1', [barcode]);
      if (rowCount) {
        await client.query(
          'UPDATE catalog_meta SET is_original = false, updated_at = now() WHERE id = 1'
        );
      }
      return rowCount > 0;
    });
    return removed;
  },

  async bulk(items, mode) {
    await transaction(async (client) => {
      if (mode === 'replace') await client.query('DELETE FROM products');
      await writeItems(client, items);
      await client.query(
        'UPDATE catalog_meta SET is_original = false, updated_at = now() WHERE id = 1'
      );
    });
    return this.list();
  },

  async reset() {
    // Wipe and re-seed atomically — a failure mid-way must not leave the shop
    // with an empty price list.
    await transaction(async (client) => {
      await client.query('DELETE FROM products');
      await writeItems(client, SEED.map(shape));
      await client.query(
        'UPDATE catalog_meta SET is_original = true, updated_at = now() WHERE id = 1'
      );
    });
    return this.list();
  },
};

/* ---------------------------------------------------------------- *
 *  In-memory fallback (local dev without DATABASE_URL)
 *  NOT persistent across serverless cold starts — dev only.
 * ---------------------------------------------------------------- */
function seedMap() {
  const map = new Map();
  for (const p of SEED) {
    const barcode = String(p.barcode || '').trim();
    if (barcode && !map.has(barcode)) map.set(barcode, shape(p));
  }
  return map;
}

const memState = { map: seedMap(), isOriginal: true, updatedAt: null };

const memStore = {
  kind: 'memory',

  async init() {},

  async list() {
    const items = Array.from(memState.map.values()).sort(
      (a, b) => a.name.localeCompare(b.name, 'ar') || a.barcode.localeCompare(b.barcode)
    );
    return {
      items,
      meta: {
        count: items.length,
        isOriginal: memState.isOriginal,
        updatedAt: memState.updatedAt,
      },
    };
  },

  async get(barcode) {
    return memState.map.get(barcode) || null;
  },

  async upsert(item) {
    const created = !memState.map.has(item.barcode);
    const product = shape(item);
    memState.map.set(item.barcode, product);
    memState.isOriginal = false;
    memState.updatedAt = new Date().toISOString();
    return { product, created };
  },

  async remove(barcode) {
    const removed = memState.map.delete(barcode);
    if (removed) {
      memState.isOriginal = false;
      memState.updatedAt = new Date().toISOString();
    }
    return removed;
  },

  async bulk(items, mode) {
    if (mode === 'replace') memState.map = new Map();
    for (const p of items) memState.map.set(p.barcode, shape(p));
    memState.isOriginal = false;
    memState.updatedAt = new Date().toISOString();
    return this.list();
  },

  async reset() {
    memState.map = seedMap();
    memState.isOriginal = true;
    memState.updatedAt = null;
    return this.list();
  },
};

/* ---------------------------------------------------------------- */
const store = process.env.DATABASE_URL ? pgStore : memStore;

module.exports = { store, shape, round2, VAT };
