import { useEffect, useState } from 'react';
import Dialog from './Dialog';
import { api } from '../lib/api';
import { money } from '../lib/format';

/**
 * Saved quotes browser: reopen one to edit it (loads the list back into the
 * cart), or delete it. The list is fetched fresh every time the dialog opens —
 * quotes are shared between devices, so a cached copy would mislead.
 */
export default function QuotesDialog({ t, open, onClose, activeQuoteId, onOpenQuote }) {
  const [state, setState] = useState({ phase: 'loading', quotes: [] });
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    if (!open) return undefined;
    const ctrl = new AbortController();
    setState({ phase: 'loading', quotes: [] });
    api.listQuotes(ctrl.signal)
      .then(({ quotes }) => setState({ phase: 'ready', quotes }))
      .catch((e) => {
        if (!ctrl.signal.aborted) setState({ phase: 'error', quotes: [], code: e && e.code });
      });
    return () => ctrl.abort();
  }, [open]);

  async function remove(quote) {
    if (busyId || !window.confirm(t.confirmDeleteQuote(quote.number))) return;
    setBusyId(quote.id);
    try {
      await api.deleteQuote(quote.id);
      setState((s) => ({ ...s, quotes: s.quotes.filter((q) => q.id !== quote.id) }));
    } catch {
      setState((s) => ({ ...s, phase: 'error', code: 'delete_failed' }));
    } finally {
      setBusyId(null);
    }
  }

  const { phase, quotes } = state;

  return (
    <Dialog open={open} onClose={onClose} title={t.quotesTitle} closeLabel={t.close} wide>
      {phase === 'loading' && <p className="hint" role="status">{t.quotesLoading}</p>}
      {phase === 'error' && <p className="hint msg-bad" role="status">{t.quotesError}</p>}

      {phase === 'ready' && quotes.length === 0 && (
        <div className="empty">
          <p className="empty-title">{t.quotesEmpty}</p>
          <p className="empty-sub">{t.quotesEmptySub}</p>
        </div>
      )}

      {quotes.length > 0 && (
        <ul className="qlist">
          {quotes.map((quote) => (
            <li key={quote.id} className={`qrow${quote.id === activeQuoteId ? ' is-active' : ''}`}>
              <div className="qrow-main">
                <p className="qrow-name" title={quote.customer.name}>
                  <span className="n qrow-no">{quote.number}</span>
                  {quote.customer.name || '—'}
                </p>
                <p className="qrow-meta">
                  {quote.updatedAt ? new Date(quote.updatedAt).toLocaleDateString(t.locale) : ''}
                  <span className="dot-sep" aria-hidden="true" />
                  <span className="n">{quote.totals.lines}</span> {t.quoteItemsCount}
                  {quote.customer.vatNumber ? (
                    <>
                      <span className="dot-sep" aria-hidden="true" />
                      {t.printVatNo} <span className="n">{quote.customer.vatNumber}</span>
                    </>
                  ) : null}
                </p>
              </div>
              <p className="qrow-total">
                <span className="n">{money(quote.totals.all)}</span> <small>{t.cur}</small>
              </p>
              <div className="qrow-actions">
                <button
                  type="button"
                  className="btn btn-quiet btn-sm"
                  disabled={busyId !== null}
                  onClick={() => onOpenQuote(quote)}
                >
                  {t.openQuote}
                </button>
                <button
                  type="button"
                  className="icon-btn is-danger"
                  title={t.deleteQuote}
                  aria-label={`${t.deleteQuote} — ${quote.number}`}
                  disabled={busyId !== null}
                  onClick={() => remove(quote)}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
                    <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6.5 7l1 12a1 1 0 0 0 1 .9h7a1 1 0 0 0 1-.9l1-12" />
                  </svg>
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
