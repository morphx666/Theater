// Home-page layout: an ordered list of panel ids, persisted on the server (shared by all devices).
import { avr, api, toast } from './avr.svelte.js';

export const DEFAULT_HOME = ['status', 'volume', 'inputs', 'sound-mode', 'quick-select', 'favorites'];

export const ui = $state({ editing: false });

export function homeIds() {
  const h = avr.settings?.home;
  return Array.isArray(h) ? h : DEFAULT_HOME;
}

export async function setHome(ids) {
  avr.settings = { ...avr.settings, home: ids }; // optimistic
  try {
    await api('/api/settings', { method: 'POST', body: { home: ids } });
  } catch (e) {
    toast(e.message, 'error');
  }
}

export async function resetHome() {
  avr.settings = { ...avr.settings, home: undefined };
  try { await api('/api/settings', { method: 'POST', body: { home: null } }); } catch (e) { toast(e.message, 'error'); }
}

export function isPinned(id) {
  return homeIds().includes(id);
}

export function togglePin(id, title = 'Panel') {
  const h = homeIds();
  if (h.includes(id)) {
    setHome(h.filter((x) => x !== id));
    toast(`${title} removed from Home`);
  } else {
    setHome([...h, id]);
    toast(`${title} pinned to Home`);
  }
}

export function move(id, delta) {
  const h = [...homeIds()];
  const i = h.indexOf(id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= h.length) return;
  [h[i], h[j]] = [h[j], h[i]];
  setHome(h);
}
