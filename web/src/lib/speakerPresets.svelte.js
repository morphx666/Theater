// Speaker presets (server: server/speaker-presets.ts). The list lives in every snapshot (avr.speakerPresets);
// these helpers call the REST actions and drive the Amp Assign confirmation (PresetConfirm.svelte).
import { avr, toast } from './avr.svelte.js';

// Amp Assign modes of the X1700H (AmpType 3, manual p.187-188).
export const AMP_MODES = { 1: 'Surround Back', 5: 'Front Height', 8: 'Top Front', 9: 'Top Middle', 10: 'Front Dolby', 11: 'Surround Dolby',
  2: 'Zone 2', 7: 'Bi-Amp', 6: 'Front B' };

export const presetUi = $state({ confirm: null }); // { id, name, from, to } while the wiring warning is open

export const presetName = (id) => avr.speakerPresets?.list.find((p) => p.id === id)?.name ?? 'Preset';

async function post(body) {
  const res = await fetch('/api/speaker-presets', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error ?? `HTTP ${res.status}`), { confirm: data.confirm });
  return data;
}

/** Manager actions: create / rename / slot / delete. Returns the response, or null after showing the error. */
export async function presetAction(body) {
  try { return await post(body); } catch (e) { toast(e.message, 'error'); return null; }
}

/** Switch to a preset. Returns true once it is active. */
export async function applyPreset(id, confirmAmp = false) {
  try {
    const r = await post({ action: 'apply', id, confirmAmp });
    if (r.warnings?.length) toast(r.warnings.join('. '), 'error');
    else toast(`${presetName(id)} active`);
    return true;
  } catch (e) {
    if (e.confirm?.kind === 'amp') presetUi.confirm = { id, name: presetName(id), from: e.confirm.from, to: e.confirm.to };
    else toast(e.message, 'error');
    return false;
  }
}
