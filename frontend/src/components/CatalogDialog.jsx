import { useEffect, useMemo, useRef, useState } from 'react';
import { money, normalize, round2, withVat } from '../lib/format';
import { exportCsv, parseWorkbook } from '../lib/excel';

/**
 * "Products & prices" dialog: manual add, Excel import with diff preview
 * (merge / replace), CSV export and reset to the original list.
 */
export default function CatalogDialog({
  t, open, onClose,
  catalog, onUpsert, onBulkImport, onReset,
}) {
  const dlgRef = useRef(null);

  /* manual add form */
  const [mName, setMName] = useState('');
  const [mBarcode, setMBarcode] = useState('');
  const [mPrice, setMPrice] = useState('');
  const [mMsg, setMMsg] = useState(null); // {kind:'hint'|'ok'|'bad', node}
  const [savingOne, setSavingOne] = useState(false);

  /* excel import */
  const [mode, setMode] = useState('merge');
  const [pending, setPending] = useState(null); // {items, warn}
  const [note, setNote] = useState(null);       // {kind:'ok'|'bad'|'strong', node}
  const [applying, setApplying] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    const dlg = dlgRef.current;
    if (!dlg) return;
    if (open && !dlg.open) dlg.showModal();
    else if (!open && dlg.open) dlg.close();
  }, [open]);

  useEffect(() => {
    const dlg = dlgRef.current;
    if (!dlg) return;
    const handleClose = () => onClose();
    dlg.addEventListener('close', handleClose);
    return () => dlg.removeEventListener('close', handleClose);
  }, [onClose]);

  /* -------- diff between the parsed file and the current catalog -------- */
  const diff = useMemo(() => {
    if (!pending) return null;
    const items = pending.items;
    const oldMap = new Map(catalog.map((p) => [String(p.barcode).trim(), p]));
    const newMap = new Map(items.map((p) => [p.barcode, p]));
    let added = 0, changed = 0, removed = 0, noPrice = 0;
    items.forEach((p) => {
      if (p.price === null) noPrice++;
      const o = oldMap.get(p.barcode);
      if (!o) added++;
      else if (Number(o.price) !== Number(p.price)) changed++;
    });
    if (mode === 'replace') {
      oldMap.forEach((v, k) => { if (!newMap.has(k)) removed++; });
    }
    const finalCount = mode === 'replace' ? items.length : catalog.length + added;
    return { added, changed, removed, noPrice, kept: catalog.length - changed, finalCount, total: items.length };
  }, [pending, mode, catalog]);

  async function handleFile(file) {
    setNote(null);
    setPending(null);
    try {
      setPending(await parseWorkbook(file));
    } catch (e) {
      setNote({ kind: 'bad', node: e.code === 'no_rows' ? t.noRows : t.badFile });
    }
  }

  async function applyPending() {
    if (!pending || applying) return;
    setApplying(true);
    try {
      await onBulkImport(pending.items, mode);
      setPending(null);
      setNote({ kind: 'ok', node: mode === 'replace' ? t.doneReplace : t.doneMerge });
    } catch {
      setNote({ kind: 'bad', node: t.saveFailed });
    } finally {
      setApplying(false);
    }
  }

  async function saveManual() {
    if (savingOne) return;
    const name = mName.trim();
    const bc = normalize(mBarcode);
    const praw = normalize(mPrice).replace(/[^\d.]/g, '');
    if (!bc) { setMMsg({ kind: 'bad', node: t.needBarcode }); return; }
    if (!name) { setMMsg({ kind: 'bad', node: t.needName }); return; }
    const price = praw === '' ? null : Number(praw);
    if (price !== null && (Number.isNaN(price) || price < 0)) {
      setMMsg({ kind: 'bad', node: t.needNumber });
      return;
    }
    setSavingOne(true);
    try {
      const { created } = await onUpsert({
        name,
        barcode: bc,
        price: price === null ? null : round2(price),
        note: null,
      });
      setMMsg({
        kind: 'ok',
        node: (created ? t.added : t.updated) + name + (price === null ? t.withoutPrice : t.atPrice(money(withVat(price)))),
      });
      setMName(''); setMBarcode(''); setMPrice('');
    } catch {
      setMMsg({ kind: 'bad', node: t.saveFailed });
    } finally {
      setSavingOne(false);
    }
  }

  async function resetAll() {
    if (!window.confirm(t.confirmReset)) return;
    setApplying(true);
    try {
      await onReset();
      setPending(null);
      setNote({ kind: 'strong', node: t.doneReset });
    } catch {
      setNote({ kind: 'bad', node: t.saveFailed });
    } finally {
      setApplying(false);
    }
  }

  const msgClass = (kind) => (kind === 'bad' ? 'msg-bad' : kind === 'ok' ? 'msg-ok' : 'msg-strong');

  return (
    <dialog ref={dlgRef}>
      <div className="d-head">
        <h2>{t.btnCatalog}</h2>
        <button className="ghost" onClick={() => dlgRef.current?.close()}>{t.close}</button>
      </div>
      <div className="d-body">
        <p className="sec">{t.addOne}</p>
        <div className="form">
          <input type="text" placeholder={t.fName} value={mName} onChange={(e) => setMName(e.target.value)} />
          <input type="text" inputMode="numeric" className="mono" placeholder={t.fBarcode} value={mBarcode} onChange={(e) => setMBarcode(e.target.value)} />
          <input type="text" inputMode="decimal" className="mono" placeholder={t.fPrice} value={mPrice} onChange={(e) => setMPrice(e.target.value)} />
          <button className="solid" onClick={saveManual} disabled={savingOne}>
            {savingOne ? t.saving : t.save}
          </button>
        </div>
        <p className={`mini ${mMsg ? msgClass(mMsg.kind) : ''}`}>{mMsg ? mMsg.node : t.manualHint}</p>

        <p className="sec mt">{t.uploadTitle}</p>
        <p>{t.uploadDesc}</p>
        <div className="modes">
          <label>
            <input type="radio" name="mode" value="merge" checked={mode === 'merge'} onChange={() => setMode('merge')} />
            <span>{t.modeMerge}</span>
          </label>
          <label>
            <input type="radio" name="mode" value="replace" checked={mode === 'replace'} onChange={() => setMode('replace')} />
            <span>{t.modeReplace}</span>
          </label>
        </div>
        <label
          className="drop"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); }}
        >
          {t.drop}
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            hidden
            onChange={(e) => { if (e.target.files[0]) handleFile(e.target.files[0]); e.target.value = ''; }}
          />
        </label>

        <div>
          {diff && (
            <>
              <div className="diff">
                <div>{t.dNew}<b className="n">{diff.added}</b></div>
                <div>{t.dChanged}<b className="n">{diff.changed}</b></div>
                <div>
                  {mode === 'replace' ? t.dRemoved : t.dKept}
                  <b className="n">{mode === 'replace' ? diff.removed : diff.kept}</b>
                </div>
                <div>{t.dNoPrice}<b className="n">{diff.noPrice}</b></div>
              </div>
              <p style={{ marginTop: 13 }}>
                {t.summary(diff.total, diff.finalCount)}
                {pending.warn ? t.vatWarn(pending.warn) : null}
              </p>
            </>
          )}
          {note && <p className={msgClass(note.kind)}>{note.node}</p>}
        </div>
      </div>
      <div className="d-foot">
        <button className="ghost" onClick={() => exportCsv(catalog, t.csvName)}>{t.export}</button>
        <button className="ghost" onClick={resetAll} disabled={applying}>{t.reset}</button>
        <button className="solid" onClick={applyPending} disabled={!pending || applying}>
          {applying ? t.applying : t.apply}
        </button>
      </div>
    </dialog>
  );
}
