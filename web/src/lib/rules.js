// Why a setting is unavailable, in the owner's manual's terms (North American edition; page numbers below).
// The receiver's own display flags (availability.svelte.js) decide WHETHER a control is locked. These rules only
// pick the most specific explanation for the current state, and fall back to the generic reason.
// A few rules also lock a control the receiver claims is adjustable but ignores (see `ignored`).

import { avr } from './avr.svelte.js';
import { state as avail, REASON } from './availability.svelte.js';

const mode = () => avr.state?.surround ?? ''; // e.g. "DOLBY AUDIO-DSUR", "PURE DIRECT"
const decoder = () => avr.state?.decoder ?? ''; // SYSDA, e.g. "PCM", "DOLBY DIGITAL +"
const ps = () => avr.state?.ps ?? {};

export const isDirect = () => /DIRECT/.test(mode()); // Direct and Pure Direct
const isVirtual = () => /VIRTUAL/.test(mode());
const isDolby = () => /DOLBY/i.test(decoder());
const isDts = () => /DTS/i.test(decoder());
const known = () => !!decoder();

const DIRECT = 'Not available in Direct or Pure Direct';

/** Specific reason for each setting, given the current state (only used while the setting is unavailable). */
const WHY = {
  // p.158: not in Direct / Pure Direct, nor in DTS Virtual:X or "+Virtual:X" modes.
  MULTEQ: () => (isDirect() ? DIRECT : isVirtual() ? 'Not available in Virtual:X sound modes' : null),
  // p.159: "This item cannot be set when MultEQ XT … is set to Off."
  DYNEQ: () => WHY.MULTEQ() ?? (ps().MULTEQ === 'OFF' ? 'Turn on MultEQ to use this' : null),
  DYNVOL: () => WHY.MULTEQ() ?? (ps().MULTEQ === 'OFF' ? 'Turn on MultEQ to use this' : null),
  // p.159: "Setting is enabled when Dynamic EQ is On."
  REFLEV: () => WHY.MULTEQ() ?? (ps().DYNEQ !== 'ON' ? 'Turn on Dynamic EQ to use this' : null),
  // p.151: not in Direct, Stereo or the original sound mode.
  'CINEMA EQ': () => 'Not available in Direct, Pure Direct, Stereo or the original sound mode',
  // p.152: Dolby Digital, Dolby Digital Plus, Dolby TrueHD and Dolby Atmos only.
  LOM: () => 'Only with Dolby sources (Dolby Digital, Dolby Digital Plus, TrueHD, Atmos)',
  // p.152: Dolby or DTS sources, and only while Loudness Management is on.
  DRC: () => (ps().LOM !== undefined && ps().LOM !== 'ON' ? 'Turn on Loudness management to adjust this'
    : 'Only with Dolby or DTS sources'),
  // p.153: only when the input contains an LFE signal, from Dolby Digital, DTS or DVD-Audio.
  LFE: () => 'Only with Dolby Digital or DTS sources that include an LFE channel',
  // p.153: Center Spread only in Dolby Surround.
  CES: () => 'Only in the Dolby Surround sound mode',
  // p.154: Neural:X only in the DTS:X / DTS:X MSTR sound modes.
  NEURAL: () => 'Only in the DTS:X sound modes',
  // p.155: Direct or Stereo mode, with Subwoofer Mode set to LFE+Main.
  SWR: () => 'Only in Direct or Stereo mode, with Subwoofer mode set to LFE + Main (Speakers)',
  // p.156: analog or 44.1/48 kHz PCM only, and not in Direct.
  RSTR: () => (isDirect() ? DIRECT : 'Only with analog or 44.1/48 kHz PCM sources'),
  // p.110: not in Direct or Virtual (Pure Direct behaves like Direct).
  DEH: () => (isDirect() || isVirtual() ? 'Not available in Direct, Pure Direct or Virtual' : null),
};

/**
 * Settings the receiver reports as adjustable but silently ignores in some states (found on this unit).
 * LFE: with PCM it stays at 0 dB whatever is sent (p.153: Dolby Digital / DTS / DVD-Audio only).
 * DRC: with PCM and Loudness Management on, audio/4 says display="3" but PSDRC is ignored (p.152: Dolby / DTS only).
 */
const IGNORED = {
  LFE: () => known() && !isDolby() && !isDts(),
  DRC: () => known() && !isDolby() && !isDts(),
  DEH: () => isDirect() || isVirtual(), // p.110; the receiver has no display flag for it
};

/** True when the control should be locked: the receiver says so, or a known rule applies. */
export function locked(key) {
  return avail(key) !== 'on' || !!IGNORED[key]?.();
}

/** Explanation to show while locked: the manual's specific reason, else the generic one. */
export function reason(key) {
  const specific = WHY[key]?.();
  if (specific) return specific;
  const s = avail(key);
  return REASON[s === 'on' ? 'off' : s];
}

/** Hint text: the reason while locked, otherwise the normal description. */
export const hint = (key, text) => (locked(key) ? reason(key) : text);
