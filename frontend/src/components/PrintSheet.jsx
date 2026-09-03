import { hasPrice, lineTotal, money, withVat } from '../lib/format';

/**
 * Paper version of the list, rendered from its own simple markup rather than
 * bending the interactive layout into A4.
 *
 * Two documents share this sheet:
 *  - a plain price list (no customer), titled t.printTitle;
 *  - a saved customer quote, titled t.printQuoteTitle, carrying the quote
 *    number and the customer block (name, phone, VAT number, address).
 */
export default function PrintSheet({ t, cart, totals, date, quote }) {
  const customer = quote ? quote.customer : null;
  const title = quote ? t.printQuoteTitle : t.printTitle;

  return (
    <div className="print-sheet" aria-hidden="true">
      <header className="print-top">
        <div className="print-brand">
          <span className="print-mark" aria-hidden="true">
            {[2, 1, 3, 1, 2, 4, 1, 2].map((w, i) => <i key={i} style={{ width: `${w}pt` }} />)}
          </span>
          <p className="print-shop">{t.brand}</p>
        </div>
        <div className="print-doc">
          <h1>{title}</h1>
          <table className="print-meta">
            <tbody>
              {quote && (
                <tr>
                  <th>{t.printQuoteNo}</th>
                  <td><span className="n">{quote.number}</span></td>
                </tr>
              )}
              <tr>
                <th>{t.printDateLabel}</th>
                <td>{date}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </header>

      {customer && (
        <section className="print-customer">
          <div className="print-customer-row">
            <span className="print-label">{t.printCustomer}</span>
            <strong>{customer.name}</strong>
            {customer.phone ? (
              <>
                <span className="print-label">{t.printPhone}</span>
                <span className="n">{customer.phone}</span>
              </>
            ) : null}
          </div>
          {(customer.vatNumber || customer.address) && (
            <div className="print-customer-row">
              {customer.vatNumber ? (
                <>
                  <span className="print-label">{t.printVatNo}</span>
                  <span className="n">{customer.vatNumber}</span>
                </>
              ) : null}
              {customer.address ? (
                <>
                  <span className="print-label">{t.printAddress}</span>
                  <span>{customer.address}</span>
                </>
              ) : null}
            </div>
          )}
        </section>
      )}

      {cart.length === 0 ? (
        <p className="print-empty">{t.emptyTitle}</p>
      ) : (
        <table className="print-table">
          <colgroup>
            <col className="c-seq" />
            <col className="c-name" />
            <col className="c-code" />
            <col className="c-qty" />
            <col className="c-each" />
            <col className="c-total" />
          </colgroup>
          <thead>
            <tr>
              <th className="num">{t.printSeq}</th>
              <th>{t.colName}</th>
              <th>{t.colBarcode}</th>
              <th className="num">{t.colQty}</th>
              <th className="num">{t.colUnit}</th>
              <th className="num">{t.colTotal}</th>
            </tr>
          </thead>
          <tbody>
            {cart.map((line, i) => (
              <tr key={line.barcode}>
                <td className="num"><span className="n">{i + 1}</span></td>
                <td>{line.name || '—'}</td>
                <td><span className="n">{line.barcode}</span></td>
                <td className="num"><span className="n">{line.qty}</span></td>
                <td className="num"><span className="n">{hasPrice(line) ? money(withVat(line.price)) : '—'}</span></td>
                <td className="num">
                  {hasPrice(line)
                    ? <span className="n">{money(lineTotal(line.price, line.qty))}</span>
                    : t.notCounted}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {cart.length > 0 && (
        <div className="print-totals">
          <div><span>{t.beforeVat}</span><span className="n">{money(totals.sub)} {t.cur}</span></div>
          <div><span>{t.vatLine}</span><span className="n">{money(totals.vat)} {t.cur}</span></div>
          <div className="is-grand"><span>{t.grand}</span><span className="n">{money(totals.all)} {t.cur}</span></div>
        </div>
      )}

      <p className="print-note">{quote ? t.printQuoteNote : t.printNote}</p>
    </div>
  );
}
