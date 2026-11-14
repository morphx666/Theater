// Automation data for the panel and the editor: the property catalog and the full rules (the snapshot only
// carries a summary: avr.automations). The editor opens at #setup/app/rule/<id> (see App.svelte).
import { api } from '../avr.svelte.js';
import { ui } from '../layout.svelte.js';

export const auto = $state({ catalog: [], rules: [], loaded: false });

export async function loadCatalog() {
  auto.catalog = await api('/api/automation/catalog');
  return auto.catalog;
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
