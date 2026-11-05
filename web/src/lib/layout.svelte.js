// Home-page layout: an ordered list of panel ids, persisted on the server (shared by all devices).
import { avr, api, toast } from './avr.svelte.js';

export const DEFAULT_HOME = ['status', 'volume', 'inputs', 'sound-mode', 'quick-select', 'favorites'];

export const ui = $state({ editing: false });

// While a change is being saved, show the local version: a routine state broadcast from the server can
// still carry the previous layout and would otherwise make panels jump back and forth.
const pending = $state({ home: null, lanes: null, seq: 0 });

export function homeIds() {
  if (pending.home) return pending.home;
  const h = avr.settings?.home;
  return Array.isArray(h) ? h : DEFAULT_HOME;
}

/** Column chosen by the user for each panel ({ id: columnIndex }); panels without one are auto-placed. */
export function homeLanes() {
  if (pending.home) return pending.lanes ?? {};
  const l = avr.settings?.homeLanes;
  return l && typeof l === 'object' ? l : {};
}

export async function setHome(ids, lanes = homeLanes()) {
  const seq = ++pending.seq;
  const keep = Object.fromEntries(Object.entries(lanes).filter(([id]) => ids.includes(id)));
  pending.home = ids;
  pending.lanes = keep;
  try {
    const saved = await api('/api/settings', { method: 'POST', body: { home: ids, homeLanes: keep } });
    if (seq === pending.seq) avr.settings = { ...avr.settings, home: saved.home, homeLanes: saved.homeLanes };
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    if (seq === pending.seq) { pending.home = null; pending.lanes = null; } // newest save finished; follow the server again
  }
}

export async function resetHome() {
  pending.seq++;
  pending.home = null;
  pending.lanes = null;
  avr.settings = { ...avr.settings, home: undefined, homeLanes: undefined };
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
