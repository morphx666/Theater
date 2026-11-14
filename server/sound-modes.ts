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
// Selecting a mode uses a direct command when one is known (Stereo, Multi Ch Stereo, Direct, Pure Direct, and
// MSDOLBY DIGITAL / MSDTS SURROUND, which pick the signal's native mode). Anything else is reached by pressing
// MOVIE, MUSIC and GAME until the receiver reports it. Each switch drops the audio for a moment, and many in a row
// make streaming players stop, so buttons whose learned cycle doesn't have the mode are skipped.

import fs from 'node:fs/promises';
import path from 'node:path';
import type { AvrState } from './parse.ts';

export type Family = 'pcm' | 'dolby' | 'dts' | 'other';
export type Group = 'surround' | 'stereo' | 'direct';
export type ModeInfo = { mode: string; label: string; group: Group };

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

export function groupOf(mode: string): Group {
  if (/^(PURE DIRECT|DIRECT)/.test(mode)) return 'direct';
  if (/^(STEREO|MCH STEREO|MULTI CH STEREO)/.test(mode)) return 'stereo';
  return 'surround';
}

/** Command that selects `mode` in one step, or null when it can only be reached by cycling. */
export function directCommand(mode: string, native: string | undefined, key: string | null): string | null {
  if (/^PURE DIRECT/.test(mode)) return 'MSPURE DIRECT';
  if (/^DIRECT/.test(mode)) return 'MSDIRECT';
  if (/^STEREO/.test(mode)) return 'MSSTEREO';
  if (/^(MCH STEREO|MULTI CH STEREO)/.test(mode)) return 'MSMCH STEREO';
  if (native && mode === native) return familyOf(key) === 'dts' ? 'MSDTS SURROUND' : 'MSDOLBY DIGITAL';
  return null;
}

const FIXED: ModeInfo[] = [
  { mode: 'STEREO', label: 'Stereo', group: 'stereo' },
  { mode: 'MCH STEREO', label: 'Multi Ch Stereo', group: 'stereo' },
  { mode: 'DIRECT', label: 'Direct', group: 'direct' },
  { mode: 'PURE DIRECT', label: 'Pure Direct', group: 'direct' },
];

type Signal = {
  modes: string[]; // surround modes seen on this receiver with this signal
  native?: string; // what MSDOLBY DIGITAL / MSDTS SURROUND selected
  cycles?: Partial<Record<(typeof BUTTONS)[number], string[]>>; // each button's full cycle
  learnedFw?: string; // firmware when all three cycles were learned ("Learn modes" is offered again after an update)
};
type Store = { version: 2; names: Record<string, string>; signals: Record<string, Signal> };

/** What this project's unit offered (2026-11-14). Shown until this receiver's own cycles say otherwise. */
const HINT_NAMES: Record<string, string> = {
  'DOLBY AUDIO-DSUR': 'Dolby Surround', 'DOLBY ATMOS': 'Dolby Atmos', 'MCH STEREO': 'Multi Ch Stereo',
  'DOLBY AUDIO-DD+NEURAL:X': 'DD + Neural:X', 'DTS HD+NEURAL:X': 'DTS-HD + Neural:X', 'DTS HD MSTR': 'DTS-HD MSTR',
  'DTS HD+DSUR': 'DTS-HD + DSur', 'MONO MOVIE': 'Mono Movie', VIRTUAL: 'Virtual',
};
const HINTS: Record<string, { modes: string[]; native?: string }> = {
  'PCM:2CH': { modes: ['DOLBY AUDIO-DSUR'], native: 'DOLBY AUDIO-DSUR' },
  'PCM:MULTI': { modes: ['DOLBY AUDIO-DSUR'], native: 'DOLBY AUDIO-DSUR' },
  DOLBYATMOS: { modes: ['DOLBY ATMOS'], native: 'DOLBY ATMOS' },
  'DOLBYAUDIO-DD': { modes: ['DOLBY AUDIO-DD+NEURAL:X'] },
  'DTS-HDMSTR': { modes: ['DTS HD+NEURAL:X', 'DTS HD MSTR', 'DTS HD+DSUR', 'MONO MOVIE', 'VIRTUAL'], native: 'DTS HD+NEURAL:X' },
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
const REPLY_MS = 5000; // how long to wait for the receiver to report a new mode
const MAX_PRESSES = 12;
const okText = (m: unknown): m is string => typeof m === 'string' && /^[\x20-\x7E]{1,40}$/.test(m);

export class SoundModes {
  private file: string;
  private io: SoundModeIo;
  private store: Store = { version: 2, names: {}, signals: {} };
  private pendingLearn: ReturnType<typeof setTimeout> | undefined;
  private expectNative: { key: string; until: number } | null = null;
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
    for (const [k, v] of Object.entries(raw.names ?? {})) if (okText(k) && okText(v)) this.store.names[k] = v as string;
    if (raw.version === 2) {
      for (const [key, s] of Object.entries(raw.signals ?? {}) as [string, any][]) {
        if (!okText(key) || !s || typeof s !== 'object') continue;
        const sig = this.sig(key);
        sig.modes = (Array.isArray(s.modes) ? s.modes : []).filter(okText);
        if (okText(s.native)) sig.native = s.native;
        if (okText(s.learnedFw)) sig.learnedFw = s.learnedFw;
        for (const b of BUTTONS) if (Array.isArray(s.cycles?.[b]) && s.cycles[b].every(okText)) (sig.cycles ??= {})[b] = s.cycles[b];
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
    if (line.startsWith('SYSMI') && st.surround && groupOf(st.surround) === 'surround') {
      const text = line.slice(5).trim().replace(/^Dolby Audio - /, '');
      if (okText(text) && this.store.names[st.surround] !== text) { this.store.names[st.surround] = text; this.save(); this.io.changed?.(); }
      return;
    }
    if (!/^MS(?!QUICK)/.test(line)) return;
    const mode = st.surround, key = signalKey(st);
    if (!mode || !key) return;
    // Remember it only if it stays, with the same signal, for a moment (mode reports arrive mid-handshake too).
    clearTimeout(this.pendingLearn);
    const expect = this.expectNative && this.now() < this.expectNative.until && this.expectNative.key === key;
    this.pendingLearn = setTimeout(() => {
      const s = this.io.state();
      if (s.surround !== mode || signalKey(s) !== key || groupOf(mode) !== 'surround') return;
      const sig = this.sig(key);
      let changed = false;
      if (!sig.modes.includes(mode)) { sig.modes.push(mode); changed = true; this.io.log?.(`sound mode learned for ${key}: ${mode}`); }
      if (expect && sig.native !== mode) { sig.native = mode; changed = true; }
      if (changed) { this.save(); this.io.changed?.(); }
    }, this.io.settleMs ?? SETTLE_MS);
  }

  /** Call when a command is sent (from anywhere): MSDOLBY DIGITAL / MSDTS SURROUND teach the native mode. */
  onCommand(cmd: string) {
    const key = signalKey(this.io.state());
    if (key && /^MS(DOLBY DIGITAL|DTS SURROUND)$/.test(cmd)) this.expectNative = { key, until: this.now() + REPLY_MS };
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
  private nativeFor(key: string | null) { return key ? this.store.signals[key]?.native ?? HINTS[key]?.native : undefined; }

  /** "Learn modes" is offered until this signal's cycles are learned, and again after a firmware update. */
  canLearn(key = signalKey(this.io.state())) {
    if (!key) return false;
    const sig = this.store.signals[key];
    if (!this.complete(sig)) return true;
    const fw = this.firmware();
    return !!fw && !!sig!.learnedFw && fw !== sig!.learnedFw;
  }

  /** The modes known for the signal playing now, for the panel and the editor. */
  summary() {
    const st = this.io.state();
    const key = signalKey(st);
    const available: ModeInfo[] = [...this.modesFor(key).map((mode) => ({ mode, label: this.label(mode), group: 'surround' as Group })), ...FIXED];
    const current = st.surround;
    if (current && !available.some((m) => m.mode === current)) available.unshift({ mode: current, label: this.label(current), group: groupOf(current) });
    return { signal: key, family: familyOf(key), native: this.nativeFor(key) ?? null, current, label: current ? this.label(current) : null,
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
  select(target: { exact?: string; text?: string }, opts: { back?: boolean } = {}): Promise<SelectResult> {
    return this.exclusive('select', () => this.run(target, opts), (note) => ({ ok: false, mode: this.io.state().surround, note }));
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
        for (let i = 0; i < MAX_PRESSES; i++) {
          const got = await this.press(b);
          if (signalKey(this.io.state()) !== key) return { ok: false, modes: [], note: 'the signal changed' };
          if (!got || seen.includes(got)) break;
          seen.push(got);
        }
        cycles[b] = seen;
      }
      sig.cycles = cycles;
      sig.learnedFw = this.firmware() ?? undefined;
      // A complete scan is the truth for this signal: keep what the buttons offer (and the native mode).
      const cycled = BUTTONS.flatMap((b) => cycles[b] ?? []).filter((m) => groupOf(m) === 'surround');
      const native = sig.native ?? (cycled.includes(HINTS[key]?.native ?? '') ? HINTS[key].native : undefined);
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

  /** Send a command and wait until the receiver reports a different mode (or the time runs out). */
  private async press(c: string): Promise<string | null> {
    const before = this.io.state().surround;
    const r = this.io.cmd(c);
    if (!r.ok) throw new Error(r.reason ?? `${c} rejected`);
    for (let waited = 0; waited < REPLY_MS; waited += 200) {
      await this.sleep(200);
      if (this.io.state().surround !== before) { await this.sleep(600); break; } // let a passing report settle
    }
    return this.io.state().surround;
  }

  private async run(t: { exact?: string; text?: string }, opts: { back?: boolean }): Promise<SelectResult> {
    const start = this.io.state().surround;
    if (this.matches(start, t)) return { ok: true, mode: start, note: 'already set' };
    const key = signalKey(this.io.state());
    const native = this.nativeFor(key);
    const sig = key ? this.store.signals[key] : undefined;

    // 1. A known mode with a direct command: one step.
    const want = t.exact ?? [...this.modesFor(key), ...FIXED.map((f) => f.mode)].find((m) => this.matches(m, t));
    const direct = want ? directCommand(want, native, key) : null;
    if (direct) {
      const got = await this.press(direct);
      return this.matches(got, t) ? { ok: true, mode: got } : { ok: false, mode: got, note: 'the receiver didn\'t switch to it' };
    }

    // 2. Otherwise cycle MOVIE, MUSIC, GAME until it appears or the modes repeat, skipping buttons whose cycle was
    //    learned on this receiver and doesn't have it (hints never rule a button out).
    for (const button of BUTTONS) {
      const known = sig?.cycles?.[button];
      if (known && !known.some((m) => this.matches(m, t))) continue;
      const seen: string[] = [];
      for (let i = 0; i < MAX_PRESSES; i++) {
        const got = await this.press(button);
        if (this.matches(got, t)) return { ok: true, mode: got };
        if (!got) break;
        if (seen.includes(got)) { // round the whole cycle: remember it
          if (key) { (this.sig(key).cycles ??= {})[button] = seen; this.save(); }
          break;
        }
        seen.push(got);
      }
    }

    const note = 'not available for this signal';
    if (opts.back && start && this.io.state().surround !== start) {
      const back = directCommand(start, native, key);
      if (back) await this.press(back);
      else await this.run({ exact: start }, {}); // reachable by cycling, since it was playing
    }
    return { ok: false, mode: this.io.state().surround, note };
  }
}
