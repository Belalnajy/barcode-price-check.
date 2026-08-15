import Barcode from './Barcode';
import { money, withVat } from '../lib/format';

/**
 * The big dark "customer display": idle, product hit / no-price warn, or miss.
 * shown: {type:'idle'} | {type:'product', p} | {type:'miss', code}
 */
export default function DisplayPanel({ shown, t }) {
  if (!shown || shown.type === 'idle') {
    return (
      <div className="display" id="disp">
        <div className="idle">
          <div className="big"><span className="dot" />{t.idle}</div>
          <div className="sub">{t.idleSub}</div>
        </div>
      </div>
    );
  }

  if (shown.type === 'miss') {
    return (
      <div className="display is-miss" id="disp">
        <div className="d-state bad">{t.notFound}</div>
        <p className="d-name d-miss-sub">{t.notFoundSub(shown.code)}</p>
      </div>
    );
  }

  const p = shown.p;
  const none = p.price === null || p.price === undefined;
  return (
    <div className={`display ${none ? 'is-warn' : 'is-hit'}`} id="disp">
      <p className="d-name">{p.name}</p>
      {p.note ? <span className="d-note">{p.note}</span> : null}
      {none ? (
        <>
          <div className="d-state warn">{t.noPrice}</div>
          <div className="d-sub">{t.noPriceSub}</div>
        </>
      ) : (
        <>
          <div className="d-price">
            <span className="v n">{money(withVat(p.price))}</span>
            <span className="cur">{t.inclVat}</span>
          </div>
          <div className="d-sub">
            {t.beforeVatShort} <span className="n">{money(p.price)}</span> {t.cur}
          </div>
        </>
      )}
      <div className="d-bars">
        <Barcode code={String(p.barcode)} />
        <div className="d-code n">{p.barcode}</div>
      </div>
    </div>
  );
}
