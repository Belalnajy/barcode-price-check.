const BAR_HEIGHTS = [
  { height: '100%' },
  { height: '58%' },
  { height: '100%', width: '3.5px' },
  { height: '44%' },
  { height: '86%' },
  { height: '100%', width: '2.5px' },
  { height: '56%' },
];

export default function TopBar({ t, catInfo, onToggleLang, onOpenSettings }) {
  return (
    <header className="top">
      <div className="top-in">
        <div className="brand">
          <span className="bars" aria-hidden="true">
            {BAR_HEIGHTS.map((s, i) => <i key={i} style={s} />)}
          </span>
          <span>{t.brand}</span>
        </div>
        <div className="top-meta">
          <span className="cat-info">{catInfo}</span>
          <button className="ghost lang" onClick={onToggleLang}>{t.other}</button>
          <button className="ghost" onClick={onOpenSettings}>{t.btnCatalog}</button>
        </div>
      </div>
    </header>
  );
}
