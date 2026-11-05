// Remembers UI open/closed state on this device (localStorage), e.g. collapsible sections.
// Per-device on purpose: what you keep expanded on a phone may differ from the desktop.

const PREFIX = 'theater.open.';

export function loadOpen(key, fallback) {
  try {
    const v = localStorage.getItem(PREFIX + key);
    return v === null ? fallback : v === '1';
  } catch {
    return fallback; // storage blocked (private mode etc.)
  }
}

export function saveOpen(key, open) {
  try { localStorage.setItem(PREFIX + key, open ? '1' : '0'); } catch {}
}

/** Svelte action for <details>: restores and remembers whether it is open. */
export function remember(node, key) {
  node.open = loadOpen(key, node.open);
  const onToggle = () => saveOpen(key, node.open);
  node.addEventListener('toggle', onToggle);
  return { destroy() { node.removeEventListener('toggle', onToggle); } };
}
