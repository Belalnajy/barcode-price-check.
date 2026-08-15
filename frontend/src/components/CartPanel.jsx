import { memo } from 'react';
import { hasPrice, lineTotal, money, withVat } from '../lib/format';
import { MAX_QTY } from '../hooks/useCart';

const EMPTY_MARK = [2, 1, 3, 1, 2, 4, 1, 2, 1, 3];

const CartRow = memo(function CartRow({ line, t, flash, onSetQty, onRemove }) {
  const priced = hasPrice(line);
  return (
    <li className={`line${priced ? '' : ' is-unpriced'}${flash ? ` ${flash}` : ''}`}>
      <div className="line-main">
        <p className="line-name" title={line.name}>{line.name || '—'}</p>
        <p className="line-meta">
          <span className="n line-code">{line.barcode}</span>
          {priced ? (
            <span className="tag">{t.each} <span className="n">{money(withVat(line.price))}</span></span>
          ) : (
            <span className="tag is-warn">{t.noPrice}</span>
          )}
          {line.note ? <span className="tag">{line.note}</span> : null}
        </p>
      </div>

      <div className="stepper">
        <button
          type="button"
          aria-label={`${t.less} — ${line.name || line.barcode}`}
          onClick={() => onSetQty(line.barcode, -1)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 12h12" /></svg>
        </button>
        <span className="stepper-value n">{line.qty}</span>
        <button
          type="button"
          aria-label={`${t.more} — ${line.name || line.barcode}`}
          disabled={line.qty >= MAX_QTY}
          onClick={() => onSetQty(line.barcode, 1)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 6v12M6 12h12" /></svg>
        </button>
      </div>

      <p className={`line-total${priced ? '' : ' is-none'}`}>
        {priced ? <span className="n">{money(lineTotal(line.price, line.qty))}</span> : t.notCounted}
      </p>

      <button
        type="button"
        className="line-remove"
        aria-label={`${t.removeLine} — ${line.name || line.barcode}`}
        onClick={() => onRemove(line.barcode)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M7 7l10 10M17 7L7 17" /></svg>
      </button>
    </li>
  );
});

function CartPanel({ t, cart, totals, lastTouched, onSetQty, onRemove, onPrint, onClear }) {
  const empty = cart.length === 0;

  return (
    <section className="panel cart">
      <header className="panel-head">
        <h2 className="panel-title">{t.listTitle}</h2>
        {!empty && (
          <p className="panel-sub">
            <span className="n">{cart.length}</span> {t.unitItems}
            <span className="dot-sep" aria-hidden="true" />
            <span className="n">{totals.pieces}</span> {t.unitPieces}
          </p>
        )}
        <div className="panel-actions">
          <button type="button" className="btn btn-quiet btn-sm" onClick={onPrint} disabled={empty}>
            {t.print}
          </button>
          <button type="button" className="btn btn-quiet btn-sm" onClick={onClear} disabled={empty}>
            {t.clear}
          </button>
        </div>
      </header>

      {empty ? (
        <div className="empty">
          <span className="mark mark-lg" aria-hidden="true">
            {EMPTY_MARK.map((w, i) => <i key={i} style={{ width: w }} />)}
          </span>
          <p className="empty-title">{t.emptyTitle}</p>
          <p className="empty-sub">{t.emptySub}</p>
        </div>
      ) : (
        <ul className="lines">
          {cart.map((line) => (
            <CartRow
              key={line.barcode}
              line={line}
              t={t}
              /* Alternating class names so a repeat scan of the same product
                 restarts the highlight instead of re-applying a finished one. */
              flash={
                line.barcode === lastTouched.barcode
                  ? (lastTouched.seq % 2 ? 'is-new-a' : 'is-new-b')
                  : ''
              }
              onSetQty={onSetQty}
              onRemove={onRemove}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

export default memo(CartPanel);
