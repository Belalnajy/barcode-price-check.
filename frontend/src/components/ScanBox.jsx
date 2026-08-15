import { forwardRef, useState } from 'react';
import { money, withVat } from '../lib/format';

/** Search field + camera button + live name-search results. */
const ScanBox = forwardRef(function ScanBox(
  { t, value, onChange, onSubmit, onClear, onOpenCamera, results, onPickResult },
  inputRef
) {
  const [focused, setFocused] = useState(false);

  return (
    <>
      <div className="scan">
        <div className={`field ${focused ? 'on' : ''}`}>
          <input
            id="q"
            ref={inputRef}
            type="text"
            inputMode="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck="false"
            placeholder={t.ph}
            aria-label={t.ph}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); onSubmit(); }
              else if (e.key === 'Escape') { onClear(); }
            }}
          />
          <button
            className={`x ${value.length ? 'show' : ''}`}
            aria-label="clear"
            onClick={onClear}
          >
            ×
          </button>
        </div>
        <button className="cam" title={t.camera} aria-label={t.camera} onClick={onOpenCamera}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 8V5.5A1.5 1.5 0 0 1 4.5 4H7M17 4h2.5A1.5 1.5 0 0 1 21 5.5V8M21 16v2.5a1.5 1.5 0 0 1-1.5 1.5H17M7 20H4.5A1.5 1.5 0 0 1 3 18.5V16" />
            <path d="M3 12h18" />
          </svg>
        </button>
      </div>
      <p className="tip">{t.tip}</p>

      <div className={`results ${results.length ? 'show' : ''}`}>
        {results.map((p) => {
          const none = p.price === null || p.price === undefined;
          return (
            <button key={p.barcode} className="res" onClick={() => onPickResult(p)}>
              <div>
                <div className="res-n">{p.name}</div>
                <div className="res-b n">{p.barcode}</div>
              </div>
              {none ? (
                <div className="res-p none">{t.noPrice}</div>
              ) : (
                <div className="res-p"><span className="n">{money(withVat(p.price))}</span> {t.cur}</div>
              )}
            </button>
          );
        })}
      </div>
    </>
  );
});

export default ScanBox;
