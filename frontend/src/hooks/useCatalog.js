import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Fuse from 'fuse.js';
import { api } from '../lib/api';
import { normalize } from '../lib/format';

/**
 * Loads the catalog from the API and exposes fast local lookup/search
 * (Map by barcode + Fuse.js fuzzy index) plus mutation helpers that
 * keep local state in sync with the server response.
 */
export function useCatalog() {
  const [items, setItems] = useState(null);      // null = loading
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState(null);
  const aliveRef = useRef(true);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await api.getCatalog();
      if (!aliveRef.current) return;
      setItems(data.items);
      setMeta(data.meta);
    } catch (e) {
      if (!aliveRef.current) return;
      setError(e);
    }
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    load();
    return () => { aliveRef.current = false; };
  }, [load]);

  const { byBarcode, fuse, flat } = useMemo(() => {
    const map = new Map();
    const list = [];
    (items || []).forEach((p) => {
      const bc = String(p.barcode || '').trim();
      if (!bc) return;
      if (!map.has(bc)) map.set(bc, p);
      list.push({ p, norm: normalize(p.name) });
    });
    const idx = new Fuse(list, {
      keys: ['norm'],
      threshold: 0.34,
      ignoreLocation: true,
      minMatchCharLength: 2,
    });
    return { byBarcode: map, fuse: idx, flat: list };
  }, [items]);

  const searchByName = useCallback(
    (term) => {
      const n = normalize(term);
      if (n.length < 2) return [];
      if (fuse) return fuse.search(n, { limit: 8 }).map((r) => r.item.p);
      const out = [];
      for (let i = 0; i < flat.length && out.length < 8; i++) {
        if (flat[i].norm.indexOf(n) !== -1) out.push(flat[i].p);
      }
      return out;
    },
    [fuse, flat]
  );

  /* -------- mutations (server is the source of truth) -------- */
  const applyResponse = useCallback((data) => {
    setItems(data.items);
    setMeta(data.meta);
  }, []);

  const upsertProduct = useCallback(async (item) => {
    const result = await api.upsertProduct(item);
    setItems((prev) => {
      const next = (prev || []).filter((p) => p.barcode !== result.product.barcode);
      next.push(result.product);
      return next;
    });
    setMeta((m) => (m ? { ...m, isOriginal: false, updatedAt: new Date().toISOString(), count: (m.count || 0) + (result.created ? 1 : 0) } : m));
    return result;
  }, []);

  const bulkImport = useCallback(async (list, mode) => {
    applyResponse(await api.bulkImport(list, mode));
  }, [applyResponse]);

  const resetCatalog = useCallback(async () => {
    applyResponse(await api.resetCatalog());
  }, [applyResponse]);

  return {
    items, meta, error,
    loading: items === null && !error,
    reload: load,
    byBarcode, searchByName,
    upsertProduct, bulkImport, resetCatalog,
  };
}
