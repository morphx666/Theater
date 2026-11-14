// Sound modes the receiver actually offers, learned per input signal (decoder), and selecting one.
//
// The owner's manual promises modes this unit doesn't offer (probed 2026-11-14, firmware D400-9123-9071-9031:
// with stereo PCM and with Dolby Atmos, MOVIE / MUSIC / GAME all cycle through just three modes: the signal's
// native mode, Multi Ch Stereo and Stereo). With Dolby Digital 5.1 and DTS-HD MA 7.1 it offers "+ Neural:X" and,
// for DTS-HD, effect modes too. So the app goes by what the receiver reports, not by the manual:
//  - every mode seen while a signal plays is remembered for that signal (one list per decoder: DTS-HD MSTR and
//    plain DTS offer differently named modes);
//  - "Learn modes" steps through the three buttons once and records each one's full cycle;
//  - built-in hints (what this project's unit offered) fill the lists before anything is learned, and drop out
//    once this receiver's full cycle for that signal is known and doesn't have them.
//
// Selecting a mode takes one command whenever there is one (probed 2026-11-14 with DTS-HD MA 7.1):
//  - Stereo, Multi Ch Stereo, Direct, Pure Direct: their own commands;
//  - effect modes by their code: MSVIRTUAL, MSVIDEO GAME, MSMONO MOVIE. Untried codes are tried once and the answer
//    remembered (an ignored command doesn't switch anything);
//  - the decoder's own modes ("DTS HD MSTR", "DTS HD+DSUR", "DTS HD+NEURAL:X") have no command of their own, but
//    MSDTS SURROUND / MSDOLBY DIGITAL return to the one used last, and MSAUTO picks one too (DTS-HD + Neural:X).
//    So the app tracks which one each of those leads to.
// Anything else is reached by pressing MOVIE, MUSIC and GAME until the receiver reports it. A button's first press
// goes to the mode that button used last, wherever the mode was set from. Each switch drops the audio for a
// moment, and many in a row make streaming players stop, so buttons whose learned cycle doesn't have the mode are
// skipped.
//
// The buttons (tested 2026-11-14): when the current mode is the one a button remembers, its first press only
// shows it (nothing is reported), and a second press within about a second moves on (5 s later it only shows
// again; 2.5 s later neither). A press that moves is reported about 1.5 s later, too late to tell a "show" from a
// move within the window. So the app tracks the mode each button remembers: when that's the current mode, a step
// presses twice, a second apart; otherwise once, and if nothing moved, twice. Steps of one button are at least
// 3 s apart, so the window has closed and a pair never moves twice.

import fs from 'node:fs/promises';
import path from 'node:path';
import type { AvrState } from './parse.ts';

export type Family = 'pcm' | 'dolby' | 'dts' | 'other';
export type Group = 'surround' | 'stereo' | 'direct';
export type Kind = 'source' | 'upmix' | 'effect';
export type ModeInfo = { mode: string; label: string; group: Group; kind?: Kind };

export const BUTTONS = ['MSMOVIE', 'MSMUSIC', 'MSGAME'] as const;

/** The key the lists are kept under: the decoder as the receiver names it ("DTS-HDMSTR", "DOLBYATMOS"), with
 *  PCM split into stereo and multi-channel. null = no signal. */
export function signalKey(st: AvrState): string | null {
  const d = (st.decoder ?? '').toUpperCase().replace(/\s+/g, '');
  if (!d || /ZERO|UNKNOWN|NONE|^-+$/.test(d)) return null;
  if (/^(PCM|ANALOG)/.test(d)) {
    const m = st.audioFormat?.match(/^(\d+)\/(\d+)/);
    return m && Number(m[1]) + Number(m[2]) > 2 ? 'PCM:MULTI' : 'PCM:2CH';
  }
  return d;
}

export function familyOf(key: string | null): Family {
  if (!key) return 'other';
  if (key.startsWith('PCM')) return 'pcm';
  if (key.includes('DTS')) return 'dts';
  if (/DOLBY|TRUEHD|^DD/.test(key)) return 'dolby';
  return 'other';
}

/** What a surround mode does with the signal: plays it as it is ("DTS HD MSTR" for DTS-HD MSTR, "DOLBY ATMOS"), upmixes
 *  it ("+ Neural:X", "+ DSur", Dolby Surround with PCM), or adds an effect (Virtual, Rock Arena…). */
export function kindOf(mode: string, decoder: string | null | undefined): Kind {
  const norm = (x: string) => x.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (decoder && norm(mode) === norm(decoder)) return 'source';
  if (/\+|NEURAL|DSUR|DOLBY SURROUND|AURO/.test(mode)) return 'upmix';
  return /^(DTS|DOLBY|MULTI CH IN)/.test(mode) ? 'source' : 'effect';
}
const KIND_ORDER: Kind[] = ['source', 'upmix', 'effect'];

export function groupOf(mode: string): Group {
  if (/^(PURE DIRECT|DIRECT)/.test(mode)) return 'direct';
  if (/^(STEREO|MCH STEREO|MULTI CH STEREO)/.test(mode)) return 'stereo';
  return 'surround';
}

/** The command for a stereo or direct mode (every signal has these). */
export function fixedCommand(mode: string): string | null {
  if (/^PURE DIRECT/.test(mode)) return 'MSPURE DIRECT';
  if (/^DIRECT/.test(mode)) return 'MSDIRECT';
  if (/^STEREO/.test(mode)) return 'MSSTEREO';
  if (/^(MCH STEREO|MULTI CH STEREO)/.test(mode)) return 'MSMCH STEREO';
  return null;
}

/** The command that returns to the decoder's own mode used last. */
export const nativeCommand = (key: string | null) => familyOf(key) === 'dts' ? 'MSDTS SURROUND' : 'MSDOLBY DIGITAL';

/** A decoder's own mode ("DTS HD+DSUR" with DTS-HD, "DOLBY AUDIO-DD+NEURAL:X" with Dolby Digital): no command of
 *  its own; MSDTS SURROUND / MSDOLBY DIGITAL return to the one used last. */
export function decoderMode(key: string | null, mode: string): boolean {
  const f = familyOf(key);
  return f === 'dts' ? /^DTS/.test(mode) : f === 'dolby' ? /^DOLBY/.test(mode) : false;
}

/** Mode codes the guard lets through as `MS<code>` (others can't be tried as a command). */
const SENDABLE = /^[A-Z0-9 :.\-]{1,28}$/;

const FIXED: ModeInfo[] = [
  { mode: 'STEREO', label: 'Stereo', group: 'stereo' },
  { mode: 'MCH STEREO', label: 'Multi Ch Stereo', group: 'stereo' },
  { mode: 'DIRECT', label: 'Direct', group: 'direct' },
  { mode: 'PURE DIRECT', label: 'Pure Direct', group: 'direct' },
];

type Signal = {
  name?: string; // the decoder as the receiver shows it ("DTS-HD MSTR"), for the editor's lists
  modes: string[]; // surround modes seen on this receiver with this signal
  native?: string | null; // what MSDOLBY DIGITAL / MSDTS SURROUND selects now (the decoder mode used last); null = ignored
  auto?: string; // what MSAUTO selects with this signal
  cycles?: Partial<Record<(typeof BUTTONS)[number], string[]>>; // each button's full cycle
  remembers?: Partial<Record<(typeof BUTTONS)[number], string>>; // the mode each button last moved to (its first press goes there)
  learnedFw?: string; // firmware when all three cycles were learned ("Learn modes" is offered again after an update)
};
type Store = {
  version: 2; names: Record<string, string>; signals: Record<string, Signal>;
  direct?: Record<string, boolean>; // whether MS<mode> selects the mode (tried once)
};

/** What this project's unit offered (2026-11-14). Shown until this receiver's own cycles say otherwise. */
const HINT_NAMES: Record<string, string> = {
  'DOLBY AUDIO-DSUR': 'Dolby Surround', 'DOLBY ATMOS': 'Dolby Atmos', 'MCH STEREO': 'Multi Ch Stereo',
  'DOLBY AUDIO-DD+NEURAL:X': 'DD + Neural:X', 'DTS HD+NEURAL:X': 'DTS-HD + Neural:X', 'DTS HD MSTR': 'DTS-HD MSTR',
  'DTS HD+DSUR': 'DTS-HD + DSur', 'MONO MOVIE': 'Mono Movie', 'VIDEO GAME': 'Video Game', VIRTUAL: 'Virtual',
};
const HINTS: Record<string, { modes: string[]; native?: string | null; auto?: string }> = {
  'PCM:2CH': { modes: ['DOLBY AUDIO-DSUR'], native: 'DOLBY AUDIO-DSUR' },
  'PCM:MULTI': { modes: ['DOLBY AUDIO-DSUR'], native: 'DOLBY AUDIO-DSUR' },
  DOLBYATMOS: { modes: ['DOLBY ATMOS'], native: 'DOLBY ATMOS' },
  'DOLBYAUDIO-DD': { modes: ['DOLBY AUDIO-DD+NEURAL:X'] },
  'DTS-HDMSTR': { modes: ['DTS HD+NEURAL:X', 'DTS HD MSTR', 'DTS HD+DSUR', 'VIDEO GAME', 'VIRTUAL'], auto: 'DTS HD+NEURAL:X' },
};
/** Effect modes this unit selects by their code (probed 2026-11-14). The decoder's own modes never are. */
const DIRECT_HINTS: Record<string, boolean> = { VIRTUAL: true, 'VIDEO GAME': true, 'MONO MOVIE': true };

const HINT_SIGNAL_NAMES: Record<string, string> = {
  'PCM:2CH': 'Stereo PCM', 'PCM:MULTI': 'Multi-channel PCM', DOLBYATMOS: 'Dolby Atmos', 'DOLBYAUDIO-DD': 'Dolby Audio - DD', 'DTS-HDMSTR': 'DTS-HD MSTR',
};

/** The first file format (one list per family) -> per decoder. Only the families whose decoder is known. */
const V1_KEYS: Record<string, string> = { pcm2: 'PCM:2CH', 'pcm-multi': 'PCM:MULTI', atmos: 'DOLBYATMOS', dolby: 'DOLBYAUDIO-DD', dts: 'DTS-HDMSTR' };
const PROBED_FW = 'D400-9123-9071-9031'; // the v1 cycles came from the probe on this firmware

export type SoundModeIo = {
  state: () => AvrState;
  cmd: (c: string) => { ok: boolean; reason?: string };
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  log?: (m: string) => void;
  changed?: () => void;
  settleMs?: number; // tests shorten the learning delay
};

export type SelectResult = { ok: boolean; mode: string | null; note?: string };

const SETTLE_MS = 2000; // a mode must stay put this long, with the same signal, before it's remembered
const REPLY_MS = 3000; // how long to wait for the receiver to report a new mode (it takes about 1.5 s)
const QUIET_MS = 900; // after a report, how long to keep watching for another one
const AGAIN_MS = 1000; // second press of a pair: within the button's "moves on" window (1 s moves, 2.5 s doesn't)
const CLOSED_MS = 3000; // after this long the window has closed: the next press shows or jumps, never moves on
const PAIR_MS = 400; // a mode code (MS) and its display name (SYSMI) arrive this close together
const MAX_STEPS = 12;
const okText = (m: unknown): m is string => typeof m === 'string' && /^[\x20-\x7E]{1,40}$/.test(m);
/** A display name plausibly belongs to a mode code: same first word ("VIDEO GAME" isn't "Virtual"). */
const firstWord = (s: string) => s.toUpperCase().match(/[A-Z0-9]+/)?.[0] ?? '';
const nameFits = (mode: string, text: string) => firstWord(mode) === firstWord(text.replace(/^Dolby Audio - /, ''))
  || firstWord(mode) === firstWord(text);

export class SoundModes {
  private file: string;
  private io: SoundModeIo;
  private store: Store = { version: 2, names: {}, signals: {} };
  private pendingLearn: ReturnType<typeof setTimeout> | undefined;
  private expectNative: { key: string; until: number } | null = null;
  private expectAuto: { key: string; until: number } | null = null;
  private lastMs = { mode: '', at: -Infinity };
  private lastMi = { text: '', at: -Infinity };
  private pressedAt: Record<string, number> = {};
  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  busy: false | 'select' | 'learn' = false;

  constructor(dataDir: string, io: SoundModeIo) {
    this.file = path.join(dataDir, 'sound-modes.json');
    this.io = io;
  }

  private sleep(ms: number) { return this.io.sleep ? this.io.sleep(ms) : new Promise<void>((r) => setTimeout(r, ms)); }
  private now() { return this.io.now?.() ?? Date.now(); }
  private sig(key: string): Signal { return (this.store.signals[key] ??= { modes: [] }); }
  private firmware() { return this.io.state().firmware?.AVR ?? null; }

  async load() {
    let raw: any;
    try { raw = JSON.parse(await fs.readFile(this.file, 'utf8')); } catch { return; }
    for (const [k, v] of Object.entries(raw.names ?? {})) if (okText(k) && okText(v) && nameFits(k, v as string)) this.store.names[k] = v as string;
    if (raw.version === 2) {
      for (const [k, v] of Object.entries(raw.direct ?? {})) if (okText(k) && typeof v === 'boolean') (this.store.direct ??= {})[k] = v;
      for (const [key, s] of Object.entries(raw.signals ?? {}) as [string, any][]) {
        if (!okText(key) || !s || typeof s !== 'object') continue;
        const sig = this.sig(key);
        if (okText(s.name)) sig.name = s.name;
        sig.modes = (Array.isArray(s.modes) ? s.modes : []).filter(okText);
        if (okText(s.native) || s.native === null) sig.native = s.native;
        if (okText(s.auto)) sig.auto = s.auto;
        for (const b of BUTTONS) if (okText(s.remembers?.[b])) (sig.remembers ??= {})[b] = s.remembers[b];
        // A real cycle has at least two modes; shorter ones were recorded by an earlier bug (a press that only
        // showed the mode was taken for the end of the cycle).
        for (const b of BUTTONS) if (Array.isArray(s.cycles?.[b]) && s.cycles[b].length >= 2 && s.cycles[b].every(okText)) (sig.cycles ??= {})[b] = s.cycles[b];
        if (okText(s.learnedFw) && this.complete(sig)) sig.learnedFw = s.learnedFw;
      }
      return;
    }
    // Version 1 (one list per family). Kept for the families whose decoder name is known; the cycles came from
    // the probe, which was on PROBED_FW.
    for (const [old, key] of Object.entries(V1_KEYS)) {
      const sig = this.sig(key);
      for (const m of raw.kinds?.[old] ?? []) if (okText(m) && !sig.modes.includes(m)) sig.modes.push(m);
      if (okText(raw.native?.[old])) sig.native = raw.native[old];
      const c = raw.cycles?.[old];
      if (c && BUTTONS.every((b) => Array.isArray(c[b]) && c[b].every(okText))) {
        sig.cycles = Object.fromEntries(BUTTONS.map((b) => [b, c[b]]));
        sig.learnedFw = PROBED_FW;
      }
    }
    this.save();
  }

  private save() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(async () => {
      try {
        await fs.mkdir(path.dirname(this.file), { recursive: true });
        await fs.writeFile(this.file, JSON.stringify(this.store, null, 2));
      } catch (e) { this.io.log?.(`could not save sound modes: ${(e as Error).message}`); }
    }, 1000);
  }

  /** Feed every telnet line here (after applyLine). Learns display names and the modes each signal offers. */
  onLine(line: string) {
    const st = this.io.state();
    const now = this.now();
    // Display names: the receiver sends the code (MS…) and the name (SYSMI…) close together, in either order.
    if (line.startsWith('SYSMI')) {
      this.lastMi = { text: line.slice(5).trim(), at: now };
      if (now - this.lastMs.at <= PAIR_MS) this.name(this.lastMs.mode, this.lastMi.text);
      return;
    }
    if (!/^MS(?!QUICK)/.test(line)) return;
    const mode = st.surround, key = signalKey(st);
    if (!mode) return;
    this.lastMs = { mode, at: now };
    if (now - this.lastMi.at <= PAIR_MS) this.name(mode, this.lastMi.text);
    if (!key) return;
    // The first report after MSDOLBY DIGITAL / MSDTS SURROUND or MSAUTO is its answer (once).
    const answer = (e: typeof this.expectNative) => !!e && now < e.until && e.key === key;
    const expect = answer(this.expectNative), expectAuto = answer(this.expectAuto);
    if (expect) this.expectNative = null;
    if (expectAuto) this.expectAuto = null;
    // Remember it only if it stays, with the same signal, for a moment (mode reports arrive mid-handshake too).
    clearTimeout(this.pendingLearn);
    this.pendingLearn = setTimeout(() => {
      const s = this.io.state();
      if (s.surround !== mode || signalKey(s) !== key || groupOf(mode) !== 'surround') return;
      const sig = this.sig(key);
      let changed = false;
      const name = s.decoder?.trim();
      if (key.startsWith('PCM') ? !sig.name : name && sig.name !== name) { sig.name = key.startsWith('PCM') ? HINT_SIGNAL_NAMES[key] : name; changed = true; }
      if (!sig.modes.includes(mode)) { sig.modes.push(mode); changed = true; this.io.log?.(`sound mode learned for ${key}: ${mode}`); }
      // The native-mode command returns to the decoder mode used last: this one, now.
      if ((expect || decoderMode(key, mode)) && sig.native !== mode) { sig.native = mode; changed = true; }
      if (expectAuto && sig.auto !== mode) { sig.auto = mode; changed = true; }
      if (changed) { this.save(); this.io.changed?.(); }
    }, this.io.settleMs ?? SETTLE_MS);
  }

  private name(mode: string, text: string) {
    const t = text.replace(/^Dolby Audio - /, '');
    if (groupOf(mode) !== 'surround' || !okText(t) || !nameFits(mode, text) || this.store.names[mode] === t) return;
    this.store.names[mode] = t;
    this.save();
    this.io.changed?.();
  }

  /** Call when a command is sent (from anywhere): MSDOLBY DIGITAL / MSDTS SURROUND teach the native mode, MSAUTO
   *  what Auto selects. */
  onCommand(cmd: string) {
    const key = signalKey(this.io.state());
    if (key && /^MS(DOLBY DIGITAL|DTS SURROUND)$/.test(cmd)) this.expectNative = { key, until: this.now() + REPLY_MS };
    if (key && cmd === 'MSAUTO') this.expectAuto = { key, until: this.now() + REPLY_MS };
  }

  label(mode: string) {
    return this.store.names[mode] ?? HINT_NAMES[mode] ?? FIXED.find((f) => f.mode === mode)?.label
      ?? mode.replace(/\b([A-Z])([A-Z]+)\b/g, (_, a, b) => a + b.toLowerCase());
  }

  private complete(sig: Signal | undefined) { return !!sig?.cycles && BUTTONS.every((b) => sig.cycles![b]); }

  /** Surround modes for a signal: seen here, then the cycles, then the hints this receiver hasn't ruled out. */
  private modesFor(key: string | null): string[] {
    if (!key) return [];
    const sig = this.store.signals[key];
    const cycled = BUTTONS.flatMap((b) => sig?.cycles?.[b] ?? []);
    const hints = (HINTS[key]?.modes ?? []).filter((m) => !this.complete(sig) || cycled.includes(m));
    return [...new Set([...(sig?.modes ?? []), ...cycled, ...hints])].filter((m) => groupOf(m) === 'surround');
  }
  private nativeFor(key: string | null): string | undefined {
    if (!key) return undefined;
    const own = this.store.signals[key]?.native;
    return (own === undefined ? HINTS[key]?.native : own) ?? undefined; // null (ignored here) -> no native mode
  }
  private autoFor(key: string | null): string | undefined {
    return key ? this.store.signals[key]?.auto ?? HINTS[key]?.auto : undefined;
  }
  /** Whether MS<mode> is worth sending: known to work, or not tried yet (decoder modes never work). */
  private codeWorks(mode: string): boolean | undefined {
    const known = this.store.direct?.[mode] ?? DIRECT_HINTS[mode];
    if (known !== undefined) return known;
    // MSDTS… / MSDOLBY… codes are ignored (DTS HD MSTR, DOLBY AUDIO-DSUR…), except the two native-mode commands.
    return SENDABLE.test(mode) && !/^(DTS|DOLBY)/.test(mode) && groupOf(mode) === 'surround' ? undefined : false;
  }

  /** "Learn modes" is offered until this signal's cycles are learned, and again after a firmware update. */
  canLearn(key = signalKey(this.io.state())) {
    if (!key) return false;
    const sig = this.store.signals[key];
    if (!this.complete(sig)) return true;
    const fw = this.firmware();
    return !!fw && !!sig!.learnedFw && fw !== sig!.learnedFw;
  }

  /** Every mode known or learned, for the editor's "set Sound mode" list: surround modes grouped by the signals
   *  they were seen with, then the ones every signal has. Auto is last (it lets the receiver choose). */
  allModes(): { value: string; label: string; group: string }[] {
    const seen = new Map<string, string[]>(); // mode -> signal names
    for (const key of new Set([...Object.keys(HINTS), ...Object.keys(this.store.signals)])) {
      const name = this.store.signals[key]?.name ?? HINT_SIGNAL_NAMES[key] ?? key;
      for (const m of this.modesFor(key)) { const l = seen.get(m) ?? []; if (!l.includes(name)) l.push(name); seen.set(m, l); }
    }
    return [
      ...[...seen].map(([mode, sigs]) => ({ value: mode, label: this.label(mode), group: `With ${sigs.join(' / ')}` }))
        .sort((a, b) => a.group.localeCompare(b.group) || a.label.localeCompare(b.label)),
      ...FIXED.map((f) => ({ value: f.mode, label: f.label, group: 'Any signal' })),
      { value: 'AUTO', label: 'Auto (the receiver picks)', group: 'Any signal' },
    ];
  }

  /** The modes known for the signal playing now, for the panel and the editor. */
  summary() {
    const st = this.io.state();
    const key = signalKey(st);
    const current = st.surround;
    // Surround modes: the one that plays the source as it is first, then upmixes, then effects, each by name.
    const modes = this.modesFor(key);
    if (current && groupOf(current) === 'surround' && !modes.includes(current)) modes.push(current); // not learned yet
    const surround: ModeInfo[] = modes.map((mode) => ({ mode, label: this.label(mode), group: 'surround' as Group, kind: kindOf(mode, st.decoder) }))
      .sort((a, b) => KIND_ORDER.indexOf(a.kind!) - KIND_ORDER.indexOf(b.kind!) || a.label.localeCompare(b.label));
    const available: ModeInfo[] = [...surround, ...FIXED];
    if (current && !available.some((m) => m.mode === current)) available.unshift({ mode: current, label: this.label(current), group: groupOf(current) });
    return { signal: key, signalName: st.decoder?.trim() || null, family: familyOf(key), native: this.nativeFor(key) ?? null,
      current, label: current ? this.label(current) : null,
      available, canLearn: this.canLearn(key), busy: this.busy };
  }

  private async exclusive<T>(what: 'select' | 'learn', fn: () => Promise<T>, fail: (note: string) => T): Promise<T> {
    if (this.busy) return fail('another sound mode change is in progress');
    if (this.io.state().zoneMain !== true) return fail('main zone is off');
    this.busy = what;
    this.io.changed?.();
    try { return await fn(); } finally { this.busy = false; this.io.changed?.(); }
  }

  /**
   * Select a mode: `exact` mode id, or the first known/reported mode containing `text`. Uses a direct command when
   * there is one, otherwise presses MOVIE, MUSIC, GAME until it appears or the modes repeat. With `back`, a search
   * that fails returns to the mode it started from.
   */
  select(target: { exact?: string; text?: string }, opts: { back?: boolean; waitSignalMs?: number } = {}): Promise<SelectResult> {
    return this.exclusive('select', async () => {
      // Right after an input change the new signal may not be there yet: wait a little for it.
      for (let t = 0; t < (opts.waitSignalMs ?? 0) && !signalKey(this.io.state()); t += 250) await this.sleep(250);
      return this.run(target, opts);
    }, (note) => ({ ok: false, mode: this.io.state().surround, note }));
  }

  /** Step through each button's full cycle for the signal playing, remember it, and return to where it was. */
  learn(): Promise<{ ok: boolean; modes: string[]; note?: string }> {
    return this.exclusive('learn', async () => {
      const key = signalKey(this.io.state());
      if (!key) return { ok: false, modes: [], note: 'no signal' };
      const start = this.io.state().surround;
      const sig = this.sig(key);
      const cycles: Signal['cycles'] = {};
      for (const b of BUTTONS) {
        const seen: string[] = [];
        for (let i = 0; i < MAX_STEPS; i++) {
          const got = await this.step(b);
          if (signalKey(this.io.state()) !== key) return { ok: false, modes: [], note: 'the signal changed' };
          if (!got.length) break; // the button does nothing here
          const fresh = got.filter((m) => !seen.includes(m));
          seen.push(...fresh);
          if (fresh.length < got.length) break; // back to a mode already seen: round the whole cycle
        }
        if (seen.length >= 2) cycles[b] = seen;
      }
      if (!BUTTONS.every((b) => cycles[b])) return { ok: false, modes: [], note: 'the receiver didn\'t go round the modes' };
      sig.cycles = cycles;
      sig.learnedFw = this.firmware() ?? undefined;
      // A complete scan is the truth for this signal: keep what the buttons offer (and the native mode).
      const cycled = BUTTONS.flatMap((b) => cycles[b] ?? []).filter((m) => groupOf(m) === 'surround');
      const hinted = HINTS[key]?.native;
      const native = sig.native ?? (hinted && cycled.includes(hinted) ? hinted : undefined);
      sig.modes = [...new Set([...(native ? [native] : []), ...cycled])]; // the native mode first
      this.save();
      this.io.log?.(`sound modes learned for ${key}: ${sig.modes.join(', ') || '(none)'}`);
      if (start && this.io.state().surround !== start) await this.run({ exact: start }, {});
      return { ok: true, modes: sig.modes };
    }, (note) => ({ ok: false, modes: [], note }));
  }

  private matches(mode: string | null, t: { exact?: string; text?: string }) {
    if (!mode) return false;
    if (t.exact) return mode === t.exact;
    const q = (t.text ?? '').toUpperCase().replace(/\s+/g, ' ').trim();
    return !!q && (mode.toUpperCase().includes(q) || this.label(mode).toUpperCase().includes(q));
  }

  private send(c: string) {
    const r = this.io.cmd(c);
    if (!r.ok) throw new Error(r.reason ?? `${c} rejected`);
  }

  /** Every mode the receiver reports, compared with `before` (the mode before the press), within `ms` and then
   *  until it's quiet for QUIET_MS, in order. */
  private async watch(before: string | null, ms: number): Promise<string[]> {
    const seen: string[] = [];
    let last = before, quietUntil = 0;
    const look = (t: number) => {
      const cur = this.io.state().surround;
      if (cur && cur !== last) { seen.push(cur); last = cur; quietUntil = t + QUIET_MS; }
    };
    look(0); // a report that came in before watching started
    for (let t = 0; ; t += 150) {
      if (seen.length ? t >= quietUntil : t >= ms) break;
      await this.sleep(150);
      look(t + 150);
    }
    return seen;
  }

  /** Send a direct command; the modes it led to (empty = ignored). */
  private async press(c: string): Promise<string[]> {
    const before = this.io.state().surround;
    this.send(c);
    return this.watch(before, REPLY_MS);
  }

  /** One step of MOVIE / MUSIC / GAME: the modes it moved through (empty = the button does nothing here). */
  private async step(button: string): Promise<string[]> {
    const since = this.now() - (this.pressedAt[button] ?? -Infinity);
    if (since < CLOSED_MS) await this.sleep(CLOSED_MS - since);
    const pair = async () => {
      const before = this.io.state().surround;
      this.send(button); await this.sleep(AGAIN_MS); this.send(button);
      this.pressedAt[button] = this.now();
      return this.watch(before, REPLY_MS);
    };
    const cur = this.io.state().surround;
    const key = signalKey(this.io.state());
    const remembers = key ? this.store.signals[key]?.remembers?.[button as (typeof BUTTONS)[number]] : undefined;
    let got: string[];
    if (cur && remembers === cur) got = await pair(); // a single press would only show the mode
    else {
      this.send(button);
      this.pressedAt[button] = this.now();
      got = await this.watch(cur, REPLY_MS);
      if (!got.length) { // it only showed the mode (the one it remembers): press twice once the window has closed
        await this.sleep(Math.max(0, CLOSED_MS - REPLY_MS));
        got = await pair();
      }
    }
    const last = got[got.length - 1];
    if (key && last && signalKey(this.io.state()) === key) {
      const sig = this.sig(key);
      if ((sig.remembers ??= {})[button as (typeof BUTTONS)[number]] !== last) { sig.remembers[button as (typeof BUTTONS)[number]] = last; this.save(); }
    }
    return got;
  }

  /** Buttons that may reach the mode, fewest switches first: a press goes to the mode the button remembers, then
   *  each step moves one on in its cycle. Buttons whose cycle isn't known yet come last. */
  private buttonOrder(sig: Signal | undefined, t: { exact?: string; text?: string }) {
    const cost = (b: (typeof BUTTONS)[number]) => {
      const cycle = sig?.cycles?.[b];
      if (!cycle) return 100;
      const to = cycle.findIndex((m) => this.matches(m, t));
      if (to < 0) return Infinity;
      const from = cycle.indexOf(sig?.remembers?.[b] ?? '');
      return from < 0 ? 1 + cycle.length : 1 + (to - from + cycle.length) % cycle.length;
    };
    return BUTTONS.map((b) => ({ b, c: cost(b) })).filter((x) => x.c !== Infinity).sort((x, y) => x.c - y.c).map((x) => x.b);
  }

  private async run(t: { exact?: string; text?: string }, opts: { back?: boolean }): Promise<SelectResult> {
    const start = this.io.state().surround;
    if (this.matches(start, t)) return { ok: true, mode: start, note: 'already set' };
    const key = signalKey(this.io.state());
    const sig = key ? this.store.signals[key] : undefined;
    const want = t.exact ?? [...this.modesFor(key), ...FIXED.map((f) => f.mode)].find((m) => this.matches(m, t));

    // 1. One command, when there is one.
    const fixed = want ? fixedCommand(want) : null;
    if (fixed) {
      await this.press(fixed);
      const now = this.io.state().surround;
      return this.matches(now, t) ? { ok: true, mode: now } : { ok: false, mode: now, note: 'the receiver didn\'t switch to it' };
    }
    if (want && want === this.nativeFor(key)) { // back to the decoder mode used last
      const got = await this.press(nativeCommand(key));
      const now = this.io.state().surround;
      if (this.matches(now, t)) return { ok: true, mode: now };
      // It returned to another one (that's the one it leads to now), or it's ignored with this signal.
      if (key) {
        this.sig(key).native = got.length && now && groupOf(now) === 'surround' ? now
          : now && decoderMode(key, now) ? now : null; // nothing reported: already on the one it leads to
        this.save();
      }
    }
    if (want && want === this.autoFor(key) && !this.matches(this.io.state().surround, t)) {
      const got = await this.press('MSAUTO');
      const now = this.io.state().surround;
      if (this.matches(now, t)) return { ok: true, mode: now };
      if (key && got.length && now && groupOf(now) === 'surround') { this.sig(key).auto = now; this.save(); }
    }
    if (want && this.codeWorks(want) !== false && !this.matches(this.io.state().surround, t)) {
      let got: string[] = [];
      try { got = await this.press(`MS${want}`); } catch { /* the guard refused it */ }
      const now = this.io.state().surround;
      const works = this.matches(now, t);
      // Ignored (nothing reported) means it doesn't work; another mode reported proves nothing either way.
      if ((works || !got.length) && (this.store.direct ??= {})[want] !== works) { this.store.direct[want] = works; this.save(); }
      if (works) return { ok: true, mode: now };
      if (got.length) this.io.log?.(`MS${want} led to ${got.join(' > ')}`);
    }
    if (this.matches(this.io.state().surround, t)) return { ok: true, mode: this.io.state().surround };

    // 2. Otherwise cycle MOVIE, MUSIC, GAME until it appears or the modes repeat: the button that gets there in the
    //    fewest switches first, skipping buttons whose cycle was learned on this receiver and doesn't have it
    //    (hints never rule a button out).
    for (const button of this.buttonOrder(sig, t)) {
      const seen: string[] = [];
      let passed = false; // moved past it within one step (two moves reported): it comes round again
      for (let i = 0; i < MAX_STEPS; i++) {
        const got = await this.step(button);
        const now = this.io.state().surround;
        if (this.matches(now, t)) return { ok: true, mode: now };
        if (!got.length) break;
        if (got.some((m) => this.matches(m, t))) passed = true;
        const fresh = got.filter((m) => !seen.includes(m));
        seen.push(...fresh);
        if (fresh.length < got.length && !passed) { // round the whole cycle: remember it
          if (key && seen.length >= 2) { (this.sig(key).cycles ??= {})[button] = seen; this.save(); }
          break;
        }
      }
    }

    const note = 'not available for this signal';
    if (opts.back && start && this.io.state().surround !== start) await this.run({ exact: start }, {}); // it was playing: reachable
    return { ok: false, mode: this.io.state().surround, note };
  }
}
