import { money, withVat } from '../lib/format';

const EMPTY_BARS = [
  { height: '100%' },
  { height: '52%' },
  { height: '100%', width: '4px' },
  { height: '38%' },
  { height: '88%' },
  { height: '100%', width: '3px' },
  { height: '58%' },
  { height: '100%' },
];

export default function CartPanel({ t, cart, totals, lastTouched, onSetQty, onRemove, onPrint, onClear }) {
  return (
    <div className="panel">
      <div className="p-head">
        <span className="p-title">{t.listTitle}</span>
        <span className="p-count">
          {cart.length ? `${cart.length} ${t.unitItems} · ${totals.pieces} ${t.unitPieces}` : ''}
        </span>
        <span className="spacer" />
        <button className="ghost" onClick={onPrint}>{t.print}</button>
        <button className="ghost" onClick={onClear}>{t.clear}</button>
      </div>

      <div id="rows">
        {cart.map((l) => {
          const none = l.price === null || l.price === undefined;
          return (
            <div
              key={l.barcode}
              className={`row${none ? ' np' : ''}${l.barcode === lastTouched ? ' flash' : ''}`}
            >
              <div className="r-l">
                <div className="r-n">{l.name || '—'}</div>
                <div className="r-m">
                  <span className="n">{l.barcode}</span>
                  {none ? (
                    <span className="chip w">{t.noPrice}</span>
                  ) : (
                    <span className="chip">{t.each} <span className="n">{money(withVat(l.price))}</span></span>
                  )}
                  {l.note ? <span className="chip">{l.note}</span> : null}
                </div>
              </div>

              <div className="qty">
                <button aria-label="-" onClick={() => onSetQty(l.barcode, -1)}>−</button>
                <span className="n">{l.qty}</span>
                <button aria-label="+" onClick={() => onSetQty(l.barcode, 1)}>+</button>
              </div>

              <div className={`r-t${none ? ' none' : ''}`}>
                {none ? t.notCounted : <span className="n">{money(withVat(l.price) * l.qty)}</span>}
              </div>

              <button className="r-x" aria-label="remove" onClick={() => onRemove(l.barcode)}>×</button>
            </div>
          );
        })}
      </div>

      {cart.length === 0 && (
        <div className="empty">
          <span className="bars" aria-hidden="true">
            {EMPTY_BARS.map((s, i) => <i key={i} style={s} />)}
          </span>
          <p>{t.emptyTitle}</p>
          <small>{t.emptySub}</small>
        </div>
      )}
    </div>
  );
}
