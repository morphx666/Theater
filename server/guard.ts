// Safety layer: every command from the browser goes through here before reaching the receiver.

import { dbToVol, volToDb, type AvrState } from './parse.ts';

export type GuardResult = { ok: true; cmd: string } | { ok: false; reason: string };

// Command prefixes the UI is allowed to send. Anything else is rejected.
const ALLOWED = [
  /^PW(ON|STANDBY|\?)$/,
  /^ZM(ON|OFF|\?)$/,
  /^MV(UP|DOWN|\d{2,3}|\?)$/,
  /^MU(ON|OFF|\?)$/,
  /^SI[A-Z0-9/]{2,8}$/,
  /^SI\?$/,
  /^MS[A-Z0-9 :.\-]{1,30}$/,
  /^MS\?$/,
  /^PS[A-Z0-9 :.\-]{2,30}$/,
  /^CV[A-Z0-9]{1,4} (UP|DOWN|\d{2,3})$/,
  /^CV(ZRL|\?)$/,
  /^Z2(ON|OFF|UP|DOWN|MUON|MUOFF|MU\?|\?|\d{2,3}|[A-Z0-9/]{2,8})$/,
  /^SLP(OFF|\d{3}|\?)$/,
  /^ECO(ON|AUTO|OFF|\?)$/,
  /^DIM (BRI|DIM|DAR|OFF|SEL|\?)$/,
  /^STBY(15M|30M|60M|OFF|\?)$/,
  /^SPPR (1|2|\?)$/,
  /^BTTX (ON|OFF|SP|BT|\?)$/,
  /^TFAN(UP|DOWN|\d{6}|\?)$/, // tune
  /^TMAN(AM|FM|AUTO|MANUAL|\?)$/, // band / tuning mode
  /^TPAN(UP|DOWN|OFF|0[1-9]|[1-4]\d|5[0-6]|\?)$/, // recall preset 01-56
  /^TPANMEM(0[1-9]|[1-4]\d|5[0-6])$/, // store the current station in preset 01-56 (bare TPANMEM opens a prompt: not allowed)
  /^OPTPN \?$/, // read the preset list
  /^MN(CUP|CDN|CLT|CRT|ENT|RTN|OPT|INF|MEN ON|MEN OFF|ZST ON|ZST OFF|ZST \?)$/,
  /^NS9[A-E]$/,
  /^VS(MONI|VPM|AUDIO|SC)[A-Z0-9 ]{1,8}$/,
  /^SS[A-Z0-9 ]{2,20}\?$/, // SS* is read-only (queries only)
  /^SYMO$/,
];

// Belt and braces: never pass these even if a pattern above would match.
const BLOCKED = [/^SYRST/, /^NSRBT/, /^SYPANEL/, /^SYALL/, /^NSUP/, /^MNMEN ON SETUP/, /^SY(?!MO$)/];

export const MIN_DB = -80;

/**
 * Validate a raw telnet command and enforce the volume cap.
 * `capDb` is the highest master volume (dB) the app will allow.
 */
export function guard(raw: string, st: AvrState, capDb: number): GuardResult {
  const cmd = String(raw ?? '').toUpperCase().replace(/[\r\n]/g, '').trim();
  if (!cmd || cmd.length > 40 || !/^[\x20-\x7E]+$/.test(cmd)) return { ok: false, reason: 'invalid command' };
  if (BLOCKED.some((r) => r.test(cmd))) return { ok: false, reason: `blocked for safety: ${cmd}` };
  if (!ALLOWED.some((r) => r.test(cmd))) return { ok: false, reason: `not allowed: ${cmd}` };

  // The receiver silently ignores tuner commands unless Tuner is the active input (queries still answer).
  if (/^T[FPM]AN(?!\?$)/.test(cmd) && st.source !== 'TUNER') return { ok: false, reason: 'Switch the input to Tuner first' };

  // Master volume cap
  if (/^MV\d{2,3}$/.test(cmd)) {
    const db = volToDb(cmd.slice(2));
    if (db === null) return { ok: false, reason: 'bad volume' };
    if (db > capDb) return { ok: true, cmd: `MV${dbToVol(capDb)}` }; // clamp
  }
  if (cmd === 'MVUP' && st.volume !== null && st.volume + 0.5 > capDb) {
    return { ok: false, reason: `volume cap reached (${capDb} dB)` };
  }
  // Zone 2 volume cap (uses the same ceiling)
  const z2 = cmd.match(/^Z2(\d{2,3})$/);
  if (z2) {
    const db = volToDb(z2[1]);
    if (db !== null && db > capDb) return { ok: true, cmd: `Z2${dbToVol(capDb)}` };
  }
  if (cmd === 'Z2UP' && st.zone2.volume !== null && st.zone2.volume + 1 > capDb) {
    return { ok: false, reason: `zone 2 volume cap reached (${capDb} dB)` };
  }
  return { ok: true, cmd };
}

/**
 * Recalling a Quick Select (MSQUICKn) makes the receiver jump to the volume saved in that slot (when volume is
 * memorised; manual p.134). That jump happens inside the receiver, so `guard()` never sees it. Shortly after a
 * recall from the app, pass each reported volume line here: it returns the command that brings the volume back
 * down to the cap, or null if no correction is needed.
 */
export function quickRecallCorrection(line: string, capDb: number): string | null {
  const m = line.match(/^(MV|Z2)(\d{2,3})$/);
  if (!m) return null;
  const db = volToDb(m[2]);
  return db !== null && db > capDb ? `${m[1]}${dbToVol(capDb)}` : null;
}

/**
 * "Snap to step": the receiver (and its remote) change the volume in 0.5 dB steps. When the app's step is 1 or
 * 2 dB and the reported master volume lands between steps, return the command that moves it on to the next
 * step in the same direction (-30 -> -29.5 becomes -29 with 1 dB, -28 with 2 dB). Steps count from 0 dB.
 * Never snaps upward past `topDb` (the cap or the receiver's maximum), and does nothing without a known
 * previous value, so starting the app never changes the volume.
 */
export function stepCorrection(line: string, prevDb: number | null, step: number, topDb: number): string | null {
  const m = line.match(/^MV(\d{2,3})$/);
  if (!m || prevDb === null || !(step > 0.5)) return null;
  const db = volToDb(m[1]);
  if (db === null || db === prevDb || Number.isInteger(db / step)) return null;
  const target = (db > prevDb ? Math.ceil(db / step) : Math.floor(db / step)) * step;
  if (target > db && target > topDb) return null;
  return `MV${dbToVol(target)}`;
}

/** Effective cap = the stricter of the app setting and the receiver's own Volume Limit. */
export function effectiveCap(appCapDb: number, st: AvrState): number {
  let cap = appCapDb;
  const lim = st.volumeLimit;
  // Volume Limit is reported as a whole step (60 / 70 / 80 → -20 / -10 / 0 dB), possibly zero-padded.
  if (lim && /^\d{2,3}$/.test(lim)) {
    const n = Number(lim);
    if (n > 0 && n <= 98) cap = Math.min(cap, n - 80);
  }
  return cap;
}
