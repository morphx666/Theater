// App accent color (Setup › App & Info). The palettes live in app.css under :root[data-accent=…];
// this sets the attribute and recolors the favicon and the header logo. The choice is a shared
// setting, cached per device so a reload doesn't flash the default.
export const ACCENTS = [
  { value: 'amber', label: 'Amber', swatch: '#f5a524' },
  { value: 'rose', label: 'Rose', swatch: '#ff5c8a' },
  { value: 'violet', label: 'Violet', swatch: '#a57bff' },
  { value: 'blue', label: 'Blue', swatch: '#4f9dff' },
  { value: 'teal', label: 'Teal', swatch: '#22c7b8' },
  { value: 'green', label: 'Green', swatch: '#46d16b' },
];
export const DEFAULT_ACCENT = 'blue'; // keep in sync with the server default and the :root palette in app.css

const KEY = 'accent';

/** The app icon (same as public/icon.svg) in a given accent, as a data URL. */
function iconUrl(color) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0d0f14"/><circle cx="32" cy="32" r="19" fill="none" stroke="#2a2f3a" stroke-width="5"/><path d="M18.6 45.4A19 19 0 1 1 45.4 45.4" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round" stroke-dasharray="70 200"/><circle cx="32" cy="32" r="4" fill="${color}"/></svg>`;
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

export const accent = $state({ value: DEFAULT_ACCENT, icon: '/icon.svg' });

export function applyAccent(value) {
  const a = ACCENTS.find((x) => x.value === value) ?? ACCENTS.find((x) => x.value === DEFAULT_ACCENT);
  if (accent.value === a.value && accent.icon !== '/icon.svg') return;
  accent.value = a.value;
  accent.icon = iconUrl(a.swatch);
  document.documentElement.dataset.accent = a.value;
  document.querySelector('link[rel="icon"]')?.setAttribute('href', accent.icon);
  try { localStorage.setItem(KEY, a.value); } catch {}
}

/** Before the first snapshot arrives: use this device's last known accent. */
export function restoreAccent() {
  let v = null;
  try { v = localStorage.getItem(KEY); } catch {}
  applyAccent(v);
}
