// App accent color (Setup › App & Info). The palettes live in app.css under :root[data-accent=…];
// this sets the attribute. The choice is a shared setting, cached per device so a reload doesn't flash amber.
export const ACCENTS = [
  { value: 'amber', label: 'Amber', swatch: '#f5a524' },
  { value: 'rose', label: 'Rose', swatch: '#ff5c8a' },
  { value: 'violet', label: 'Violet', swatch: '#a57bff' },
  { value: 'blue', label: 'Blue', swatch: '#4f9dff' },
  { value: 'teal', label: 'Teal', swatch: '#22c7b8' },
  { value: 'green', label: 'Green', swatch: '#46d16b' },
];

const KEY = 'accent';

export function applyAccent(value) {
  const v = ACCENTS.some((a) => a.value === value) ? value : 'amber';
  document.documentElement.dataset.accent = v;
  try { localStorage.setItem(KEY, v); } catch {}
}

/** Before the first snapshot arrives: use this device's last known accent. */
export function restoreAccent() {
  let v = null;
  try { v = localStorage.getItem(KEY); } catch {}
  applyAccent(v);
}
