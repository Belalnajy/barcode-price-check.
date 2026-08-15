import { hasPrice, lineTotal, money, withVat } from '../lib/format';

/**
 * Paper version of the list. The screen layout is grid-and-flex heavy, so the
 * printed sheet is rendered from its own simple table rather than trying to
 * bend the interactive markup into A4.
 */
export default function PrintSheet({ t, cart, totals, date }) {
  /* Ctrl+P works whether or not anything has been scanned, and the print
     stylesheet hides the app — so an empty list still needs a real page. */
  if (!cart.length) {
    return (
      <div className="print-sheet" aria-hidden="true">
        <header className="print-head">
          <h1>{t.printTitle}</h1>
          <p>{date}</p>
        </header>
        <p className="print-empty">{t.emptyTitle}</p>
        <p className="print-note">{t.printNote}</p>
      </div>
    );
  }

  return (
    <div className="print-sheet" aria-hidden="true">
      <header className="print-head">
        <h1>{t.printTitle}</h1>
        <p>{date}</p>
      </header>

      <table className="print-table">
        <colgroup>
          <col className="c-name" />
          <col className="c-code" />
          <col className="c-each" />
          <col className="c-qty" />
          <col className="c-total" />
        </colgroup>
        <thead>
          <tr>
            <th>{t.colName}</th>
            <th>{t.colBarcode}</th>
            <th className="num">{t.colUnit}</th>
            <th className="num">{t.colQty}</th>
            <th className="num">{t.colTotal}</th>
          </tr>
        </thead>
        <tbody>
          {cart.map((line) => (
            <tr key={line.barcode}>
              <td>{line.name || '—'}</td>
              <td className="n">{line.barcode}</td>
              <td className="num"><span className="n">{hasPrice(line) ? money(withVat(line.price)) : '—'}</span></td>
              <td className="num"><span className="n">{line.qty}</span></td>
              <td className="num">
                {hasPrice(line)
                  ? <span className="n">{money(lineTotal(line.price, line.qty))}</span>
                  : t.notCounted}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="print-totals">
        <div><span>{t.beforeVat}</span><span className="n">{money(totals.sub)} {t.cur}</span></div>
        <div><span>{t.vatLine}</span><span className="n">{money(totals.vat)} {t.cur}</span></div>
        <div className="is-grand"><span>{t.grand}</span><span className="n">{money(totals.all)} {t.cur}</span></div>
      </div>

      <p className="print-note">{t.printNote}</p>
    </div>
  );
}
