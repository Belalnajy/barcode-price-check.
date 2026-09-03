import { memo } from 'react';

/* The wordmark: a stylised barcode. Fixed widths keep it identical everywhere. */
const MARK = [2, 1, 3, 1, 2, 4, 1, 2];

function Icon({ path, filled = false }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {path}
    </svg>
  );
}

const SUN = (
  <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </>
);
const MOON = <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />;
const SOUND_ON = <path d="M11 5 6.5 9H3v6h3.5L11 19zM15.5 9.5a3.5 3.5 0 0 1 0 5M18 7a7 7 0 0 1 0 10" />;
const SOUND_OFF = <path d="M11 5 6.5 9H3v6h3.5L11 19zM16 10l4 4M20 10l-4 4" />;

function TopBar({
  t, statusText, statusTone, theme, muted,
  onToggleTheme, onToggleSound, onToggleLang, onOpenCatalog, onOpenQuotes,
}) {
  return (
    <header className="top">
      <div className="top-in">
        <div className="brand">
          <span className="mark" aria-hidden="true">
            {MARK.map((w, i) => <i key={i} style={{ width: w }} />)}
          </span>
          <span className="brand-name">{t.brand}</span>
        </div>

        {statusText ? (
          <p className={`status status-${statusTone}`} title={statusText}>
            <span className="status-dot" aria-hidden="true" />
            <span className="status-text">{statusText}</span>
          </p>
        ) : null}

        <div className="top-actions">
          <button
            type="button"
            className="icon-btn"
            onClick={onToggleSound}
            title={muted ? t.soundOff : t.soundOn}
            aria-label={muted ? t.soundOff : t.soundOn}
            aria-pressed={muted}
          >
            <Icon path={muted ? SOUND_OFF : SOUND_ON} />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={onToggleTheme}
            title={theme === 'dark' ? t.themeToLight : t.themeToDark}
            aria-label={theme === 'dark' ? t.themeToLight : t.themeToDark}
          >
            <Icon path={theme === 'dark' ? SUN : MOON} />
          </button>
          <button
            type="button"
            className="btn btn-quiet btn-lang"
            onClick={onToggleLang}
            title={t.switchLang}
            aria-label={t.switchLang}
          >
            {t.other}
          </button>
          <button type="button" className="btn btn-quiet" onClick={onOpenQuotes}>
            {t.quotesBtn}
          </button>
          <button type="button" className="btn btn-quiet" onClick={onOpenCatalog}>
            {t.btnCatalog}
          </button>
        </div>
      </div>
    </header>
  );
}

export default memo(TopBar);
