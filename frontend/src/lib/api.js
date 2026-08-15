/* Thin client for the Express serverless API. */

const TIMEOUT_MS = 15000;

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'network_error' } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

async function req(path, { body, method = 'GET', signal } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const relay = () => ctrl.abort();
  if (signal) signal.addEventListener('abort', relay, { once: true });

  /* The timeout has to cover reading the body too. A server that sends
     headers and then stalls would otherwise hang this promise forever, and
     the catalog screen would sit on "loading" with no way back. */
  try {
    const res = await fetch(`/api${path}`, {
      method,
      signal: ctrl.signal,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (!res.ok) {
      let code = `http_${res.status}`;
      try {
        const parsed = await res.json();
        if (parsed && parsed.error) code = parsed.error;
      } catch { /* non-JSON error body */ }
      throw new ApiError(code, { status: res.status, code });
    }

    return await res.json();
  } catch (e) {
    if (e instanceof ApiError) throw e;
    const code = e && e.name === 'AbortError' ? 'request_timeout' : 'network_error';
    throw new ApiError(code, { code });
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', relay);
  }
}

export const api = {
  /** → { items, meta:{ count, isOriginal, updatedAt } } */
  getCatalog: (signal) => req('/products', { signal }),
  /** → { product, created } */
  upsertProduct: (item) => req('/products', { method: 'POST', body: item }),
  /** → { deleted, barcode } */
  deleteProduct: (barcode) => req(`/products/${encodeURIComponent(barcode)}`, { method: 'DELETE' }),
  /** → { items, meta, imported, skipped } */
  bulkImport: (items, mode) => req('/products/bulk', { method: 'POST', body: { items, mode } }),
  /** → { items, meta } */
  resetCatalog: () => req('/products/reset', { method: 'POST' }),
};
