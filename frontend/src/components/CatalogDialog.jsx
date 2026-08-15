import { useCallback, useDeferredValue, useMemo, useRef, useState } from 'react';
import Dialog from './Dialog';
import VirtualList from './VirtualList';
import { digitsOnly, hasPrice, money, normalize, parsePrice, withVat } from '../lib/format';
import { exportCsv, parseWorkbooks } from '../lib/excel';

const EMPTY_FORM = { name: '', barcode: '', price: '', note: '' };
const ROW_H = 62;

/** Two catalogs differ on a product when the price moves or the name changes. */
function differs(a, b) {
  const priceA = hasPrice(a) ? Number(a.price) : null;
  const priceB = hasPrice(b) ? Number(b.price) : null;
  return priceA !== priceB || (a.name || '') !== (b.name || '');
}

function ProductRow({ product, t, onEdit, onDelete, busy }) {
  return (
    <div className="prow">
      <div className="prow-main">
        <p className="prow-name" title={product.name}>{product.name || '—'}</p>
        <p className="prow-code n">{product.barcode}</p>
      </div>
      <p className={`prow-price${hasPrice(product) ? '' : ' is-none'}`}>
        {hasPrice(product)
          ? <><span className="n">{money(withVat(product.price))}</span> <small>{t.cur}</small></>
          : t.noPrice}
      </p>
      <div className="prow-actions">
        <button type="button" className="icon-btn" title={t.edit} aria-label={`${t.edit} — ${product.name || product.barcode}`} onClick={() => onEdit(product)}>
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3z" /><path d="M14.5 6.5l3 3" />
          </svg>
        </button>
        <button type="button" className="icon-btn is-danger" title={t.delete} aria-label={`${t.delete} — ${product.name || product.barcode}`} disabled={busy} onClick={() => onDelete(product)}>
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" /><path d="M10 11v6M14 11v6" />
          </svg>
        </button>
      </div>
    </div>
  );
}

/**
 * "Products & prices": browse and edit the live catalog, add products by hand,
 * or import one or more sheets with a diff preview before anything is written.
 */
export default function CatalogDialog({
  t, open, onClose, catalog, onUpsert, onRemove, onBulkImport, onReset,
}) {
  const [tab, setTab] = useState('products');

  /* editor — doubles as "add new" and "edit existing". Collapsed by default so
     the product list gets the room; editing a row opens it automatically. */
  const [form, setForm] = useState(EMPTY_FORM);
  const [editing, setEditing] = useState(null); // barcode being edited
  const [formOpen, setFormOpen] = useState(false);
  const [formMsg, setFormMsg] = useState(null);
  const [saving, setSaving] = useState(false);
  const nameRef = useRef(null);

  /* browse */
  const [term, setTerm] = useState('');
  const deferredTerm = useDeferredValue(term);

  /* import */
  const [mode, setMode] = useState('merge');
  const [pending, setPending] = useState(null);
  const [note, setNote] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);

  const setField = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  /* --------------------------- browse + filter --------------------------- */
  const filtered = useMemo(() => {
    const q = normalize(deferredTerm);
    if (!q) return catalog;
    return catalog.filter(
      (p) => normalize(p.name).includes(q) || p.barcode.includes(q)
    );
  }, [catalog, deferredTerm]);

  /* ------------------------------ editing ------------------------------ */
  const startEdit = useCallback((product) => {
    setEditing(product.barcode);
    setFormOpen(true);
    setForm({
      name: product.name || '',
      barcode: product.barcode,
      price: hasPrice(product) ? String(product.price) : '',
      note: product.note || '',
    });
    setFormMsg(null);
    /* The form is above the list; make sure it's actually in view. */
    requestAnimationFrame(() => {
      nameRef.current?.scrollIntoView({ block: 'nearest' });
      nameRef.current?.focus();
    });
  }, []);

  const closeEditor = useCallback(() => {
    setEditing(null);
    setFormOpen(false);
    setForm(EMPTY_FORM);
    setFormMsg(null);
  }, []);

  const startAdd = useCallback(() => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormMsg(null);
    setFormOpen(true);
    requestAnimationFrame(() => nameRef.current?.focus());
  }, []);

  const save = async () => {
    if (saving) return;
    const name = form.name.trim();
    const barcode = digitsOnly(form.barcode);
    if (barcode.length < 4) { setFormMsg({ tone: 'bad', node: t.needBarcode }); return; }
    if (!name) { setFormMsg({ tone: 'bad', node: t.needName }); return; }

    const price = parsePrice(form.price);
    if (price === undefined) { setFormMsg({ tone: 'bad', node: t.needNumber }); return; }

    setSaving(true);
    try {
      const { created } = await onUpsert({
        name, barcode, price, note: form.note.trim() || null,
      });
      setFormMsg({
        tone: 'ok',
        node: (created ? t.savedAdded : t.savedUpdated) + name
          + (price === null ? t.withoutPrice : t.atPrice(money(withVat(price)))),
      });
      setForm(EMPTY_FORM);
      setEditing(null);
      setFormOpen(false);
    } catch {
      setFormMsg({ tone: 'bad', node: t.saveFailed });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (product) => {
    if (busy || !window.confirm(t.confirmDelete(product.name || product.barcode))) return;
    setBusy(true);
    try {
      await onRemove(product.barcode);
      if (editing === product.barcode) closeEditor();
      setFormMsg({ tone: 'ok', node: t.deleted + (product.name || product.barcode) });
    } catch {
      setFormMsg({ tone: 'bad', node: t.saveFailed });
    } finally {
      setBusy(false);
    }
  };

  /* ------------------------------ importing ------------------------------ */
  const diff = useMemo(() => {
    if (!pending) return null;
    const current = new Map(catalog.map((p) => [String(p.barcode).trim(), p]));
    const incoming = new Map(pending.items.map((p) => [p.barcode, p]));

    let added = 0;
    let changed = 0;
    let noPrice = 0;
    for (const item of pending.items) {
      if (!hasPrice(item)) noPrice++;
      const existing = current.get(item.barcode);
      if (!existing) added++;
      else if (differs(existing, item)) changed++;
    }

    let removed = 0;
    if (mode === 'replace') {
      for (const barcode of current.keys()) if (!incoming.has(barcode)) removed++;
    }

    return {
      total: pending.items.length,
      added,
      changed,
      removed,
      noPrice,
      kept: Math.max(0, catalog.length - changed - removed),
      finalCount: mode === 'replace' ? pending.items.length : catalog.length + added,
    };
  }, [pending, mode, catalog]);

  const handleFiles = useCallback(async (list) => {
    const files = Array.from(list || []).filter(Boolean);
    if (!files.length) return;
    setNote(null);
    setBusy(true);
    try {
      // Re-parse everything so removing a file and adding another stays correct.
      const previous = pending ? pending.sources : [];
      const parsed = await parseWorkbooks(previous.concat(files));
      setPending({ ...parsed, sources: previous.concat(files) });
    } catch (e) {
      const code = e && e.code;
      setNote({
        tone: 'bad',
        node: code === 'too_many_rows' ? t.tooManyRows : code === 'no_rows' ? t.noRows : t.badFile,
      });
    } finally {
      setBusy(false);
    }
  }, [pending, t]);

  const dropFile = useCallback(async (index) => {
    if (!pending) return;
    const sources = pending.sources.filter((_, i) => i !== index);
    if (!sources.length) { setPending(null); return; }
    setBusy(true);
    try {
      const parsed = await parseWorkbooks(sources);
      setPending({ ...parsed, sources });
    } catch {
      setPending(null);
    } finally {
      setBusy(false);
    }
  }, [pending]);

  const applyPending = async () => {
    if (!pending || busy) return;
    setBusy(true);
    try {
      await onBulkImport(pending.items, mode);
      setPending(null);
      setNote({ tone: 'ok', node: mode === 'replace' ? t.doneReplace : t.doneMerge });
      setTab('products');
    } catch {
      setNote({ tone: 'bad', node: t.saveFailed });
    } finally {
      setBusy(false);
    }
  };

  const resetAll = async () => {
    if (busy || !window.confirm(t.confirmReset)) return;
    setBusy(true);
    try {
      await onReset();
      setPending(null);
      setNote({ tone: 'ok', node: t.doneReset });
    } catch {
      setNote({ tone: 'bad', node: t.saveFailed });
    } finally {
      setBusy(false);
    }
  };

  const onDragEnter = (e) => { e.preventDefault(); dragDepth.current += 1; setDragging(true); };
  const onDragLeave = () => { dragDepth.current -= 1; if (dragDepth.current <= 0) setDragging(false); };
  const onDrop = (e) => {
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const tone = (v) => (v === 'bad' ? 'msg-bad' : 'msg-ok');

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t.btnCatalog}
      closeLabel={t.close}
      wide
      footer={
        <>
          <button type="button" className="btn btn-quiet" onClick={() => exportCsv(catalog, t.csvName)}>
            {t.export}
          </button>
          <button type="button" className="btn btn-quiet" onClick={resetAll} disabled={busy}>
            {t.reset}
          </button>
          <span className="grow" />
          {tab === 'import' && (
            <button type="button" className="btn btn-solid" onClick={applyPending} disabled={!pending || busy}>
              {busy && pending ? t.applying : t.apply}
            </button>
          )}
        </>
      }
    >
      <div className="tabs" role="tablist">
        <button
          type="button" role="tab" id="tab-products"
          aria-selected={tab === 'products'} aria-controls="panel-products"
          className={`tab${tab === 'products' ? ' is-on' : ''}`}
          onClick={() => setTab('products')}
        >
          {t.tabProducts}<span className="tab-count n">{catalog.length}</span>
        </button>
        <button
          type="button" role="tab" id="tab-import"
          aria-selected={tab === 'import'} aria-controls="panel-import"
          className={`tab${tab === 'import' ? ' is-on' : ''}`}
          onClick={() => setTab('import')}
        >
          {t.tabImport}{pending ? <span className="tab-count n">{pending.sources.length}</span> : null}
        </button>
      </div>

      {/* ------------------------- products tab ------------------------- */}
      {tab === 'products' && (
        <div role="tabpanel" id="panel-products" aria-labelledby="tab-products">
          {!formOpen && (
            <button type="button" className="btn btn-quiet add-trigger" onClick={startAdd}>
              <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
                <path d="M12 6v12M6 12h12" />
              </svg>
              {t.addOne}
            </button>
          )}

          {formOpen && (
          <div className={`editor${editing ? ' is-editing' : ''}`}>
            <div className="editor-head">
              <h3 className="section-title">{editing ? t.editingTitle : t.addOne}</h3>
              <button type="button" className="btn btn-quiet btn-sm" onClick={closeEditor}>
                {t.cancelEdit}
              </button>
            </div>

            <form className="form" onSubmit={(e) => { e.preventDefault(); save(); }}>
              <label className="input-wrap col-span">
                <span className="input-label">{t.fName}</span>
                <input ref={nameRef} type="text" value={form.name} onChange={setField('name')} placeholder={t.fName} />
              </label>
              <label className="input-wrap">
                <span className="input-label">{t.fBarcode}</span>
                <input
                  type="text" inputMode="numeric" className="n"
                  value={form.barcode} onChange={setField('barcode')}
                  placeholder="6285534145371"
                  /* The barcode is the identity of the row being edited. */
                  readOnly={Boolean(editing)}
                />
              </label>
              <label className="input-wrap">
                <span className="input-label">{t.fPrice}</span>
                <input type="text" inputMode="decimal" className="n" value={form.price} onChange={setField('price')} placeholder="0.00" />
              </label>
              <label className="input-wrap col-span">
                <span className="input-label">{t.fNote}</span>
                <input type="text" value={form.note} onChange={setField('note')} placeholder={t.fNoteHint} />
              </label>
              <button type="submit" className="btn btn-solid col-span" disabled={saving}>
                {saving ? t.saving : editing ? t.saveChanges : t.save}
              </button>
            </form>
            <p className={`hint${formMsg ? ` ${tone(formMsg.tone)}` : ''}`} role="status">
              {formMsg ? formMsg.node : t.manualHint}
            </p>
          </div>
          )}

          {/* Result of the last save/delete, kept visible once the form closes. */}
          {!formOpen && formMsg && (
            <p className={`hint ${tone(formMsg.tone)}`} role="status">{formMsg.node}</p>
          )}

          <div className="browse">
            <div className="browse-head">
              <label className="search">
                <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <circle cx="11" cy="11" r="6.5" /><path d="M16 16l4 4" />
                </svg>
                <input
                  type="search" value={term} onChange={(e) => setTerm(e.target.value)}
                  placeholder={t.searchProducts} aria-label={t.searchProducts}
                />
              </label>
              <p className="browse-count">
                <span className="n">{filtered.length}</span>
                {filtered.length !== catalog.length ? <> / <span className="n">{catalog.length}</span></> : null}
              </p>
            </div>

            <VirtualList
              items={filtered}
              rowHeight={ROW_H}
              className="plist"
              empty={<p className="browse-empty">{t.noMatches}</p>}
              renderRow={(product) => (
                <div
                  key={product.barcode}
                  style={{ height: ROW_H }}
                  className={editing === product.barcode ? 'prow-slot is-editing' : 'prow-slot'}
                >
                  <ProductRow product={product} t={t} busy={busy} onEdit={startEdit} onDelete={remove} />
                </div>
              )}
            />
          </div>
        </div>
      )}

      {/* -------------------------- import tab -------------------------- */}
      {tab === 'import' && (
        <div role="tabpanel" id="panel-import" aria-labelledby="tab-import">
          <p className="prose">{t.uploadDesc}</p>

          <div className="choices">
            {[
              { key: 'merge', label: t.modeMerge, sub: t.modeMergeSub },
              { key: 'replace', label: t.modeReplace, sub: t.modeReplaceSub },
            ].map((option) => (
              <label key={option.key} className={`choice${mode === option.key ? ' is-on' : ''}`}>
                <input
                  type="radio" name="import-mode" value={option.key}
                  checked={mode === option.key} onChange={() => setMode(option.key)}
                />
                <span>
                  <strong>{option.label}</strong>
                  <small>{option.sub}</small>
                </span>
              </label>
            ))}
          </div>

          <label
            className={`drop${dragging ? ' is-over' : ''}`}
            onDragOver={(e) => e.preventDefault()}
            onDragEnter={onDragEnter}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 16V4M8 8l4-4 4 4" />
              <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
            </svg>
            <span>{dragging ? t.dropActive : pending ? t.dropMore : t.drop}</span>
            {/* Clipped rather than `hidden`: display:none would drop it out of the
                tab order and leave importing mouse-only. */}
            <input
              type="file" accept=".xlsx,.xls" multiple className="sr-only"
              onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }}
            />
          </label>

          {pending && (
            <ul className="files">
              {pending.files.map((file, i) => (
                <li key={`${file.name}-${i}`} className={`file${file.error ? ' is-bad' : ''}`}>
                  <span className="file-name" title={file.name}>{file.name}</span>
                  <span className="file-meta">
                    {file.error
                      ? t.fileUnreadable
                      : <><span className="n">{file.count}</span> {t.unitItems}</>}
                  </span>
                  <button
                    type="button" className="icon-btn" disabled={busy}
                    aria-label={`${t.removeFile} — ${file.name}`} title={t.removeFile}
                    onClick={() => dropFile(i)}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                      <path d="M7 7l10 10M17 7L7 17" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {diff && (
            <div className="diff">
              <dl className="diff-grid">
                <div className="stat is-add"><dt>{t.dNew}</dt><dd className="n">{diff.added}</dd></div>
                <div className="stat is-change"><dt>{t.dChanged}</dt><dd className="n">{diff.changed}</dd></div>
                <div className={mode === 'replace' ? 'stat is-remove' : 'stat'}>
                  <dt>{mode === 'replace' ? t.dRemoved : t.dKept}</dt>
                  <dd className="n">{mode === 'replace' ? diff.removed : diff.kept}</dd>
                </div>
                <div className="stat is-warn"><dt>{t.dNoPrice}</dt><dd className="n">{diff.noPrice}</dd></div>
              </dl>
              <p className="prose">
                {t.summary(diff.total, diff.finalCount)}
                {pending.warn ? t.vatWarn(pending.warn) : null}
                {pending.skipped ? t.skippedRows(pending.skipped) : null}
              </p>
            </div>
          )}

          {note && <p className={`hint ${tone(note.tone)}`} role="status">{note.node}</p>}
        </div>
      )}
    </Dialog>
  );
}
