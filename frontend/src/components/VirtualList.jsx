import { useEffect, useRef, useState } from 'react';

const OVERSCAN = 6;

/**
 * Fixed-row-height windowing. The catalog runs to a few thousand products and
 * the search box filters it on every keystroke; rendering only the rows in
 * view keeps that instant instead of rebuilding thousands of nodes.
 */
export default function VirtualList({ items, rowHeight, renderRow, className = '', empty = null }) {
  const ref = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(0);

  /* The viewport is sized by CSS, so measure it rather than taking a prop. */
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const apply = () => setHeight(el.clientHeight);
    apply();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(apply);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  /* A shorter filtered list can leave us scrolled past the end. */
  useEffect(() => {
    const el = ref.current;
    if (el && el.scrollTop !== 0) {
      el.scrollTop = 0;
      setScrollTop(0);
    }
  }, [items]);

  if (!items.length) {
    return <div className={`vlist is-empty ${className}`} ref={ref}>{empty}</div>;
  }

  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN);
  const count = Math.ceil((height || rowHeight * 8) / rowHeight) + OVERSCAN * 2;
  const slice = items.slice(start, start + count);

  return (
    <div
      className={`vlist ${className}`}
      ref={ref}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
    >
      <div className="vlist-runway" style={{ height: items.length * rowHeight }}>
        <div className="vlist-window" style={{ transform: `translateY(${start * rowHeight}px)` }}>
          {slice.map((item, i) => renderRow(item, start + i))}
        </div>
      </div>
    </div>
  );
}
