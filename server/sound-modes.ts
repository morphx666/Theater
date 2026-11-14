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
// MSDOLBY DIGITAL / MSDTS SURROUND, which pick the native mode of PCM and Dolby signals; with DTS-HD both are
// ignored). Anything else is reached by pressing MOVIE, MUSIC and GAME until the receiver reports it. Each switch
// drops the audio for a moment, and many in a row make streaming players stop, so buttons whose learned cycle
// doesn't have the mode are skipped.
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
  native?: string | null; // what MSDOLBY DIGITAL / MSDTS SURROUND selected; null = they're ignored with this signal
  cycles?: Partial<Record<(typeof BUTTONS)[number], string[]>>; // each button's full cycle
  learnedFw?: string; // firmware when all three cycles were learned ("Learn modes" is offered again after an update)
};
type Store = { version: 2; names: Record<string, string>; signals: Record<string, Signal> };

/** What this project's unit offered (2026-11-14). Shown until this receiver's own cycles say otherwise. */
const HINT_NAMES: Record<string, string> = {
  'DOLBY AUDIO-DSUR': 'Dolby Surround', 'DOLBY ATMOS': 'Dolby Atmos', 'MCH STEREO': 'Multi Ch Stereo',
  'DOLBY AUDIO-DD+NEURAL:X': 'DD + Neural:X', 'DTS HD+NEURAL:X': 'DTS-HD + Neural:X', 'DTS HD MSTR': 'DTS-HD MSTR',
  'DTS HD+DSUR': 'DTS-HD + DSur', 'MONO MOVIE': 'Mono Movie', 'VIDEO GAME': 'Video Game', VIRTUAL: 'Virtual',
};
const HINTS: Record<string, { modes: string[]; native?: string | null }> = {
  'PCM:2CH': { modes: ['DOLBY AUDIO-DSUR'], native: 'DOLBY AUDIO-DSUR' },
  'PCM:MULTI': { modes: ['DOLBY AUDIO-DSUR'], native: 'DOLBY AUDIO-DSUR' },
  DOLBYATMOS: { modes: ['DOLBY ATMOS'], native: 'DOLBY ATMOS' },
  'DOLBYAUDIO-DD': { modes: ['DOLBY AUDIO-DD+NEURAL:X'] },
  // MSDTS SURROUND and MSDOLBY DIGITAL are both ignored with DTS-HD MSTR: no native mode.
  'DTS-HDMSTR': { modes: ['DTS HD+NEURAL:X', 'DTS HD MSTR', 'DTS HD+DSUR', 'VIDEO GAME', 'VIRTUAL'], native: null },
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
  private lastMs = { mode: '', at: -Infinity };
  private lastMi = { text: '', at: -Infinity };
  private memory: Record<string, string> = {}; // the mode each button last moved to (presses made here)
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
      for (const [key, s] of Object.entries(raw.signals ?? {}) as [string, any][]) {
        if (!okText(key) || !s || typeof s !== 'object') continue;
        const sig = this.sig(key);
        sig.modes = (Array.isArray(s.modes) ? s.modes : []).filter(okText);
        if (okText(s.native) || s.native === null) sig.native = s.native;
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
    // The first report after MSDOLBY DIGITAL / MSDTS SURROUND is its answer (once).
    const expect = !!this.expectNative && now < this.expectNative.until && this.expectNative.key === key;
    if (expect) this.expectNative = null;
    // Remember it only if it stays, with the same signal, for a moment (mode reports arrive mid-handshake too).
    clearTimeout(this.pendingLearn);
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

  private name(mode: string, text: string) {
    const t = text.replace(/^Dolby Audio - /, '');
    if (groupOf(mode) !== 'surround' || !okText(t) || !nameFits(mode, text) || this.store.names[mode] === t) return;
    this.store.names[mode] = t;
    this.save();
    this.io.changed?.();
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
  private nativeFor(key: string | null): string | undefined {
    if (!key) return undefined;
    const own = this.store.signals[key]?.native;
    return (own === undefined ? HINTS[key]?.native : own) ?? undefined; // null (ignored here) -> no native mode
  }

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
    let got: string[];
    if (cur && this.memory[button] === cur) got = await pair(); // a single press would only show the mode
    else {
      this.send(button);
      this.pressedAt[button] = this.now();
      got = await this.watch(cur, REPLY_MS);
      if (!got.length) { // it only showed the mode (the one it remembers): press twice once the window has closed
        await this.sleep(Math.max(0, CLOSED_MS - REPLY_MS));
        got = await pair();
      }
    }
    if (got.length) this.memory[button] = got[got.length - 1];
    return got;
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
      const now = this.io.state().surround;
      if (this.matches(now, t)) return { ok: true, mode: now };
      if (groupOf(want!) !== 'surround') return { ok: false, mode: now, note: 'the receiver didn\'t switch to it' };
      // The native-mode command did something else: it selects `now` with this signal, or (nothing reported)
      // it's ignored. Correct that and look for the mode with the buttons instead.
      if (key) { this.sig(key).native = got.length && now && groupOf(now) === 'surround' ? now : null; this.save(); }
    }

    // 2. Otherwise cycle MOVIE, MUSIC, GAME until it appears or the modes repeat, skipping buttons whose cycle was
    //    learned on this receiver and doesn't have it (hints never rule a button out).
    for (const button of BUTTONS) {
      const known = sig?.cycles?.[button];
      if (known && !known.some((m) => this.matches(m, t))) continue;
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
    if (opts.back && start && this.io.state().surround !== start) {
      const back = directCommand(start, native, key);
      if (back) await this.press(back);
      else await this.run({ exact: start }, {}); // reachable by cycling, since it was playing
    }
    return { ok: false, mode: this.io.state().surround, note };
  }
}
