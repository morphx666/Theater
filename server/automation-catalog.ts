// Every property an automation can watch, test or set (docs/AUTOMATION.md §3).
// Values are in human units (dB, enum ids, booleans); the receiver's encodings stay inside read / write.
// When you add a state field the user might care about, add it here too.

import { dbToVol, dbToLevel, levelToDb, SOURCE_ORDER, SOURCE_DEFAULT_NAMES, type AvrState } from './parse.ts';
import type { AudioMap } from './audio-map.ts';
import type { PropType, Value } from './automation-ops.ts';

/** What rules can see. Only `state` and `audioMap` are required (tests build just those). */
export type Ctx = {
  state: AvrState;
  audioMap: AudioMap;
  nowPlaying?: { state: string | null; song: string; artist: string; album: string; station: string; source: string | null } | null;
  presets?: { list: { id: string; name: string }[]; active: string | null } | null; // speaker presets (summary)
  favorites?: { name: string }[]; // HEOS favorites, in order (1-based when played)
  soundModeChoices?: { value: string; label: string; group: string }[]; // every known / learned sound mode
  conn?: { telnet: boolean; http: boolean; heos: boolean };
  videoInfo?: { in: Record<string, string | null>; out: Record<string, string | null> } | null;
};
export type Option = { value: string; label: string; group?: string };

/** An action the app performs itself (not a telnet command). */
export type AppAction =
  | { kind: 'speakerPreset'; id: string; confirmAmp: boolean }
  | { kind: 'soundMode'; mode: string }
  | { kind: 'heos'; action: 'play' | 'pause' | 'stop' | 'next' | 'previous' }
  | { kind: 'heosFavorite'; index: number };

export type PropDef = {
  id: string;
  label: string;
  group: string;
  type: PropType;
  unit?: 'dB' | 'ms' | 'min';
  min?: number; max?: number; step?: number;
  /** Enum options. Called without a context for validation (static list), with one for the editor (live names). */
  options?: (ctx?: Ctx) => Option[];
  /** For a text property that can be set: the values an action may use, from the live context (e.g. sound modes). */
  writeChoices?: (ctx?: Ctx) => Option[];
  /** A parameter that picks one of several values, e.g. the channel for a channel level. */
  param?: { label: string; options: (ctx?: Ctx) => Option[] };
  read: (ctx: Ctx, param?: string) => Value;
  write?: (value: Value, param?: string) => string[];
  /** An app action instead of telnet commands (speaker presets, HEOS). */
  app?: (value: Value, param?: string, opts?: { confirmAmp?: boolean }) => AppAction;
  /** Validate a value without the live option list (presets and favorites change; rules refer to them by id). */
  validValue?: (v: unknown) => boolean;
  writeOnly?: boolean; // can't be read: only for actions, never in triggers or conditions
  needsInput?: string; // actions are skipped unless this input is selected (e.g. TUNER)
  needsZone2?: boolean; // actions are skipped while Zone 2 is off
  confirmAmp?: boolean; // the action may need the Amp Assign confirmation (speaker presets)
  /** Does the current value already count as `value`? Default: equal. */
  same?: (current: Value, value: Value) => boolean;
  /** Always send (no "already set" skip, no verify), e.g. recalling a Quick Select. */
  alwaysSend?: boolean;
  settleMs?: number; // default time a trigger on this property waits for things to settle
  needsZone?: boolean; // actions are skipped while the main zone is off
  onlyLower?: boolean; // actions may use "only lower, never raise"
  relative?: boolean; // actions may "change by" a number of dB (at most RELATIVE_MAX_DB) instead of "set to"
};

// ---------- helpers ----------

const opts = (pairs: [string, string][]): Option[] => pairs.map(([value, label]) => ({ value, label }));
const onOff = (raw: string | undefined): boolean | null => (raw === 'ON' ? true : raw === 'OFF' ? false : null);
const num = (raw: string | undefined, f: (s: string) => number | null): number | null => {
  if (raw == null || !/^-?\d+(\.\d+)?$/.test(raw.trim())) return null;
  return f(raw.trim());
};

/** Channel codes the receiver uses in its channel grids and for channel levels. */
export const CHANNELS: Option[] = opts([
  ['FL', 'Front left'], ['FR', 'Front right'], ['C', 'Center'], ['LFE', 'LFE'], ['SW', 'Subwoofer'], ['SW2', 'Subwoofer 2'],
  ['SL', 'Surround left'], ['SR', 'Surround right'], ['SBL', 'Surround back left'], ['SBR', 'Surround back right'],
  ['SB', 'Surround back'], ['FWL', 'Front wide left'], ['FWR', 'Front wide right'], ['FHL', 'Front height left'],
  ['FHR', 'Front height right'], ['TFL', 'Top front left'], ['TFR', 'Top front right'], ['TML', 'Top middle left'],
  ['TMR', 'Top middle right'], ['TRL', 'Top rear left'], ['TRR', 'Top rear right'], ['RHL', 'Rear height left'],
  ['RHR', 'Rear height right'], ['FDL', 'Front Dolby left'], ['FDR', 'Front Dolby right'], ['SDL', 'Surround Dolby left'],
  ['SDR', 'Surround Dolby right'], ['BDL', 'Back Dolby left'], ['BDR', 'Back Dolby right'], ['SHL', 'Surround height left'],
  ['SHR', 'Surround height right'], ['TS', 'Top surround'], ['CH', 'Center height'],
]);
const LEVEL_CHANNELS = CHANNELS.filter((c) => c.value !== 'LFE'); // CV uses SW for the subwoofer
const HEIGHT = /^(FH|TF|TM|TR|RH|FD|SD|BD|SH|TS|CH)/;
const LFE = /^(LFE|SW)/;

/** Channels marked active in one of the audio map grids, or null when the map isn't known. */
function gridOn(ctx: Ctx, which: 'input' | 'output'): string[] | null {
  const g = ctx.audioMap?.[which];
  if (!g) return null;
  return g.flat().filter((c) => c?.on).map((c) => c!.ch);
}

/** "5.1", "5.1.4" from a channel list (LFE / SW count as the .1, heights as the third number). */
export function layoutOf(chs: string[]): string {
  const lfe = chs.filter((c) => LFE.test(c)).length;
  const heights = chs.filter((c) => HEIGHT.test(c)).length;
  const beds = chs.length - lfe - heights;
  return heights ? `${beds}.${lfe}.${heights}` : `${beds}.${lfe}`;
}

/** Count and layout from SSINFAISFOR ("3/2/.1" = 3 front, 2 surround, LFE) when the grid isn't known yet. */
export function fromFormat(fmt: string | null): { count: number; layout: string } | null {
  const m = fmt?.match(/^(\d+)\/(\d+)(?:\/\.?(\d+))?/);
  if (!m) return null;
  const beds = Number(m[1]) + Number(m[2]);
  const lfe = Number(m[3] ?? 0);
  return { count: beds + lfe, layout: `${beds}.${lfe}` };
}

function inputChannels(ctx: Ctx): string[] | null {
  return gridOn(ctx, 'input');
}

// PS parameters: enum / on-off / numeric, with the command prefix the panels use.
function psEnum(key: string, label: string, group: string, choices: [string, string][], prefix = `PS${key} `): PropDef {
  return {
    id: `ps.${key}`, label, group, type: 'enum', options: () => opts(choices), needsZone: true,
    read: (c) => c.state.ps[key] ?? null,
    write: (v) => [`${prefix}${v}`],
  };
}
function psBool(key: string, label: string, group: string, prefix = `PS${key} `): PropDef {
  return {
    id: `ps.${key}`, label, group, type: 'bool', needsZone: true,
    read: (c) => onOff(c.state.ps[key]),
    write: (v) => [`${prefix}${v ? 'ON' : 'OFF'}`],
  };
}

// ---------- the catalog ----------

const SOUND_MODES: (Option & { match: RegExp })[] = [
  { value: 'PURE DIRECT', label: 'Pure Direct', match: /^PURE/ },
  { value: 'DIRECT', label: 'Direct', match: /^DIRECT/ },
  { value: 'STEREO', label: 'Stereo', match: /^STEREO/ },
  { value: 'MCH STEREO', label: 'Multi Ch Stereo', match: /^MCH STEREO|^MULTI CH/ },
  { value: 'AUTO', label: 'Auto', match: /^AUTO/ },
];

export const CATALOG: PropDef[] = [
  // Power
  { id: 'power', label: 'Receiver power', group: 'Power', type: 'bool', settleMs: 2000,
    read: (c) => c.state.power, write: (v) => [v ? 'PWON' : 'PWSTANDBY'] },
  { id: 'zoneMain', label: 'Main zone power', group: 'Power', type: 'bool', settleMs: 2000,
    read: (c) => c.state.zoneMain, write: (v) => [v ? 'ZMON' : 'ZMOFF'] },

  // Volume
  { id: 'volume', label: 'Volume', group: 'Volume', type: 'number', unit: 'dB', min: -80, max: 18, step: 0.5,
    needsZone: true, onlyLower: true, relative: true,
    read: (c) => c.state.volume, write: (v) => [`MV${dbToVol(v as number)}`] },
  { id: 'mute', label: 'Mute', group: 'Volume', type: 'bool', needsZone: true,
    read: (c) => c.state.mute, write: (v) => [v ? 'MUON' : 'MUOFF'] },

  // Input & signal
  { id: 'input', label: 'Input', group: 'Input & signal', type: 'enum', settleMs: 1500, needsZone: true,
    options: (c) => SOURCE_ORDER.map((s) => ({ value: s, label: c?.state.inputs[s]?.name || SOURCE_DEFAULT_NAMES[s] || s })),
    read: (c) => c.state.source, write: (v) => [`SI${v}`] },
  // Any mode the receiver offers (learned per signal, server/sound-modes.ts), selected the way the Sound mode panel
  // does it: one step when there's a command for it, otherwise through MOVIE / MUSIC / GAME.
  { id: 'soundMode', label: 'Sound mode', group: 'Input & signal', type: 'text', settleMs: 1000, needsZone: true,
    writeChoices: (c) => c?.soundModeChoices ?? SOUND_MODES.map(({ value, label }) => ({ value, label })),
    // MOVIE / MUSIC / GAME aren't modes (each press steps through a list), so they can't be "set".
    validValue: (v) => typeof v === 'string' && /^[\x20-\x7E]{1,40}$/.test(v) && !/^(MOVIE|MUSIC|GAME)$/.test(v),
    read: (c) => c.state.surround,
    app: (v) => ({ kind: 'soundMode', mode: String(v) }),
    same: (cur, v) => v !== 'AUTO' && (cur === v || !!SOUND_MODES.find((m) => m.value === v)?.match.test(String(cur ?? ''))) },
  { id: 'quick', label: 'Quick Select', group: 'Input & signal', type: 'enum', needsZone: true, alwaysSend: true,
    options: (c) => [1, 2, 3, 4].map((n) => ({ value: String(n), label: c?.state.quickNames[n - 1] || `Quick Select ${n}` })),
    read: (c) => (c.state.quick ? String(c.state.quick) : null), write: (v) => [`MSQUICK${v}`] },
  { id: 'decoder', label: 'Decoder', group: 'Input & signal', type: 'text', settleMs: 1500, read: (c) => c.state.decoder },
  { id: 'sampleRate', label: 'Sample rate', group: 'Input & signal', type: 'text', settleMs: 1500, read: (c) => c.state.sampleRate },
  { id: 'audioFormat', label: 'Audio format', group: 'Input & signal', type: 'text', settleMs: 2000, read: (c) => c.state.audioFormat },
  { id: 'input.count', label: 'Input channels (count)', group: 'Input & signal', type: 'number', min: 0, max: 24, step: 1, settleMs: 3000,
    read: (c) => inputChannels(c)?.length ?? fromFormat(c.state.audioFormat)?.count ?? null },
  { id: 'input.layout', label: 'Input channel layout', group: 'Input & signal', type: 'text', settleMs: 3000,
    read: (c) => { const l = inputChannels(c); return l ? layoutOf(l) : fromFormat(c.state.audioFormat)?.layout ?? null; } },
  { id: 'input.channel', label: 'Input channel', group: 'Input & signal', type: 'bool', settleMs: 3000,
    param: { label: 'Channel', options: () => CHANNELS },
    read: (c, p) => { const l = inputChannels(c); return l ? l.includes(p!) : null; } },
  { id: 'input.channels', label: 'Input channels', group: 'Input & signal', type: 'set', settleMs: 3000,
    read: (c) => inputChannels(c) },
  { id: 'speakers.count', label: 'Active speakers (count)', group: 'Input & signal', type: 'number', min: 0, max: 24, step: 1, settleMs: 3000,
    read: (c) => gridOn(c, 'output')?.length ?? null },
  { id: 'speakers.channel', label: 'Active speaker', group: 'Input & signal', type: 'bool', settleMs: 3000,
    param: { label: 'Speaker', options: () => CHANNELS },
    read: (c, p) => { const l = gridOn(c, 'output'); return l ? l.includes(p!) : null; } },
  { id: 'speakers.channels', label: 'Active speakers', group: 'Input & signal', type: 'set', settleMs: 3000,
    read: (c) => gridOn(c, 'output') },

  // Audio (option lists and ranges as in the Audyssey, Dialog & bass, Tone and Processing panels)
  psEnum('MULTEQ', 'MultEQ', 'Audio', [['AUDYSSEY', 'Reference'], ['BYP.LR', 'L/R Bypass'], ['FLAT', 'Flat'], ['OFF', 'Off']], 'PSMULTEQ:'),
  psBool('DYNEQ', 'Dynamic EQ', 'Audio'),
  psEnum('REFLEV', 'Reference level offset', 'Audio', [['0', '0 dB'], ['5', '5 dB'], ['10', '10 dB'], ['15', '15 dB']]),
  psEnum('DYNVOL', 'Dynamic Volume', 'Audio', [['OFF', 'Off'], ['LIT', 'Light'], ['MED', 'Medium'], ['HEV', 'Heavy']]),
  psEnum('DEH', 'Dialog Enhancer', 'Audio', [['OFF', 'Off'], ['LOW', 'Low'], ['MED', 'Medium'], ['HIGH', 'High']]),
  psBool('SWR', 'Subwoofer', 'Audio'),
  { id: 'ps.SWL', label: 'Subwoofer level', group: 'Audio', type: 'number', unit: 'dB', min: -12, max: 12, step: 0.5, needsZone: true,
    read: (c) => num(c.state.ps.SWL, levelToDb), write: (v) => [`PSSWL ${dbToLevel(v as number)}`] },
  { id: 'ps.LFE', label: 'LFE level', group: 'Audio', type: 'number', unit: 'dB', min: -10, max: 0, step: 1, needsZone: true,
    read: (c) => num(c.state.ps.LFE, (s) => -Number(s)), write: (v) => [`PSLFE ${String(-(v as number)).padStart(2, '0')}`] },
  psBool('CINEMA EQ', 'Cinema EQ', 'Audio', 'PSCINEMA EQ.'),
  psBool('TONE CTRL', 'Tone control', 'Audio'),
  { id: 'ps.BAS', label: 'Bass', group: 'Audio', type: 'number', unit: 'dB', min: -6, max: 6, step: 1, needsZone: true,
    read: (c) => num(c.state.ps.BAS, (s) => Number(s) - 50), write: (v) => [`PSBAS ${50 + (v as number)}`] },
  { id: 'ps.TRE', label: 'Treble', group: 'Audio', type: 'number', unit: 'dB', min: -6, max: 6, step: 1, needsZone: true,
    read: (c) => num(c.state.ps.TRE, (s) => Number(s) - 50), write: (v) => [`PSTRE ${50 + (v as number)}`] },
  psBool('LOM', 'Loudness management', 'Audio'),
  psEnum('DRC', 'Dynamic compression', 'Audio', [['AUTO', 'Auto'], ['LOW', 'Low'], ['MID', 'Mid'], ['HI', 'High'], ['OFF', 'Off']]),
  psEnum('RSTR', 'Restorer', 'Audio', [['OFF', 'Off'], ['LOW', 'Low'], ['MED', 'Medium'], ['HI', 'High']]),
  { id: 'ps.DELAY', label: 'Audio delay', group: 'Audio', type: 'number', unit: 'ms', min: 0, max: 500, step: 1, needsZone: true,
    read: (c) => num(c.state.ps.DELAY, Number), write: (v) => [`PSDELAY ${String(v).padStart(3, '0')}`] },
  psBool('NEURAL', 'DTS Neural:X', 'Audio'),
  psBool('CES', 'Center spread', 'Audio'),

  // Speakers
  { id: 'speakerPreset', label: 'Speaker preset', group: 'Speakers', type: 'enum', needsZone: true, confirmAmp: true,
    options: (c) => (c?.presets?.list ?? []).map((p) => ({ value: p.id, label: p.name })),
    validValue: (v) => typeof v === 'string' && /^[A-Za-z0-9-]{1,64}$/.test(v),
    read: (c) => c.presets?.active ?? null,
    app: (v, _p, o) => ({ kind: 'speakerPreset', id: String(v), confirmAmp: !!o?.confirmAmp }) },
  { id: 'channel.level', label: 'Channel level', group: 'Speakers', type: 'number', unit: 'dB', min: -12, max: 12, step: 0.5, needsZone: true,
    param: { label: 'Channel', options: (c) => (c?.state.installed.length ? LEVEL_CHANNELS.filter((o) => c.state.installed.includes(o.value)) : LEVEL_CHANNELS) },
    read: (c, p) => c.state.channels[p!] ?? null, write: (v, p) => [`CV${p} ${dbToLevel(v as number)}`] },

  // Zone 2
  { id: 'zone2.power', label: 'Zone 2 power', group: 'Zone 2', type: 'bool', settleMs: 2000,
    read: (c) => c.state.zone2.power, write: (v) => [v ? 'Z2ON' : 'Z2OFF'] },
  { id: 'zone2.source', label: 'Zone 2 source', group: 'Zone 2', type: 'enum', settleMs: 1500, needsZone2: true,
    options: (c) => [{ value: 'SOURCE', label: 'Same as main zone' },
      ...SOURCE_ORDER.map((s) => ({ value: s, label: c?.state.inputs[s]?.name || SOURCE_DEFAULT_NAMES[s] || s }))],
    read: (c) => c.state.zone2.source, write: (v) => [`Z2${v}`] },
  { id: 'zone2.volume', label: 'Zone 2 volume', group: 'Zone 2', type: 'number', unit: 'dB', min: -80, max: 18, step: 1,
    needsZone2: true, onlyLower: true, relative: true,
    read: (c) => c.state.zone2.volume, write: (v) => [`Z2${dbToVol(v as number)}`] },
  { id: 'zone2.mute', label: 'Zone 2 mute', group: 'Zone 2', type: 'bool', needsZone2: true,
    read: (c) => c.state.zone2.mute, write: (v) => [v ? 'Z2MUON' : 'Z2MUOFF'] },

  // General
  { id: 'sleep', label: 'Sleep timer', group: 'General', type: 'number', unit: 'min', min: 0, max: 120, step: 10, needsZone: true,
    read: (c) => c.state.sleep, write: (v) => [v ? `SLP${String(v).padStart(3, '0')}` : 'SLPOFF'] },
  { id: 'eco', label: 'ECO mode', group: 'General', type: 'enum', options: () => opts([['ON', 'On'], ['AUTO', 'Auto'], ['OFF', 'Off']]),
    read: (c) => c.state.eco, write: (v) => [`ECO${v}`] },
  { id: 'dimmer', label: 'Display dimmer', group: 'General', type: 'enum',
    options: () => opts([['BRI', 'Bright'], ['DIM', 'Dim'], ['DAR', 'Dark'], ['OFF', 'Off']]),
    read: (c) => c.state.dimmer, write: (v) => [`DIM ${v}`] },
  { id: 'autoStandby', label: 'Auto standby', group: 'General', type: 'enum',
    options: () => opts([['15M', '15 min'], ['30M', '30 min'], ['60M', '60 min'], ['OFF', 'Off']]),
    read: (c) => c.state.autoStandby, write: (v) => [`STBY${v}`] },
  { id: 'allZoneStereo', label: 'All Zone Stereo', group: 'General', type: 'bool', needsZone: true,
    read: (c) => c.state.allZoneStereo, write: (v) => [v ? 'MNZST ON' : 'MNZST OFF'] },
  { id: 'btTx', label: 'Bluetooth transmitter', group: 'General', type: 'bool',
    read: (c) => onOff(c.state.btTx ?? undefined), write: (v) => [v ? 'BTTX ON' : 'BTTX OFF'] },
  { id: 'btOutput', label: 'Bluetooth output', group: 'General', type: 'enum',
    options: () => opts([['SP', 'Bluetooth + speakers'], ['BT', 'Bluetooth only']]),
    read: (c) => c.state.btOutput, write: (v) => [`BTTX ${v}`] },

  // Tuner (the receiver ignores tuner commands unless the input is Tuner; the guard refuses them too)
  { id: 'tuner.band', label: 'Tuner band', group: 'Tuner', type: 'enum', needsZone: true, needsInput: 'TUNER',
    options: () => opts([['FM', 'FM'], ['AM', 'AM']]),
    read: (c) => c.state.tuner.band, write: (v) => [`TMAN${v}`] },
  { id: 'tuner.preset', label: 'Tuner preset', group: 'Tuner', type: 'enum', needsZone: true, needsInput: 'TUNER', settleMs: 1000,
    options: (c) => Array.from({ length: 56 }, (_, i) => {
      const n = String(i + 1).padStart(2, '0');
      const name = c?.state.tuner.presets[n]?.name;
      return { value: n, label: name ? `${n} · ${name}` : n };
    }).filter((o) => !c || !c.state.tuner.skipped.includes(o.value)),
    read: (c) => c.state.tuner.preset, write: (v) => [`TPAN${v}`] },
  { id: 'tuner.freq', label: 'Tuner frequency', group: 'Tuner', type: 'text',
    read: (c) => { const f = c.state.tuner.freq; if (!f) return null; return c.state.tuner.band === 'AM' ? `${Number(f)} kHz` : `${(Number(f) / 100).toFixed(2)} MHz`; } },

  // HEOS (streaming: now playing, transport, favorites)
  { id: 'heos.state', label: 'HEOS play state', group: 'HEOS', type: 'enum',
    options: () => opts([['play', 'Playing'], ['pause', 'Paused'], ['stop', 'Stopped']]),
    read: (c) => c.nowPlaying?.state ?? null,
    app: (v) => ({ kind: 'heos', action: v as 'play' | 'pause' | 'stop' }) },
  { id: 'heos.skip', label: 'HEOS track', group: 'HEOS', type: 'enum', writeOnly: true, alwaysSend: true,
    options: () => opts([['next', 'Next'], ['previous', 'Previous']]),
    read: () => null, app: (v) => ({ kind: 'heos', action: v as 'next' | 'previous' }) },
  { id: 'heos.favorite', label: 'HEOS favorite', group: 'HEOS', type: 'enum', writeOnly: true, alwaysSend: true, needsZone: true,
    options: (c) => (c?.favorites ?? []).map((f, i) => ({ value: String(i + 1), label: f.name })),
    validValue: (v) => typeof v === 'string' && /^[1-9]\d?$/.test(v),
    read: () => null, app: (v) => ({ kind: 'heosFavorite', index: Number(v) }) },
  { id: 'heos.song', label: 'HEOS title', group: 'HEOS', type: 'text', read: (c) => c.nowPlaying?.song || null },
  { id: 'heos.artist', label: 'HEOS artist', group: 'HEOS', type: 'text', read: (c) => c.nowPlaying?.artist || null },
  { id: 'heos.album', label: 'HEOS album', group: 'HEOS', type: 'text', read: (c) => c.nowPlaying?.album || null },
  { id: 'heos.station', label: 'HEOS station', group: 'HEOS', type: 'text', read: (c) => c.nowPlaying?.station || null },

  // Video (what the Status panel shows; read-only)
  ...(['in', 'out'] as const).flatMap((side) => {
    const S = side === 'in' ? 'input' : 'output';
    const v = (c: Ctx, k: string) => c.videoInfo?.[side]?.[k] ?? null;
    return [
      { id: `video.${side}.res`, label: `Video ${S} resolution`, group: 'Video', type: 'text', settleMs: 3000, read: (c) => v(c, 'res') },
      { id: `video.${side}.hdr`, label: `Video ${S} HDR`, group: 'Video', type: 'text', settleMs: 3000, read: (c) => v(c, 'hdr') },
      { id: `video.${side}.color`, label: `Video ${S} color`, group: 'Video', type: 'text', settleMs: 3000, read: (c) => v(c, 'color') },
      { id: `video.${side}.depth`, label: `Video ${S} depth`, group: 'Video', type: 'text', settleMs: 3000, read: (c) => v(c, 'depth') },
    ] as PropDef[];
  }),

  // App
  { id: 'connection', label: 'Receiver connection', group: 'App', type: 'enum',
    options: () => opts([['telnet', 'Live (telnet)'], ['http', 'HTTP fallback'], ['offline', 'Unreachable']]),
    read: (c) => (c.conn ? (c.conn.telnet ? 'telnet' : c.conn.http ? 'http' : 'offline') : null) },
];

export const PROPS: Record<string, PropDef> = Object.fromEntries(CATALOG.map((p) => [p.id, p]));

/** The catalog as JSON for the editor, with live option names. */
export function describeCatalog(ctx: Ctx) {
  return CATALOG.map((p) => ({
    id: p.id, label: p.label, group: p.group, type: p.type, unit: p.unit, min: p.min, max: p.max, step: p.step,
    options: p.options?.(ctx), writeOptions: p.writeChoices?.(ctx),
    param: p.param && { label: p.param.label, options: p.param.options(ctx) },
    writable: !!(p.write || p.app), writeOnly: !!p.writeOnly, needsZone: !!p.needsZone, needsInput: p.needsInput ?? null,
    onlyLower: !!p.onlyLower, relative: !!p.relative, confirmAmp: !!p.confirmAmp, settleMs: p.settleMs ?? null,
  }));
}
