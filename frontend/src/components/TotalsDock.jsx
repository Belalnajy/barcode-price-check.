import { money } from '../lib/format';

export default function TotalsDock({ t, totals }) {
  return (
    <div className="dock">
      <div className="dock-in">
        <div className="totals">
          <div className={`warnbar ${totals.missing > 0 ? 'show' : ''}`}>{t.warnbar}</div>
          <div className="t-row"><span>{t.beforeVat}</span><span className="n">{money(totals.sub)}</span></div>
          <div className="t-row"><span>{t.vatLine}</span><span className="n">{money(totals.vat)}</span></div>
          <div className="t-grand">
            <span className="k">{t.grand}</span>
            <span><span className="v n">{money(totals.all)}</span><span className="cur">{t.cur}</span></span>
          </div>
        </div>
      </div>
    </div>
  );
}
