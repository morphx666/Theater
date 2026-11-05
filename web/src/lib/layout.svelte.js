// Home-page layout: an ordered list of panel ids, persisted on the server (shared by all devices).
import { avr, api, toast } from './avr.svelte.js';

export const DEFAULT_HOME = ['status', 'volume', 'inputs', 'sound-mode', 'quick-select', 'favorites'];

export const ui = $state({ editing: false });

// While a change is being saved, show the local version: a routine state broadcast from the server can
// still carry the previous layout and would otherwise make panels jump back and forth.
const pending = $state({ home: null, lanes: null, spans: null, seq: 0 });

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

/** Width of each panel in columns ({ id: 1|2|3 }); missing = default (1, or full width for wide panels). */
export function homeSpans() {
  if (pending.home) return pending.spans ?? {};
  const s = avr.settings?.homeSpans;
  return s && typeof s === 'object' ? s : {};
}

export async function setHome(ids, lanes = homeLanes(), spans = homeSpans()) {
  const seq = ++pending.seq;
  const only = (m) => Object.fromEntries(Object.entries(m).filter(([id]) => ids.includes(id)));
  const keepLanes = only(lanes), keepSpans = only(spans);
  pending.home = ids;
  pending.lanes = keepLanes;
  pending.spans = keepSpans;
  try {
    const saved = await api('/api/settings', { method: 'POST', body: { home: ids, homeLanes: keepLanes, homeSpans: keepSpans } });
    if (seq === pending.seq) avr.settings = { ...avr.settings, home: saved.home, homeLanes: saved.homeLanes, homeSpans: saved.homeSpans };
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    if (seq === pending.seq) { pending.home = null; pending.lanes = null; pending.spans = null; } // follow the server again
  }
}

export async function resetHome() {
  pending.seq++;
  pending.home = null;
  pending.lanes = null;
  pending.spans = null;
  avr.settings = { ...avr.settings, home: undefined, homeLanes: undefined, homeSpans: undefined };
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
