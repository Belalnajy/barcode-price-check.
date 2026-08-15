import { money } from '../lib/format';

/** Print-only header above the list. */
export function PrintHeader({ t, date }) {
  return (
    <div className="print-only pr-h">
      <h1>{t.printTitle}</h1>
      <small>{date}</small>
    </div>
  );
}

/** Print-only totals + disclaimer note below the list. */
export function PrintTotals({ t, totals }) {
  return (
    <>
      <div className="print-only pr-t">
        <div><span>{t.beforeVat}</span><span>{money(totals.sub)} {t.cur}</span></div>
        <div><span>{t.vatLine}</span><span>{money(totals.vat)} {t.cur}</span></div>
        <div className="g"><span>{t.grand}</span><span>{money(totals.all)} {t.cur}</span></div>
      </div>
      <div className="print-only pr-n">{t.printNote}</div>
    </>
  );
}
