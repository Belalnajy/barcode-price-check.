import { forwardRef, useEffect, useRef, useState } from 'react';
import { hasPrice, money, withVat } from '../lib/format';

const CAMERA_ICON = (
  <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 8V5.5A1.5 1.5 0 0 1 4.5 4H7M17 4h2.5A1.5 1.5 0 0 1 21 5.5V8M21 16v2.5a1.5 1.5 0 0 1-1.5 1.5H17M7 20H4.5A1.5 1.5 0 0 1 3 18.5V16" />
    <path d="M3 12h18" />
  </svg>
);

/** Search field, camera trigger, and the keyboard-navigable results list. */
const ScanBox = forwardRef(function ScanBox(
  { t, value, onChange, onSubmit, onClear, onOpenCamera, results, onPickResult },
  inputRef
) {
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(-1);
  const listRef = useRef(null);

  /* A new result set invalidates the highlight. */
  useEffect(() => { setActive(-1); }, [results]);

  useEffect(() => {
    if (active < 0 || !listRef.current) return;
    const el = listRef.current.children[active];
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const open = results.length > 0;

  const onKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (open && active >= 0) onPickResult(results[active]);
      else onSubmit();
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      onClear();
      return;
    }
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i <= 0 ? results.length - 1 : i - 1));
    }
  };

  return (
    <div className="scan">
      <div className="scan-row">
        <div className={`field${focused ? ' is-on' : ''}`}>
          <span className="field-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M4 5v14M7.5 5v14M11 5v14M14 5v9M17 5v14M20 5v14" />
            </svg>
          </span>
          <input
            id="q"
            ref={inputRef}
            type="text"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck="false"
            placeholder={t.ph}
            aria-label={t.ph}
            role="combobox"
            aria-expanded={open}
            aria-controls="scan-results"
            aria-autocomplete="list"
            aria-activedescendant={open && active >= 0 ? `res-${results[active].barcode}` : undefined}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={onKeyDown}
          />
          {value.length > 0 && (
            <button type="button" className="field-clear" aria-label={t.clear} onClick={onClear}>
              <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
                <path d="M7 7l10 10M17 7L7 17" />
              </svg>
            </button>
          )}
        </div>

        <button type="button" className="btn-cam" title={t.camera} aria-label={t.camera} onClick={onOpenCamera}>
          {CAMERA_ICON}
        </button>
      </div>

      <p className="hint scan-hint">{t.tip}</p>

      {open && (
        <ul
          className="results"
          id="scan-results"
          role="listbox"
          aria-label={t.resultsLabel}
          ref={listRef}
        >
          {/* The options are not focusable: the input keeps DOM focus and
              points at the highlighted row via aria-activedescendant, which is
              the combobox pattern. Nesting a <button> here would both break
              the `option` role and add a tab stop per result. */}
          {results.map((p, i) => {
            const priced = hasPrice(p);
            return (
              <li
                key={p.barcode}
                id={`res-${p.barcode}`}
                role="option"
                aria-selected={i === active}
                className={`result${i === active ? ' is-active' : ''}`}
                /* mousedown fires before the input's blur, keeping focus stable */
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => onPickResult(p)}
              >
                <span className="result-main">
                  <span className="result-name">{p.name || '—'}</span>
                  <span className="result-code n">{p.barcode}</span>
                </span>
                {priced ? (
                  <span className="result-price">
                    <span className="n">{money(withVat(p.price))}</span>
                    <small>{t.cur}</small>
                  </span>
                ) : (
                  <span className="result-price is-none">{t.noPrice}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
});

export default ScanBox;
