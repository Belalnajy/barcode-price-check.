import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { STR } from './i18n';
import { isBarcode, normalize } from './lib/format';
import { beepHit, beepMiss } from './lib/sound';
import { useCatalog } from './hooks/useCatalog';
import { useCart } from './hooks/useCart';
import TopBar from './components/TopBar';
import DisplayPanel from './components/DisplayPanel';
import ScanBox from './components/ScanBox';
import CartPanel from './components/CartPanel';
import TotalsDock from './components/TotalsDock';
import CameraDialog from './components/CameraDialog';
import CatalogDialog from './components/CatalogDialog';
import { PrintHeader, PrintTotals } from './components/PrintExtras';

function readLang() {
  try { return localStorage.getItem('lang') === 'en' ? 'en' : 'ar'; } catch { return 'ar'; }
}

export default function App() {
  const [lang, setLang] = useState(readLang);
  const t = STR[lang];

  const catalogState = useCatalog();
  const { items, meta, error, loading, reload, byBarcode, searchByName } = catalogState;
  const { cart, totals, addProduct, setQty, removeLine, clearCart, lastTouchedRef } = useCart();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [shown, setShown] = useState({ type: 'idle' });
  const [camOpen, setCamOpen] = useState(false);
  const [setOpen, setSetOpen] = useState(false);
  const [printDate, setPrintDate] = useState('');
  const inputRef = useRef(null);

  /* ------------- language: <html lang/dir> + title ------------- */
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = t.dir;
    document.title = `${STR.ar.brand} — ${STR.en.brand}`;
  }, [lang, t.dir]);

  const toggleLang = useCallback(() => {
    setLang((prev) => {
      const next = prev === 'ar' ? 'en' : 'ar';
      try { localStorage.setItem('lang', next); } catch { /* ignore */ }
      return next;
    });
    inputRef.current?.focus();
  }, []);

  /* ----------------------- scan / search ----------------------- */
  const hit = useCallback((p) => {
    addProduct(p);
    setShown({ type: 'product', p });
    setQuery('');
    setResults([]);
    beepHit();
  }, [addProduct]);

  const miss = useCallback((code) => {
    setShown({ type: 'miss', code });
    beepMiss();
  }, []);

  const submit = useCallback(() => {
    const v = normalize(query);
    if (!v) return;
    if (isBarcode(v)) {
      const p = byBarcode.get(v);
      if (p) hit(p); else { miss(v); setQuery(''); setResults([]); }
    } else {
      const list = searchByName(v);
      if (list.length === 1) hit(list[0]);
      else if (list.length) setResults(list);
      else miss(query);
    }
  }, [query, byBarcode, searchByName, hit, miss]);

  const onQueryChange = useCallback((v) => {
    setQuery(v);
    const trimmed = v.trim();
    setResults(isBarcode(normalize(trimmed)) ? [] : searchByName(trimmed));
  }, [searchByName]);

  const clearField = useCallback(() => {
    setQuery('');
    setResults([]);
    setShown({ type: 'idle' });
    inputRef.current?.focus();
  }, []);

  /* -------------------- global keyboard focus -------------------- */
  const refocus = useCallback(() => {
    if (document.querySelector('dialog[open]')) return;
    inputRef.current?.focus();
  }, []);

  const doClearCart = useCallback(() => {
    if (!cart.length) return;
    if (window.confirm(t.confirmClear)) {
      clearCart();
      setShown({ type: 'idle' });
      inputRef.current?.focus();
    }
  }, [cart.length, t.confirmClear, clearCart]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'F2') { e.preventDefault(); refocus(); }
      if (e.key === 'Delete' && document.activeElement !== inputRef.current) {
        e.preventDefault();
        doClearCart();
      }
    };
    const onClick = (e) => {
      if (e.target.closest('button,input,select,textarea,dialog,a,label')) return;
      refocus();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('click', onClick);
    const iv = setInterval(() => {
      if (document.activeElement === document.body) refocus();
    }, 1200);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('click', onClick);
      clearInterval(iv);
    };
  }, [refocus, doClearCart]);

  useEffect(() => { inputRef.current?.focus(); }, [loading]);

  /* --------------------------- camera --------------------------- */
  const onCameraScan = useCallback((code) => {
    setCamOpen(false);
    const p = byBarcode.get(code);
    if (p) hit(p); else miss(code);
  }, [byBarcode, hit, miss]);

  /* --------------------------- printing --------------------------- */
  const doPrint = useCallback(() => {
    setPrintDate(new Date().toLocaleString(t.locale));
    setTimeout(() => window.print(), 30);
  }, [t.locale]);

  /* ------------------------ catalog info line ------------------------ */
  const catInfo = useMemo(() => {
    if (loading) return t.catLoading;
    if (error) return t.catError;
    if (!items) return '';
    const noPrice = items.filter((p) => p.price === null || p.price === undefined).length;
    const state = meta && !meta.isOriginal
      ? `${t.catUpdated} ${meta.updatedAt ? new Date(meta.updatedAt).toLocaleDateString(t.locale) : ''}`.trim()
      : t.catOriginal;
    return `${state} · ${items.length} ${t.unitItems}${noPrice ? ` · ${noPrice} ${t.noPriceCount}` : ''}`;
  }, [loading, error, items, meta, t]);

  /* ----------------------- initial load screen ----------------------- */
  if (loading || (error && !items)) {
    return (
      <>
        <TopBar t={t} catInfo="" onToggleLang={toggleLang} onOpenSettings={() => {}} />
        <div className="boot">
          <span className="bars" aria-hidden="true">
            {[100, 52, 100, 38, 88, 100, 58, 100].map((h, i) => (
              <i key={i} style={{ height: `${h}%`, width: i === 2 ? 4 : i === 5 ? 3 : 2, background: '#CCD2D8' }} />
            ))}
          </span>
          <p>{error ? t.catError : t.catLoading}</p>
          {error && <button className="ghost" onClick={reload}>{t.retry}</button>}
        </div>
      </>
    );
  }

  return (
    <>
      <TopBar t={t} catInfo={catInfo} onToggleLang={toggleLang} onOpenSettings={() => setSetOpen(true)} />

      <main className="wrap">
        <section className="left">
          <DisplayPanel shown={shown} t={t} />
          <ScanBox
            ref={inputRef}
            t={t}
            value={query}
            onChange={onQueryChange}
            onSubmit={submit}
            onClear={clearField}
            onOpenCamera={() => setCamOpen(true)}
            results={results}
            onPickResult={(p) => { hit(p); inputRef.current?.focus(); }}
          />
        </section>

        <section className="right">
          <PrintHeader t={t} date={printDate} />
          <CartPanel
            t={t}
            cart={cart}
            totals={totals}
            lastTouched={lastTouchedRef.current}
            onSetQty={setQty}
            onRemove={removeLine}
            onPrint={doPrint}
            onClear={doClearCart}
          />
          <PrintTotals t={t} totals={totals} />
          <TotalsDock t={t} totals={totals} />
        </section>
      </main>

      <CameraDialog t={t} open={camOpen} onClose={() => { setCamOpen(false); inputRef.current?.focus(); }} onScan={onCameraScan} />
      <CatalogDialog
        t={t}
        open={setOpen}
        onClose={() => { setSetOpen(false); inputRef.current?.focus(); }}
        catalog={items || []}
        onUpsert={catalogState.upsertProduct}
        onBulkImport={catalogState.bulkImport}
        onReset={catalogState.resetCatalog}
      />
    </>
  );
}
