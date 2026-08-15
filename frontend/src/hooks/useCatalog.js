import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Fuse from 'fuse.js';
import { api } from '../lib/api';
import { normalize } from '../lib/format';

const CACHE_KEY = 'catalog.v1';
const RESULT_LIMIT = 8;

/* ------------------------- local snapshot cache ------------------------- */
/* The catalog is ~1400 rows and changes rarely, so the last copy is kept on
   the device. The app boots from it instantly and revalidates in the
   background — and stays usable when the network is down. */

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.items)) return null;
    return { items: data.items, meta: data.meta || null };
  } catch {
    return null;
  }
}

function writeCache(items, meta) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ items, meta }));
  } catch {
    /* quota exceeded or storage disabled — the app works without the cache */
  }
}

/** Same order the API returns, so local edits don't shuffle the list. */
function sortItems(items) {
  return [...items].sort(
    (a, b) => (a.name || '').localeCompare(b.name || '', 'ar') || a.barcode.localeCompare(b.barcode)
  );
}

/**
 * Loads the catalog (cache-first, then network) and exposes fast lookup:
 * a Map by barcode plus a ranked name search over an exact + fuzzy index.
 */
export function useCatalog() {
  const cached = useRef(undefined);
  if (cached.current === undefined) cached.current = readCache();

  const [items, setItems] = useState(() => (cached.current ? cached.current.items : null));
  const [meta, setMeta] = useState(() => (cached.current ? cached.current.meta : null));
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(true);
  const aliveRef = useRef(true);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const data = await api.getCatalog();
      if (!aliveRef.current) return;
      setItems(data.items);
      setMeta(data.meta);
      setError(null);
    } catch (e) {
      if (!aliveRef.current) return;
      setError(e);
    } finally {
      if (aliveRef.current) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    load();
    return () => { aliveRef.current = false; };
  }, [load]);

  /* Revalidate when the device comes back online. */
  useEffect(() => {
    const onOnline = () => load();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [load]);

  /* Keep the device snapshot in step with whatever is on screen. Skip the
     rows we just read back out of it — re-serialising ~140 KB on boot for
     nothing would only slow the first paint down. */
  useEffect(() => {
    if (!items || (cached.current && items === cached.current.items)) return;
    writeCache(items, meta);
  }, [items, meta]);

  /* --------------------------- search indexes --------------------------- */
  const { byBarcode, entries, fuse } = useMemo(() => {
    const map = new Map();
    const list = [];
    for (const p of items || []) {
      const barcode = String(p.barcode || '').trim();
      if (!barcode || map.has(barcode)) continue;
      map.set(barcode, p);
      list.push({ p, norm: normalize(p.name) });
    }
    return {
      byBarcode: map,
      entries: list,
      fuse: new Fuse(list, {
        keys: ['norm'],
        threshold: 0.34,
        ignoreLocation: true,
        minMatchCharLength: 2,
      }),
    };
  }, [items]);

  /**
   * Exact matches first (prefix, then substring), fuzzy only to fill the rest —
   * typing a name you know should never bury it under a typo-tolerant guess.
   */
  const searchByName = useCallback((term) => {
    const q = normalize(term);
    if (q.length < 2) return [];

    const seen = new Set();
    const prefix = [];
    const contains = [];

    for (const entry of entries) {
      const at = entry.norm.indexOf(q);
      if (at === 0) prefix.push(entry.p);
      else if (at > 0) contains.push(entry.p);
      if (prefix.length >= RESULT_LIMIT) break;
    }

    const out = [];
    for (const p of prefix.concat(contains)) {
      if (out.length >= RESULT_LIMIT) break;
      if (seen.has(p.barcode)) continue;
      seen.add(p.barcode);
      out.push(p);
    }
    if (out.length >= RESULT_LIMIT) return out;

    for (const hit of fuse.search(q, { limit: RESULT_LIMIT })) {
      if (out.length >= RESULT_LIMIT) break;
      if (seen.has(hit.item.p.barcode)) continue;
      seen.add(hit.item.p.barcode);
      out.push(hit.item.p);
    }
    return out;
  }, [entries, fuse]);

  /* ---------------- mutations (the server is the source of truth) ---------------- */
  const applyServerState = useCallback((data) => {
    setItems(data.items);
    setMeta(data.meta);
    setError(null);
    return data;
  }, []);

  const upsertProduct = useCallback(async (item) => {
    const result = await api.upsertProduct(item);
    /* Re-sort so a locally added product lands where the server would put it. */
    setItems((prev) => {
      const rest = (prev || []).filter((p) => p.barcode !== result.product.barcode);
      return sortItems(rest.concat(result.product));
    });
    setMeta((m) => ({ ...(m || {}), isOriginal: false, updatedAt: new Date().toISOString() }));
    /* The write round-tripped, so we are demonstrably back online — otherwise
       the "showing a saved copy" warning would stick around for good. */
    setError(null);
    return result;
  }, []);

  const removeProduct = useCallback(async (barcode) => {
    await api.deleteProduct(barcode);
    setItems((prev) => (prev || []).filter((p) => p.barcode !== barcode));
    setMeta((m) => ({ ...(m || {}), isOriginal: false, updatedAt: new Date().toISOString() }));
    setError(null);
  }, []);

  const bulkImport = useCallback(
    async (list, mode) => applyServerState(await api.bulkImport(list, mode)),
    [applyServerState]
  );

  const resetCatalog = useCallback(
    async () => applyServerState(await api.resetCatalog()),
    [applyServerState]
  );

  return {
    items,
    meta,
    error,
    /* Only a cold start blocks the UI; a cached catalog renders immediately. */
    loading: items === null && !error,
    /* Showing cached rows because the last refresh failed. */
    stale: Boolean(error && items),
    refreshing,
    reload: load,
    byBarcode,
    searchByName,
    upsertProduct,
    removeProduct,
    bulkImport,
    resetCatalog,
  };
}
