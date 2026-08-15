import { memo, useEffect, useRef } from 'react';
import { money } from '../lib/format';

/**
 * Order totals. On phones this is pinned above the fold, so its measured
 * height is published as --dock-h and the page reserves exactly that much
 * room — the warning bar can appear without ever hiding the last line.
 */
function TotalsDock({ t, totals }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const root = document.documentElement;
    /* offsetHeight, not contentRect: the latter excludes the card's own
       padding and border, which would leave the last row half-covered. */
    const observer = new ResizeObserver(() => {
      root.style.setProperty('--dock-h', `${Math.ceil(el.offsetHeight)}px`);
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      root.style.removeProperty('--dock-h');
    };
  }, []);

  return (
    <div className="dock">
      <div className="totals" ref={ref}>
        {totals.missing > 0 && (
          <p className="totals-warn" role="status">
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M12 8v5M12 16.5v.5" />
              <path d="M10.3 3.9 2.6 17.2A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.8L13.7 3.9a2 2 0 0 0-3.4 0z" />
            </svg>
            <span>{t.warnbar}</span>
          </p>
        )}
        <dl className="totals-rows">
          <div className="totals-row">
            <dt>{t.beforeVat}</dt>
            <dd className="n">{money(totals.sub)}</dd>
          </div>
          <div className="totals-row">
            <dt>{t.vatLine}</dt>
            <dd className="n">{money(totals.vat)}</dd>
          </div>
          <div className="totals-row is-grand">
            <dt>{t.grand}</dt>
            <dd>
              <span className="totals-grand n">{money(totals.all)}</span>
              <span className="totals-cur">{t.cur}</span>
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

export default memo(TotalsDock);
