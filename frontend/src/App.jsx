import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { STR } from './i18n';
import { hasPrice, isBarcode, normalize } from './lib/format';
import { beepHit, beepMiss, beepWarn, isMuted, setMuted } from './lib/sound';
import { applyTheme, resolveTheme, saveTheme, watchSystemTheme } from './lib/theme';
import { useCatalog } from './hooks/useCatalog';
import { useCart } from './hooks/useCart';
import TopBar from './components/TopBar';
import DisplayPanel from './components/DisplayPanel';
import ScanBox from './components/ScanBox';
import CartPanel from './components/CartPanel';
import TotalsDock from './components/TotalsDock';
import CameraDialog from './components/CameraDialog';
import CatalogDialog from './components/CatalogDialog';
import PrintSheet from './components/PrintSheet';

const IDLE = { type: 'idle' };

function readLang() {
  try { return localStorage.getItem('lang') === 'en' ? 'en' : 'ar'; } catch { return 'ar'; }
}

/** Desktop tills park the cursor in the field; phones must not, or the
    on-screen keyboard fights the user for the whole screen. */
function prefersKeyboardFocus() {
  return typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches;
}

export default function App() {
  const [lang, setLang] = useState(readLang);
  const [theme, setTheme] = useState(resolveTheme);
  const [muted, setMutedState] = useState(isMuted);
  const t = STR[lang];

  const catalog = useCatalog();
  const { items, meta, error, loading, stale, reload, byBarcode, searchByName } = catalog;
  const { cart, totals, lastTouched, addProduct, setQty, removeLine, clearCart, reconcile } = useCart();

  const [query, setQuery] = useState('');
  const [shown, setShown] = useState(IDLE);
  const [camOpen, setCamOpen] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [printDate, setPrintDate] = useState(null);
  const inputRef = useRef(null);

  /* Search runs against a deferred value so a fast scanner burst never blocks
     the keystrokes that follow it. */
  const deferredQuery = useDeferredValue(query);
  const results = useMemo(() => {
    const trimmed = deferredQuery.trim();
    if (!trimmed || isBarcode(normalize(trimmed))) return [];
    return searchByName(trimmed);
  }, [deferredQuery, searchByName]);

  /* ------------------------ document-level chrome ------------------------ */
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = t.dir;
    document.title = `${t.title} — ${STR[lang === 'ar' ? 'en' : 'ar'].title}`;
  }, [lang, t.dir, t.title]);

  useEffect(() => { applyTheme(theme); }, [theme]);
  useEffect(() => watchSystemTheme(setTheme), []);

  /* Prices on screen must match the catalog, not whatever was true at scan time. */
  useEffect(() => { reconcile(byBarcode); }, [byBarcode, reconcile]);

  /* Same rule for the customer-facing panel: correct a price in the catalog
     dialog and the big number behind it has to follow, not keep quoting the
     figure captured when the item was scanned. */
  const displayed = useMemo(() => {
    if (shown.type !== 'product') return shown;
    const fresh = byBarcode.get(shown.p.barcode);
    return fresh && fresh !== shown.p ? { type: 'product', p: fresh } : shown;
  }, [shown, byBarcode]);

  const toggleLang = useCallback(() => {
    setLang((prev) => {
      const next = prev === 'ar' ? 'en' : 'ar';
      try { localStorage.setItem('lang', next); } catch { /* ignore */ }
      return next;
    });
    inputRef.current?.focus();
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      saveTheme(next);
      return next;
    });
  }, []);

  const toggleSound = useCallback(() => {
    setMutedState((prev) => {
      setMuted(!prev);
      return !prev;
    });
  }, []);

  /** Put the cursor back in the field — a scanner types into whatever has focus. */
  const refocus = useCallback(() => {
    if (document.querySelector('dialog[open]')) return;
    inputRef.current?.focus();
  }, []);

  /* --------------------------- scan and search --------------------------- */
  const hit = useCallback((product) => {
    addProduct(product);
    setShown({ type: 'product', p: product });
    setQuery('');
    if (hasPrice(product)) beepHit(); else beepWarn();
  }, [addProduct]);

  const miss = useCallback((code) => {
    setShown({ type: 'miss', code });
    beepMiss();
  }, []);

  const submit = useCallback(() => {
    const value = normalize(query);
    if (!value) return;

    if (isBarcode(value)) {
      const product = byBarcode.get(value);
      if (product) hit(product);
      else { miss(value); setQuery(''); }
      return;
    }

    const matches = searchByName(value);
    if (matches.length === 1) {
      hit(matches[0]);
    } else if (!matches.length) {
      miss(query.trim());
      /* Select rather than clear: the operator can still read and edit what
         they typed, but the next scan — which is just fast typing — replaces
         it instead of being appended to a dead search term. */
      inputRef.current?.select();
    }
  }, [query, byBarcode, searchByName, hit, miss]);

  const clearField = useCallback(() => {
    setQuery('');
    setShown(IDLE);
    inputRef.current?.focus();
  }, []);

  const pickResult = useCallback((product) => {
    hit(product);
    inputRef.current?.focus();
  }, [hit]);

  /**
   * The camera keeps running between items, so this reports back what happened
   * instead of closing the dialog — the scanner confirms it in place.
   */
  const onCameraScan = useCallback((code) => {
    const product = byBarcode.get(code);
    if (!product) {
      miss(code);
      return { status: 'miss', code };
    }
    hit(product);
    return { status: hasPrice(product) ? 'hit' : 'warn', product };
  }, [byBarcode, hit, miss]);

  /* Stable identities: Dialog re-binds its close listener whenever these change. */
  const closeCamera = useCallback(() => { setCamOpen(false); refocus(); }, [refocus]);
  const closeCatalog = useCallback(() => { setCatalogOpen(false); refocus(); }, [refocus]);

  const doClearCart = useCallback(() => {
    if (!cart.length || !window.confirm(t.confirmClear)) return;
    clearCart();
    setShown(IDLE);
    inputRef.current?.focus();
  }, [cart.length, t.confirmClear, clearCart]);

  /* ------------------------------ printing ------------------------------ */
  const doPrint = useCallback(() => {
    if (!cart.length) return;
    setPrintDate(new Date().toLocaleString(t.locale));
  }, [cart.length, t.locale]);

  useEffect(() => {
    if (printDate === null) return undefined;
    /* Two frames: one to commit the sheet to the DOM, one to paint it. */
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => window.print());
    });
    return () => { cancelAnimationFrame(outer); cancelAnimationFrame(inner); };
  }, [printDate]);

  useEffect(() => {
    /* Ctrl+P bypasses the button, and the print stylesheet hides the app —
       so build the sheet synchronously before the browser takes its snapshot,
       or the user gets a blank page. */
    /* Always stamp a fresh time: afterprint doesn't fire reliably everywhere,
       so a leftover value would print the previous run's timestamp. */
    const before = () => flushSync(() => setPrintDate(new Date().toLocaleString(t.locale)));
    const after = () => setPrintDate(null);
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => {
      window.removeEventListener('beforeprint', before);
      window.removeEventListener('afterprint', after);
    };
  }, [t.locale]);

  /* -------------------------- keyboard shortcuts -------------------------- */
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'F2') { e.preventDefault(); refocus(); }
      else if (e.key === 'Delete' && document.activeElement !== inputRef.current
               && !document.querySelector('dialog[open]')) {
        e.preventDefault();
        doClearCart();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [refocus, doClearCart]);

  useEffect(() => {
    if (!prefersKeyboardFocus()) return undefined;
    const onClick = (e) => {
      if (e.target.closest('button,input,select,textarea,dialog,a,label')) return;
      /* Don't steal focus mid-selection, or dragging over a product name to
         copy it would wipe the selection the instant the drag ends. */
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed) return;
      refocus();
    };
    /* A scanner types into whatever has focus — if focus drifts to <body>,
       the next scan would be lost, so quietly take it back. */
    const timer = setInterval(() => {
      if (document.activeElement === document.body) refocus();
    }, 1200);
    document.addEventListener('click', onClick);
    return () => {
      document.removeEventListener('click', onClick);
      clearInterval(timer);
    };
  }, [refocus]);

  useEffect(() => { if (!loading && prefersKeyboardFocus()) inputRef.current?.focus(); }, [loading]);

  /* ---------------------------- catalog status ---------------------------- */
  const status = useMemo(() => {
    if (loading) return { text: t.catLoading, tone: 'busy' };
    if (error && !items) return { text: t.catError, tone: 'bad' };
    if (stale) return { text: t.catOffline, tone: 'warn' };
    if (!items) return { text: '', tone: 'ok' };

    const unpriced = items.reduce((n, p) => (hasPrice(p) ? n : n + 1), 0);
    const state = meta && meta.isOriginal === false
      ? `${t.catUpdated}${meta.updatedAt ? ` ${new Date(meta.updatedAt).toLocaleDateString(t.locale)}` : ''}`
      : t.catOriginal;
    const parts = [state, `${items.length} ${t.unitItems}`];
    if (unpriced) parts.push(`${unpriced} ${t.noPriceCount}`);
    return { text: parts.join(' · '), tone: 'ok' };
  }, [loading, error, stale, items, meta, t]);

  const header = (
    <TopBar
      t={t}
      statusText={status.text}
      statusTone={status.tone}
      theme={theme}
      muted={muted}
      onToggleTheme={toggleTheme}
      onToggleSound={toggleSound}
      onToggleLang={toggleLang}
      onOpenCatalog={() => setCatalogOpen(true)}
    />
  );

  /* Only a genuine cold start blocks the UI — a cached catalog renders at once. */
  if (loading || (error && !items)) {
    return (
      <>
        {header}
        <div className="boot">
          <span className={`mark mark-lg${loading ? ' is-loading' : ''}`} aria-hidden="true">
            {[2, 1, 3, 1, 2, 4, 1, 2, 1, 3].map((w, i) => <i key={i} style={{ width: w }} />)}
          </span>
          <p className="boot-text">{loading ? t.catLoading : t.catError}</p>
          {!loading && <button type="button" className="btn btn-solid" onClick={reload}>{t.retry}</button>}
        </div>
      </>
    );
  }

  return (
    <>
      {header}

      <main className="wrap">
        <section className="col col-scan">
          <DisplayPanel shown={displayed} t={t} />
          <ScanBox
            ref={inputRef}
            t={t}
            value={query}
            onChange={setQuery}
            onSubmit={submit}
            onClear={clearField}
            onOpenCamera={() => setCamOpen(true)}
            results={results}
            onPickResult={pickResult}
          />
        </section>

        <section className="col col-cart">
          <CartPanel
            t={t}
            cart={cart}
            totals={totals}
            lastTouched={lastTouched}
            onSetQty={setQty}
            onRemove={removeLine}
            onPrint={doPrint}
            onClear={doClearCart}
          />
          <TotalsDock t={t} totals={totals} />
        </section>
      </main>

      {printDate !== null && <PrintSheet t={t} cart={cart} totals={totals} date={printDate} />}

      <CameraDialog t={t} open={camOpen} onClose={closeCamera} onScan={onCameraScan} />
      <CatalogDialog
        t={t}
        open={catalogOpen}
        onClose={closeCatalog}
        catalog={items || []}
        onUpsert={catalog.upsertProduct}
        onRemove={catalog.removeProduct}
        onBulkImport={catalog.bulkImport}
        onReset={catalog.resetCatalog}
      />
    </>
  );
}
