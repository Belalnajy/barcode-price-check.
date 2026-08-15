/* Light / dark theme. Follows the OS until the user picks a side explicitly. */
const KEY = 'theme';
const DARK = '#0B0E11';
const LIGHT = '#EEF0F2';

export function storedTheme() {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

export function systemTheme() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

export function resolveTheme() {
  return storedTheme() || systemTheme();
}

export function applyTheme(theme) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? DARK : LIGHT);
}

export function saveTheme(theme) {
  try { localStorage.setItem(KEY, theme); } catch { /* storage unavailable */ }
}

/** Calls back when the OS scheme changes and the user has no explicit choice. */
export function watchSystemTheme(onChange) {
  if (typeof matchMedia !== 'function') return () => {};
  const mq = matchMedia('(prefers-color-scheme: dark)');
  const handler = () => { if (!storedTheme()) onChange(mq.matches ? 'dark' : 'light'); };
  mq.addEventListener('change', handler);
  return () => mq.removeEventListener('change', handler);
}
