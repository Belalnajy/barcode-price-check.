/* Thin client for the Express serverless API. */
async function req(path, options) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    let body = null;
    try { body = await res.json(); } catch { /* ignore */ }
    const err = new Error((body && body.error) || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export const api = {
  /** → { items, meta:{count,isOriginal,updatedAt} } */
  getCatalog: () => req('/products'),
  /** → { product, created } */
  upsertProduct: (item) => req('/products', { method: 'POST', body: JSON.stringify(item) }),
  /** → { items, meta } */
  bulkImport: (items, mode) => req('/products/bulk', { method: 'POST', body: JSON.stringify({ items, mode }) }),
  /** → { items, meta } */
  resetCatalog: () => req('/products/reset', { method: 'POST' }),
};
