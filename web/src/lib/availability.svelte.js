// What the receiver currently allows to be adjusted, as reported by its own setup pages
// (the same information Denon's menus use to grey options out):
//   audio/9  Audyssey      — <Setup>2</Setup> = calibration never run; per-setting display attributes
//   audio/4  Surround parameters — display attributes per setting for the current mode / signal
//   audio/1  Audio menu list — the display code is the element's text, e.g. <Restorer gray="3">2</Restorer>
// display: 1 = not available, 2 = greyed (read-only), 3 = adjustable.
// Re-read automatically when the sound mode, signal, input, power, Audyssey, Loudness Management or speaker preset change
// (Dynamic Compression is only adjustable while Loudness Management is on).

import { avr } from './avr.svelte.js';
import { getXml } from './setup.js';

export const availability = $state({
  loaded: false,
  audysseyCalibrated: null, // false = Audyssey setup never run
  display: {}, // key -> '1' | '2' | '3'
});

// telnet PS key -> element on the receiver's setup pages
const SURROUND_MAP = {
  'CINEMA EQ': 'CinemaEQ', LOM: 'LoudnessManagement', DRC: 'DynamicCompression', LFE: 'LowFrequencyEffects',
  CES: 'CenterSpread', NEURAL: 'DTSNeuralX', SWR: 'Subwoofer',
};
const AUDYSSEY_MAP = { MULTEQ: 'MultEQ', DYNEQ: 'DynamicEQ', REFLEV: 'ReferenceLevelOffset', DYNVOL: 'DynamicVolume' };
// Not AudioDelay: the menu list reports it hidden (1), yet PSDELAY works over telnet.
const MENU_MAP = { RSTR: 'Restorer' };

let users = 0;
let timer = null;
let lastKey = '';

async function load() {
  try {
    const [aud, sur, menu] = await Promise.all([getXml('audio', 9), getXml('audio', 4), getXml('audio', 1).catch(() => null)]);
    const d = {};
    for (const [k, tag] of Object.entries(AUDYSSEY_MAP)) d[k] = aud.querySelector(`:scope > ${tag}`)?.getAttribute('display') ?? '3';
    for (const [k, tag] of Object.entries(SURROUND_MAP)) d[k] = sur.querySelector(`:scope > ${tag}`)?.getAttribute('display') ?? '3';
    for (const [k, tag] of Object.entries(MENU_MAP)) d[k] = menu?.querySelector(`:scope > ${tag}`)?.textContent.trim() || '3';
    availability.display = d;
    availability.audysseyCalibrated = aud.querySelector(':scope > Setup')?.textContent.trim() !== '2';
    availability.loaded = true;
  } catch {
    // Setup pages unreachable (e.g. receiver busy): keep the last known state; controls stay usable.
  }
}

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(load, 900); // let the receiver settle after a change
}

/** Call from a component's script: keeps availability fresh while the component is mounted. */
export function useAvailability() {
  $effect(() => {
    users++;
    if (!availability.loaded) load();
    return () => { users--; };
  });
  $effect(() => {
    const st = avr.state;
    if (!st) return;
    // speaker preset: each slot has its own Audyssey calibration
    const key = [st.zoneMain, st.source, st.surround, st.decoder, st.signal, st.ps?.MULTEQ, st.ps?.DYNEQ, st.ps?.LOM,
      st.speakerPreset, avr.speakerPresets?.rev].join('|');
    if (key !== lastKey) {
      if (lastKey) schedule();
      lastKey = key;
    }
  });
  return availability;
}

/** 'off' (not available), 'gray' (read-only), or 'on' (adjustable). Unknown = 'on'. */
export function state(key) {
  const d = availability.display[key];
  return d === '1' ? 'off' : d === '2' ? 'gray' : 'on';
}

export const REASON = {
  off: 'Not available with the current sound mode or signal',
  gray: 'Fixed for the current sound mode or signal',
};
