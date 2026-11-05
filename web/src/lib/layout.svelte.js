// Page layouts: for each page, the panel order, the column each panel starts in, and its width in columns.
// Persisted on the server (shared by all devices) under settings.layouts[page].
// Home is special: its order is also the list of pinned panels.
import { avr, api, toast } from './avr.svelte.js';

export const DEFAULT_HOME = ['status', 'volume', 'inputs', 'sound-mode', 'quick-select', 'favorites'];

export const ui = $state({ editing: false });

// While a change is being saved, show the local version: a routine state broadcast from the server can
// still carry the previous layout and would otherwise make panels jump back and forth.
const pending = $state({}); // page -> { order, lanes, spans }
const seqs = {};

/** { order (array|null), lanes {id: col}, spans {id: width}, stored (bool) } for a page. */
export function getLayout(page) {
  const s = pending[page] ?? avr.settings?.layouts?.[page];
  return {
    order: Array.isArray(s?.order) ? s.order : null,
    lanes: s?.lanes && typeof s.lanes === 'object' ? s.lanes : {},
    spans: s?.spans && typeof s.spans === 'object' ? s.spans : {},
    stored: !!s,
  };
}

export async function saveLayout(page, { order, lanes = {}, spans = {} }) {
  const seq = (seqs[page] = (seqs[page] ?? 0) + 1);
  const only = (m) => Object.fromEntries(Object.entries(m ?? {}).filter(([id]) => order.includes(id)));
  const layout = { order, lanes: only(lanes), spans: only(spans) };
  pending[page] = layout;
  try {
    const saved = await api('/api/settings', { method: 'POST', body: { layout: { page, ...layout } } });
    if (seqs[page] === seq) avr.settings = { ...avr.settings, layouts: saved.layouts };
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    if (seqs[page] === seq) delete pending[page]; // newest save finished; follow the server again
  }
}

export async function resetLayout(page) {
  seqs[page] = (seqs[page] ?? 0) + 1;
  delete pending[page];
  const layouts = { ...(avr.settings?.layouts ?? {}) };
  delete layouts[page];
  avr.settings = { ...avr.settings, layouts };
  try { await api('/api/settings', { method: 'POST', body: { layout: { page, reset: true } } }); } catch (e) { toast(e.message, 'error'); }
}

// ---- Home pins ----
export function homeIds() {
  return getLayout('home').order ?? DEFAULT_HOME;
}

export function isPinned(id) {
  return homeIds().includes(id);
}

export function setPinned(ids) {
  const L = getLayout('home');
  return saveLayout('home', { order: ids, lanes: L.lanes, spans: L.spans });
}

export function togglePin(id, title = 'Panel') {
  const h = homeIds();
  if (h.includes(id)) {
    setPinned(h.filter((x) => x !== id));
    toast(`${title} removed from Home`);
  } else {
    setPinned([...h, id]);
    toast(`${title} pinned to Home`);
  }
}

// ---- per-panel options (e.g. lock the volume dial), shared by all devices ----
export function panelOption(panel, key) {
  return !!avr.settings?.panelOptions?.[panel]?.[key];
}

/** A multiple-choice option (e.g. the tuner dial color); `fallback` when unset. */
export function panelChoice(panel, key, fallback) {
  const v = avr.settings?.panelOptions?.[panel]?.[key];
  return typeof v === 'string' ? v : fallback;
}

export async function setPanelOption(panel, key, value) {
  const po = { ...(avr.settings?.panelOptions ?? {}) };
  po[panel] = { ...(po[panel] ?? {}), [key]: value };
  avr.settings = { ...avr.settings, panelOptions: po }; // optimistic
  try {
    await api('/api/settings', { method: 'POST', body: { panelOption: { panel, key, value } } });
  } catch (e) {
    toast(e.message, 'error');
  }
}
