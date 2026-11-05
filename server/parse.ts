// Pure functions that turn Denon telnet lines into a structured state object.
// No I/O here so it can be unit-tested (see parse.test.ts).

export type Zone2 = { power: boolean | null; source: string | null; volume: number | null; mute: boolean | null };

/** Raw HDMI signal info. Codes (cos, pix) are two digits: input then output; decoded in signal.ts. */
export type VideoSignal = {
  resIn: string | null; resOut: string | null; // SYSDVIN / SYSDVOUT, e.g. "4K24"
  hdrIn: string | null; hdrOut: string | null; // SSINFSIGHDR I…/O…, e.g. "HDR10", "---"
  cos: string | null; // SSINFSIGCOS, color space codes, e.g. "99" (BT.2020 -> BT.2020)
  pix: string | null; // SSINFSIGPIX, pixel depth codes, e.g. "22" (10 bits -> 10 bits)
  frlIn: string | null; frlOut: string | null; // SSINFSIGFRL I…/O… (HDMI 2.1 FRL rate)
};

export type AvrState = {
  model: string | null;
  power: boolean | null; // whole unit (PW)
  zoneMain: boolean | null; // main zone (ZM)
  volume: number | null; // dB, -80..+18
  volumeMax: number | null; // dB
  mute: boolean | null;
  source: string | null; // SI code, e.g. "SAT/CBL"
  surround: string | null; // MS raw, e.g. "DOLBY AUDIO-DSUR"
  soundModeText: string | null; // SYSMI, human readable
  decoder: string | null; // SYSDA, e.g. "PCM"
  sampleRate: string | null; // SSINFAISFSV e.g. "48K"
  signal: string | null; // SSINFAISSIG
  audioFormat: string | null; // SSINFAISFOR, channels in the source: "3/2/.1" = 3 front, 2 surround, LFE
  video: VideoSignal; // HDMI signal info (what the receiver's Information page shows)
  ps: Record<string, string>; // raw PS params: DYNEQ -> "ON"
  channels: Record<string, number>; // CV levels in dB (listening adjustment); remembers every channel seen
  activeChannels: string[]; // channels the current sound mode actually uses (from the last CV? reply)
  installed: string[]; // speakers configured in setup (from the setup API), regardless of sound mode
  setupLevels: Record<string, number>; // SSLEV calibrated levels in dB
  inputs: Record<string, { name: string; hidden: boolean }>; // keyed by SI code
  quickNames: string[]; // 4 entries
  quick: number | null; // last recalled quick select, 0 = none
  zone2: Zone2;
  sleep: number | null; // minutes, 0 = off
  eco: string | null; // ON | AUTO | OFF
  dimmer: string | null; // BRI | DIM | DAR | OFF
  autoStandby: string | null; // 15M | 30M | 60M | OFF
  speakerPreset: string | null; // 1 | 2
  btTx: string | null;
  allZoneStereo: boolean | null;
  volumeLimit: string | null; // "OFF" | "060" | "070" | "080"
  powerOnLevel: string | null; // "LAS" | "MUT" | "040" ...
  muteLevel: string | null;
  tuner: { band: string | null; freq: string | null; preset: string | null };
  firmware: Record<string, string>;
};

export function emptyState(): AvrState {
  return {
    model: null, power: null, zoneMain: null, volume: null, volumeMax: null, mute: null, source: null,
    surround: null, soundModeText: null, decoder: null, sampleRate: null, signal: null, audioFormat: null,
    video: { resIn: null, resOut: null, hdrIn: null, hdrOut: null, cos: null, pix: null, frlIn: null, frlOut: null },
    ps: {}, channels: {}, activeChannels: [], installed: [], setupLevels: {}, inputs: {}, quickNames: ['', '', '', ''], quick: null,
    zone2: { power: null, source: null, volume: null, mute: null },
    sleep: null, eco: null, dimmer: null, autoStandby: null, speakerPreset: null, btTx: null, allZoneStereo: null,
    volumeLimit: null, powerOnLevel: null, muteLevel: null,
    tuner: { band: null, freq: null, preset: null }, firmware: {},
  };
}

/** "375" -> -42.5, "40" -> -40, "99" -> null (99 = "---" / minimum) */
export function volToDb(raw: string): number | null {
  const s = raw.trim();
  if (!/^\d{2,3}$/.test(s)) return null;
  const n = s.length === 3 ? Number(s) / 10 : Number(s);
  if (n >= 99) return -80;
  return n - 80;
}

/** -42.5 -> "375", -40 -> "40" */
export function dbToVol(db: number): string {
  const n = Math.round((db + 80) * 2) / 2;
  const clamped = Math.min(98, Math.max(0, n));
  const whole = Math.floor(clamped);
  const two = String(whole).padStart(2, '0');
  return clamped % 1 ? `${two}5` : two;
}

/** Channel/sub level: "50" -> 0, "505" -> +0.5, "38" -> -12 */
export function levelToDb(raw: string): number | null {
  const s = raw.trim();
  if (!/^\d{2,3}$/.test(s)) return null;
  return (s.length === 3 ? Number(s) / 10 : Number(s)) - 50;
}

export function dbToLevel(db: number): string {
  const n = Math.min(62, Math.max(38, Math.round((db + 50) * 2) / 2));
  const two = String(Math.floor(n)).padStart(2, '0');
  return n % 1 ? `${two}5` : two;
}

// Longest/most specific first. Value is what follows the key.
const PS_KEYS = [
  'TONE CTRL ', 'CINEMA EQ.', 'MULTEQ:', 'DYNEQ ', 'DYNVOL ', 'REFLEV ', 'DRC ', 'LFE ', 'BAS ', 'TRE ',
  'SWL ', 'SWR ', 'DEH ', 'RSTR ', 'LOM ', 'DELAY ', 'DEL ', 'NEURAL ', 'CES ', 'DIC ', 'LFC ', 'CNTAMT ', 'DIL ',
  'BSC ', 'SP:', 'PHG ', 'GEQ ', 'CEN ', 'CEI ', 'CEG ', 'PAN ', 'DIM ',
];

// Telnet SI codes the X1700H knows, in a sensible display order. Names come from SSFUN.
export const SOURCE_ORDER = ['SAT/CBL', 'MPLAY', 'BD', 'GAME', 'TV', 'DVD', 'AUX1', 'AUX2', 'CD', 'PHONO', 'TUNER', 'NET', 'BT', 'USB'];
export const SOURCE_DEFAULT_NAMES: Record<string, string> = {
  'SAT/CBL': 'CBL/SAT', MPLAY: 'Media Player', BD: 'Blu-ray', GAME: 'Game', TV: 'TV Audio', DVD: 'DVD',
  AUX1: 'AUX1', AUX2: 'AUX2', CD: 'CD', PHONO: 'Phono', TUNER: 'Tuner', NET: 'HEOS Music', BT: 'Bluetooth', USB: 'USB',
};

/**
 * Apply one telnet line to the state. Returns true if something changed.
 * Mutates `st` in place for speed; callers broadcast afterwards.
 */
export function applyLine(st: AvrState, line: string): boolean {
  const l = line.replace(/\s+$/, '');
  if (!l) return false;
  const before = JSON.stringify(pick(st, l));
  applyInner(st, l);
  return JSON.stringify(pick(st, l)) !== before;
}

// Cheap change detection: only compare the part of the state the line can touch.
function pick(st: AvrState, l: string): unknown {
  const p = l.slice(0, 2);
  switch (p) {
    case 'PS': return st.ps;
    case 'CV': return [st.channels, st.activeChannels];
    case 'Z2': return st.zone2;
    case 'SS': return [st.inputs, st.quickNames, st.setupLevels, st.volumeLimit, st.powerOnLevel, st.muteLevel, st.sampleRate, st.signal, st.firmware, st.audioFormat, st.video];
    case 'TF': case 'TP': case 'TM': return st.tuner;
    default: return st;
  }
}

// Per-state bookkeeping for the CV? reply currently being received (not part of the broadcast state).
const cvBatch = new WeakMap<AvrState, { open: boolean; list: string[] }>();

function applyInner(st: AvrState, l: string): void {
  if (!l.startsWith('CV')) { const b = cvBatch.get(st); if (b) b.open = false; } // a CV run ended without CVEND
  if (l.startsWith('PW')) { st.power = l === 'PWON'; if (!st.power) st.sleep = 0; return; }
  if (l.startsWith('ZM')) { st.zoneMain = l === 'ZMON'; if (!st.zoneMain) st.sleep = 0; return; } // timer ends with the zone
  if (l.startsWith('MVMAX')) { st.volumeMax = volToDb(l.slice(5).trim()); return; }
  if (l.startsWith('MV')) { const v = volToDb(l.slice(2)); if (v !== null) st.volume = v; return; }
  if (l.startsWith('MU')) { st.mute = l === 'MUON'; return; }
  if (l.startsWith('MSQUICK')) { const n = Number(l.slice(7).trim()); if (!Number.isNaN(n)) st.quick = n; return; }
  if (l.startsWith('MS')) { st.surround = l.slice(2).trim(); return; }
  if (l.startsWith('SI')) { st.source = l.slice(2).trim(); return; }
  if (l.startsWith('SYSMI')) { st.soundModeText = l.slice(5).trim(); return; }
  if (l.startsWith('SYSDA')) { st.decoder = l.slice(5).trim(); return; }
  if (l.startsWith('SYSDV')) { // SYSDVIN 4K24 / SYSDVOUT 4K24 / SYSDV END
    const m = l.match(/^SYSDV(IN|OUT) (.*)$/);
    if (m) st.video[m[1] === 'IN' ? 'resIn' : 'resOut'] = m[2].trim();
    return;
  }
  if (l.startsWith('SYMO')) { st.model = l.slice(4).trim(); return; }
  if (l.startsWith('PS')) {
    const body = l.slice(2);
    for (const k of PS_KEYS) {
      if (body.startsWith(k)) { st.ps[k.replace(/[ .:]$/, '')] = body.slice(k.length).trim(); return; }
    }
    const m = body.match(/^(\S+)\s+(.*)$/);
    if (m) st.ps[m[1]] = m[2].trim();
    return;
  }
  if (l.startsWith('CV')) {
    // A CV? reply is a run of consecutive CV lines ending in CVEND, listing only the active channels.
    let batch = cvBatch.get(st);
    if (!batch || !batch.open) { batch = { open: true, list: [] }; cvBatch.set(st, batch); }
    if (l === 'CVEND') { st.activeChannels = batch.list; batch.open = false; return; }
    const m = l.slice(2).match(/^([A-Z0-9]+) (\d{2,3})$/);
    if (m) {
      const v = levelToDb(m[2]);
      if (v !== null) st.channels[m[1]] = v;
      if (!batch.list.includes(m[1])) batch.list.push(m[1]);
    }
    return;
  }
  if (l.startsWith('Z2')) { applyZone2(st.zone2, l.slice(2)); return; }
  if (l.startsWith('SLP')) { const r = l.slice(3).trim(); st.sleep = r === 'OFF' ? 0 : Number(r); return; }
  if (l.startsWith('ECO')) { st.eco = l.slice(3).trim(); return; }
  if (l.startsWith('DIM')) { st.dimmer = l.slice(3).trim(); return; }
  if (l.startsWith('STBY')) { st.autoStandby = l.slice(4).trim(); return; }
  if (l.startsWith('SPPR')) { st.speakerPreset = l.slice(4).trim(); return; }
  if (l.startsWith('BTTX')) { const v = l.slice(4).trim(); if (v === 'ON' || v === 'OFF') st.btTx = v; return; }
  if (l.startsWith('MNZST')) { st.allZoneStereo = l.slice(5).trim() === 'ON'; return; }
  if (l.startsWith('TFAN')) { st.tuner.freq = l.slice(4).trim(); return; }
  if (l.startsWith('TMAN')) { const v = l.slice(4).trim(); if (v === 'AM' || v === 'FM') st.tuner.band = v; return; }
  if (l.startsWith('TPAN')) { st.tuner.preset = l.slice(4).trim(); return; }
  if (l.startsWith('SS')) { applySS(st, l.slice(2)); return; }
}

function applyZone2(z: Zone2, r: string): void {
  if (r === 'ON' || r === 'OFF') { z.power = r === 'ON'; return; }
  if (r === 'MUON' || r === 'MUOFF') { z.mute = r === 'MUON'; return; }
  if (/^\d{2,3}$/.test(r)) { z.volume = volToDb(r); return; }
  if (/^[A-Z]/.test(r) && !r.startsWith('CV') && !r.startsWith('PS') && !r.startsWith('SLP') && !r.startsWith('HPF')) {
    z.source = r.trim();
  }
}

function applySS(st: AvrState, r: string): void {
  let m: RegExpMatchArray | null;
  if (r.startsWith('FUN')) {
    if (r === 'FUN END') return;
    m = r.slice(3).match(/^(\S+) (.*)$/);
    if (m) st.inputs[m[1]] = { name: m[2].trim(), hidden: st.inputs[m[1]]?.hidden ?? false };
    return;
  }
  if (r.startsWith('SOD')) {
    if (r === 'SOD END') return;
    m = r.slice(3).match(/^(\S+) (USE|DEL)$/);
    if (m) {
      const cur = st.inputs[m[1]] ?? { name: SOURCE_DEFAULT_NAMES[m[1]] ?? m[1], hidden: false };
      st.inputs[m[1]] = { ...cur, hidden: m[2] === 'DEL' };
    }
    return;
  }
  if ((m = r.match(/^QSNZMAQS(\d) ?(.*)$/))) { st.quickNames[Number(m[1]) - 1] = m[2].trim(); return; }
  if (r.startsWith('LEV')) {
    if (r === 'LEV END') return;
    m = r.slice(3).match(/^([A-Z0-9]+) (\d{2,3})$/);
    if (m) { const v = levelToDb(m[2]); if (v !== null) st.setupLevels[m[1]] = v; }
    return;
  }
  if ((m = r.match(/^VCTZMA(LIM|PON|MLV) ?(.*)$/))) {
    const v = m[2].trim();
    if (m[1] === 'LIM') st.volumeLimit = v; else if (m[1] === 'PON') st.powerOnLevel = v; else st.muteLevel = v;
    return;
  }
  if (r.startsWith('INFAISFSV')) { st.sampleRate = r.slice(9).trim(); return; }
  if (r.startsWith('INFAISSIG')) { st.signal = r.slice(9).trim(); return; }
  if (r.startsWith('INFAISFOR')) { st.audioFormat = r.slice(9).trim(); return; }
  if ((m = r.match(/^INFSIG(HDR|FRL) ([IO])(.*)$/))) {
    st.video[`${m[1].toLowerCase()}${m[2] === 'I' ? 'In' : 'Out'}` as 'hdrIn'] = m[3].trim();
    return;
  }
  if ((m = r.match(/^INFSIG(COS|PIX) (\S+)$/))) { st.video[m[1] === 'COS' ? 'cos' : 'pix'] = m[2]; return; }
  if (r.startsWith('INFFRM')) {
    if (r === 'INFFRM END') return;
    m = r.slice(6).match(/^(\S+) (.*)$/);
    if (m) st.firmware[m[1]] = m[2].trim();
  }
}

/** Telnet queries that populate the full state (sent on connect, spaced out). */
export const REFRESH_QUERIES = [
  'PW?', 'ZM?', 'MV?', 'MU?', 'SI?', 'MS?', 'CV?', 'SYMO',
  'PSTONE CTRL ?', 'PSBAS ?', 'PSTRE ?', 'PSMULTEQ: ?', 'PSDYNEQ ?', 'PSDYNVOL ?', 'PSREFLEV ?',
  'PSCINEMA EQ. ?', 'PSDRC ?', 'PSLFE ?', 'PSSWL ?', 'PSSWR ?', 'PSDEH ?', 'PSRSTR ?', 'PSLOM ?',
  'PSDEL ?', 'PSNEURAL ?', 'PSCES ?',
  'Z2?', 'Z2MU?', 'SLP?', 'ECO?', 'DIM ?', 'STBY?', 'SPPR ?', 'BTTX ?', 'MSQUICK ?', 'MNZST ?',
  'SSSOD ?', 'SSFUN ?', 'SSQSNZMA ?', 'SSLEV ?', 'SSVCTZMA ?', 'SSINFAISFSV ?', 'SSINFAISSIG ?', 'SSINFFRM ?',
  'TFAN?', 'TMAN?', 'TPAN?',
];

/** Lighter refresh after power-on / input change (parameters can differ per input). */
export const POWER_ON_QUERIES = [
  'MV?', 'MU?', 'SI?', 'MS?', 'CV?', 'PSTONE CTRL ?', 'PSBAS ?', 'PSTRE ?', 'PSMULTEQ: ?', 'PSDYNEQ ?',
  'PSDYNVOL ?', 'PSREFLEV ?', 'PSCINEMA EQ. ?', 'PSDRC ?', 'PSSWL ?', 'PSDEH ?', 'PSRSTR ?', 'PSLOM ?',
  'SSINFAISFSV ?', 'SSINFAISSIG ?',
];

/** HDMI video + audio-format info (instant telnet queries; the Information web page takes ~30 s). */
export const SIGNAL_QUERIES = ['SYSDV ?', 'SSINFSIGHDR ?', 'SSINFSIGCOS ?', 'SSINFSIGPIX ?', 'SSINFSIGFRL ?', 'SSINFAISFOR ?'];

// Setup API "Levels" page (speakers type 5) speaker index -> telnet channel code.
export const LEVEL_INDEX_TO_CODE: Record<number, string> = {
  0: 'FL', 1: 'C', 2: 'FR', 3: 'FWR', 4: 'SR', 5: 'SBR', 6: 'SB', 7: 'SBL', 8: 'SL', 9: 'FWL', 10: 'FHR', 11: 'FDR',
  12: 'TFR', 13: 'TMR', 14: 'SDR', 15: 'TRR', 16: 'SHR', 17: 'RHR', 18: 'BDR', 19: 'BDL', 20: 'RHL', 21: 'SHL', 22: 'TRL',
  23: 'SDL', 24: 'TML', 25: 'TFL', 26: 'FDL', 27: 'FHL', 28: 'CH', 29: 'TS', 30: 'SW', 31: 'SW2', 33: 'SW3', 34: 'SW4',
};

/** Installed speakers from the setup API Levels XML (only configured speakers are listed). */
export function installedFromLevelsXml(xml: string): string[] {
  const out: string[] = [];
  for (const m of xml.matchAll(/<Speaker index="(\d+)"[^>]*display="(\d)"/g)) {
    const code = LEVEL_INDEX_TO_CODE[Number(m[1])];
    if (code && m[2] !== '1' && !out.includes(code)) out.push(code);
  }
  return out;
}
