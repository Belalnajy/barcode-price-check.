import { memo } from 'react';
import Barcode from './Barcode';
import { hasPrice, money, withVat } from '../lib/format';

/**
 * The customer-facing display: the one thing readable from across a counter.
 * shown: {type:'idle'} | {type:'product', p} | {type:'miss', code}
 */
function DisplayPanel({ shown, t }) {
  const type = shown ? shown.type : 'idle';
  const product = type === 'product' ? shown.p : null;
  const priced = product ? hasPrice(product) : false;
  const tone = type === 'miss' ? 'miss' : product ? (priced ? 'hit' : 'warn') : 'idle';

  return (
    <section className={`display is-${tone}`} aria-live="polite" aria-atomic="true">
      <span className="display-rail" aria-hidden="true" />

      {type === 'idle' && (
        <div className="display-idle">
          <span className="pulse" aria-hidden="true" />
          <p className="display-idle-title">{t.idle}</p>
          <p className="display-idle-sub">{t.idleSub}</p>
        </div>
      )}

      {type === 'miss' && (
        <div className="display-body">
          <p className="display-state">{t.notFound}</p>
          <p className="display-lede">{t.notFoundSub(shown.code)}</p>
        </div>
      )}

      {product && (
        <div className="display-body">
          <div className="display-info">
            <h2 className="display-name" title={product.name}>{product.name || '—'}</h2>
            {product.note ? <p className="display-note">{product.note}</p> : null}

            {priced ? (
              <>
                <p className="display-price">
                  <span className="display-price-value n">{money(withVat(product.price))}</span>
                  <span className="display-price-unit">{t.inclVat}</span>
                </p>
                <p className="display-sub">
                  {t.beforeVatShort} <span className="n">{money(product.price)}</span> {t.cur}
                </p>
              </>
            ) : (
              <>
                <p className="display-state">{t.noPrice}</p>
                <p className="display-sub">{t.noPriceSub}</p>
              </>
            )}
          </div>

          <div className="display-code">
            <Barcode code={String(product.barcode)} label={String(product.barcode)} />
            <p className="display-digits n">{product.barcode}</p>
          </div>
        </div>
      )}
    </section>
  );
}

export default memo(DisplayPanel);
