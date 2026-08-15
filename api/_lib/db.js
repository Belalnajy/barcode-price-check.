/**
 * Data layer: Postgres (Neon / Vercel Postgres / Supabase) via DATABASE_URL,
 * with an automatic in-memory fallback for local dev without a database.
 *
 * The catalog is seeded from api/_data/catalog.json on first run.
 */
const SEED = require('../_data/catalog.json');

const VAT = 0.15;

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Normalize one product row into the API shape. */
function shape(row) {
  const price = row.price === null || row.price === undefined ? null : Number(row.price);
  return {
    name: row.name || '',
    barcode: String(row.barcode).trim(),
    price: price === null ? null : round2(price),
    priceWithVat: price === null ? null : round2(price * (1 + VAT)),
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
      max: 3,
      // Managed Postgres providers (Neon, Vercel Postgres, Supabase) require TLS.
      ssl: /localhost|127\.0\.0\.1/.test(connectionString) ? false : { rejectUnauthorized: false },
    });
  }
  return pool;
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
  const { rows } = await db.query('SELECT COUNT(*)::int AS c FROM products');
  if (rows[0].c === 0) {
    await seedPg(db);
  }
  await db.query(
    `INSERT INTO catalog_meta (id) VALUES (1) ON CONFLICT (id) DO NOTHING`
  );
}

async function seedPg(db) {
  // Bulk insert the seed catalog in chunks using UNNEST.
  const chunk = 500;
  for (let i = 0; i < SEED.length; i += chunk) {
    const part = SEED.slice(i, i + chunk);
    await db.query(
      `INSERT INTO products (barcode, name, price, note)
       SELECT * FROM UNNEST ($1::text[], $2::text[], $3::numeric[], $4::text[])
       ON CONFLICT (barcode) DO NOTHING`,
      [
        part.map((p) => String(p.barcode).trim()),
        part.map((p) => p.name || ''),
        part.map((p) => (p.price === null || p.price === undefined ? null : p.price)),
        part.map((p) => p.note || null),
      ]
    );
  }
  await db.query(
    `INSERT INTO catalog_meta (id, is_original, updated_at) VALUES (1, true, now())
     ON CONFLICT (id) DO UPDATE SET is_original = true, updated_at = now()`
  );
}

const pgStore = {
  kind: 'postgres',

  async init() {
    if (!initPromise) initPromise = initPg().catch((e) => { initPromise = null; throw e; });
    return initPromise;
  },

  async list() {
    const db = getPool();
    const [items, meta] = await Promise.all([
      db.query('SELECT barcode, name, price, note FROM products ORDER BY name, barcode'),
      db.query('SELECT is_original, updated_at FROM catalog_meta WHERE id = 1'),
    ]);
    return {
      items: items.rows.map(shape),
      meta: {
        count: items.rows.length,
        isOriginal: meta.rows[0] ? meta.rows[0].is_original : true,
        updatedAt: meta.rows[0] ? meta.rows[0].updated_at : null,
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
    const db = getPool();
    const { rows } = await db.query(
      `INSERT INTO products (barcode, name, price, note, updated_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (barcode) DO UPDATE
         SET name = EXCLUDED.name, price = EXCLUDED.price, note = EXCLUDED.note, updated_at = now()
       RETURNING (xmax = 0) AS inserted, barcode, name, price, note`,
      [item.barcode, item.name, item.price, item.note || null]
    );
    await touchMeta(db);
    return { product: shape(rows[0]), created: rows[0].inserted };
  },

  async bulk(items, mode) {
    const db = getPool();
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      if (mode === 'replace') {
        await client.query('DELETE FROM products');
      }
      const chunk = 500;
      for (let i = 0; i < items.length; i += chunk) {
        const part = items.slice(i, i + chunk);
        await client.query(
          `INSERT INTO products (barcode, name, price, note, updated_at)
           SELECT *, now() FROM UNNEST ($1::text[], $2::text[], $3::numeric[], $4::text[])
           ON CONFLICT (barcode) DO UPDATE
             SET name = EXCLUDED.name, price = EXCLUDED.price, note = EXCLUDED.note, updated_at = now()`,
          [
            part.map((p) => p.barcode),
            part.map((p) => p.name),
            part.map((p) => p.price),
            part.map((p) => p.note || null),
          ]
        );
      }
      await client.query(
        `UPDATE catalog_meta SET is_original = false, updated_at = now() WHERE id = 1`
      );
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
    return this.list();
  },

  async reset() {
    const db = getPool();
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM products');
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
    await seedPg(db);
    return this.list();
  },
};

async function touchMeta(db) {
  await db.query(`UPDATE catalog_meta SET is_original = false, updated_at = now() WHERE id = 1`);
}

/* ---------------------------------------------------------------- *
 *  In-memory fallback (local dev without DATABASE_URL)
 *  NOT persistent across serverless cold starts — meant for dev only.
 * ---------------------------------------------------------------- */
function seedMap() {
  const map = new Map();
  for (const p of SEED) {
    const bc = String(p.barcode || '').trim();
    if (bc && !map.has(bc)) map.set(bc, shape(p));
  }
  return map;
}

const memState = { map: seedMap(), isOriginal: true, updatedAt: null };

const memStore = {
  kind: 'memory',
  async init() {},
  async list() {
    const items = Array.from(memState.map.values()).sort((a, b) =>
      a.name.localeCompare(b.name, 'ar') || a.barcode.localeCompare(b.barcode)
    );
    return {
      items,
      meta: { count: items.length, isOriginal: memState.isOriginal, updatedAt: memState.updatedAt },
    };
  },
  async get(barcode) {
    return memState.map.get(barcode) || null;
  },
  async upsert(item) {
    const created = !memState.map.has(item.barcode);
    memState.map.set(item.barcode, shape(item));
    memState.isOriginal = false;
    memState.updatedAt = new Date().toISOString();
    return { product: memState.map.get(item.barcode), created };
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
