// Automation data for the panel and the editor: the property catalog and the full rules (the snapshot only
// carries a summary: avr.automations). The editor opens at #setup/app/rule/<id> (see App.svelte).
import { avr, api } from '../avr.svelte.js';
import { ui } from '../layout.svelte.js';

export const auto = $state({ catalog: [], rules: [], loaded: false });

export async function loadCatalog() {
  auto.catalog = await api('/api/automation/catalog');
  return auto.catalog;
}

/** The names the catalog's choices show: the inputs as the user named them on the receiver, and the speaker
 *  presets. The catalog is fetched once, so it can hold older names (the receiver's defaults while the server was
 *  still starting, or before a rename): call this from a component to fetch it again whenever they change. */
export function followNames() {
  const key = $derived(JSON.stringify([
    Object.entries(avr.state?.inputs ?? {}).map(([code, i]) => [code, i.name]),
    (avr.speakerPresets?.list ?? []).map((p) => [p.id, p.name]),
  ]));
  let seen = '';
  $effect(() => {
    const k = key;
    if (seen && k !== seen && auto.catalog.length) loadCatalog().catch(() => {}); // the first value is what it loaded with
    seen = k;
  });
}

export async function loadRules() {
  const r = await api('/api/automations');
  auto.rules = r.automations;
  auto.loaded = true;
  return auto.rules;
}

/** POST /api/automations: { action: 'save' | 'delete' | 'enable' | 'run' | 'test', ... } */
export function act(body) {
  return api('/api/automations', { method: 'POST', body });
}

let openedHere = false;
export function openRule(id) {
  openedHere = true;
  location.hash = `#setup/app/rule/${id}`;
}
export function closeRule() {
  if (openedHere) { openedHere = false; history.back(); } // back to where the panel was
  else ui.rule = null; // opened from a link: App.svelte rewrites the hash
}

/** Rule rows on screen in the Automation panel ({ [id]: count }): the run bubble (RunBubble.svelte) shows only
 *  while the running rule's row isn't. Use on each row: use:watchRow={id}. */
export const onScreen = $state({});
export function watchRow(node, id) {
  let cur = id, seen = false;
  const set = (v) => { if (v === seen) return; seen = v; onScreen[cur] = (onScreen[cur] ?? 0) + (v ? 1 : -1); };
  const io = new IntersectionObserver((es) => set(es.at(-1).isIntersecting));
  io.observe(node);
  return {
    update(id) { const v = seen; set(false); cur = id; set(v); },
    destroy() { io.disconnect(); set(false); },
  };
}

/** Go to the Automation panel (Setup › App & Info) and scroll to a rule. */
export function showRule(id) {
  location.hash = '#setup/app';
  setTimeout(() => document.querySelector(`[data-rule="${id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150);
}
