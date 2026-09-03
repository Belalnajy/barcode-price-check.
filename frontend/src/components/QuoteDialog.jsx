import { useEffect, useState } from 'react';
import Dialog from './Dialog';
import { digitsOnly } from '../lib/format';

const EMPTY = { name: '', phone: '', vatNumber: '', address: '' };

/**
 * Customer form for saving the current list as a quote. Creating and editing
 * share this dialog: with an active quote it updates in place, otherwise it
 * creates a new one. `onSave(customer, andPrint)` resolves to the saved quote.
 */
export default function QuoteDialog({ t, open, onClose, activeQuote, onSave }) {
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { tone: 'bad'|'ok', text }

  /* Prefill from the quote being edited each time the dialog opens. */
  useEffect(() => {
    if (!open) return;
    setForm(activeQuote ? { ...EMPTY, ...activeQuote.customer } : EMPTY);
    setMsg(null);
  }, [open, activeQuote]);

  const setField = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function save(andPrint) {
    if (busy) return;
    const name = form.name.trim();
    if (!name) { setMsg({ tone: 'bad', text: t.needCustomerName }); return; }

    const vatNumber = digitsOnly(form.vatNumber);
    if (form.vatNumber.trim() && (vatNumber.length < 5 || vatNumber.length > 20)) {
      setMsg({ tone: 'bad', text: t.badVatNumber });
      return;
    }

    setBusy(true);
    setMsg(null);
    try {
      await onSave(
        { name, phone: form.phone.trim(), vatNumber, address: form.address.trim() },
        andPrint
      );
    } catch (e) {
      setMsg({ tone: 'bad', text: e && e.code === 'invalid_items' ? t.quoteNeedsItems : t.quoteSaveFailed });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={activeQuote ? t.quoteEditTitle(activeQuote.number) : t.quoteSaveTitle}
      closeLabel={t.close}
      footer={
        <>
          <span className="grow" />
          <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => save(true)}>
            {t.savePrintQuote}
          </button>
          <button type="button" className="btn btn-solid" disabled={busy} onClick={() => save(false)}>
            {busy ? t.saving : (activeQuote ? t.updateQuote : t.saveQuote)}
          </button>
        </>
      }
    >
      <p className="prose">{t.quoteDesc}</p>

      <form className="form" onSubmit={(e) => { e.preventDefault(); save(false); }}>
        <label className="input-wrap col-span">
          <span className="input-label">{t.fCustomerName}</span>
          <input type="text" value={form.name} onChange={setField('name')} autoFocus />
        </label>
        <label className="input-wrap">
          <span className="input-label">{t.fCustomerPhone}</span>
          <input type="text" inputMode="tel" className="n" dir="ltr" value={form.phone} onChange={setField('phone')} />
        </label>
        <label className="input-wrap">
          <span className="input-label">{t.fCustomerVat}</span>
          <input
            type="text"
            inputMode="numeric"
            className="n"
            dir="ltr"
            value={form.vatNumber}
            onChange={setField('vatNumber')}
            placeholder="3XXXXXXXXXXXXX3"
          />
        </label>
        <label className="input-wrap col-span">
          <span className="input-label">{t.fCustomerAddress}</span>
          <input type="text" value={form.address} onChange={setField('address')} />
        </label>
        {/* Hidden submit so Enter saves from any field. */}
        <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true" />
      </form>

      <p className={`hint${msg && msg.tone === 'bad' ? ' msg-bad' : ''}`} role="status">
        {msg ? msg.text : t.fCustomerVatHint}
      </p>
    </Dialog>
  );
}
