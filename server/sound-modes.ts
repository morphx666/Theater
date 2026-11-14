// Sound modes the receiver actually offers, learned per kind of input signal, and selecting one.
//
// The owner's manual promises modes this unit doesn't offer (probed 2026-11-14, firmware D400-9123-9071-9031:
// with stereo PCM and with Dolby Atmos, MOVIE / MUSIC / GAME all cycle through just three modes: the signal's
// native mode, Multi Ch Stereo and Stereo; Neural:X and the effect modes never appear). Dolby Digital 5.1 and
// DTS-HD MA 7.1 sources were seen playing in "+ Neural:X" modes, as the manual (p.261-262) says. So the app goes by what
// the receiver reports, not by the manual: every mode seen while a signal kind is playing is remembered.
//
// Selecting a mode uses a direct command when one is known (Stereo, Multi Ch Stereo, Direct, Pure Direct, and
// MSDOLBY DIGITAL / MSDTS SURROUND, which pick the signal's native mode). Anything else is reached by pressing
// MOVIE, MUSIC and GAME until the receiver reports it, or until the modes start repeating.

import fs from 'node:fs/promises';
import path from 'node:path';
import type { AvrState } from './parse.ts';

export type Kind = 'pcm2' | 'pcm-multi' | 'dolby' | 'atmos' | 'dts' | 'dtsx' | 'other';
export type Group = 'surround' | 'stereo' | 'direct';
export type ModeInfo = { mode: string; label: string; group: Group };

/** What kind of signal is playing, from the decoder (SYSDA) and the format. null = no signal / unknown. */
export function signalKind(st: AvrState): Kind | null {
  const d = (st.decoder ?? '').toUpperCase();
  if (!d || /ZERO|UNKNOWN|NONE/.test(d)) return null;
  if (/ATMOS/.test(d)) return 'atmos';
  if (/DTS:?X/.test(d)) return 'dtsx';
  if (/DTS/.test(d)) return 'dts';
  if (/DOLBY|TRUEHD|DD/.test(d)) return 'dolby';
  if (/PCM|ANALOG/.test(d)) {
    const m = st.audioFormat?.match(/^(\d+)\/(\d+)/);
    return m && Number(m[1]) + Number(m[2]) > 2 ? 'pcm-multi' : 'pcm2';
  }
  return 'other';
}

export function groupOf(mode: string): Group {
  if (/^(PURE DIRECT|DIRECT)/.test(mode)) return 'direct';
  if (/^(STEREO|MCH STEREO|MULTI CH STEREO)/.test(mode)) return 'stereo';
  return 'surround';
}

/** Command that selects `mode` in one step, or null when it can only be reached by cycling. */
export function directCommand(mode: string, native: string | undefined, kind: Kind | null): string | null {
  if (/^PURE DIRECT/.test(mode)) return 'MSPURE DIRECT';
  if (/^DIRECT/.test(mode)) return 'MSDIRECT';
  if (/^STEREO/.test(mode)) return 'MSSTEREO';
  if (/^(MCH STEREO|MULTI CH STEREO)/.test(mode)) return 'MSMCH STEREO';
  if (native && mode === native) return kind === 'dts' || kind === 'dtsx' ? 'MSDTS SURROUND' : 'MSDOLBY DIGITAL';
  return null;
}

const FIXED: ModeInfo[] = [
  { mode: 'STEREO', label: 'Stereo', group: 'stereo' },
  { mode: 'MCH STEREO', label: 'Multi Ch Stereo', group: 'stereo' },
  { mode: 'DIRECT', label: 'Direct', group: 'direct' },
  { mode: 'PURE DIRECT', label: 'Pure Direct', group: 'direct' },
];

type Store = {
  names: Record<string, string>; // MS mode -> the receiver's display text (SYSMI)
  kinds: Partial<Record<Kind, string[]>>; // surround modes seen per signal kind
  native: Partial<Record<Kind, string>>; // what MSDOLBY DIGITAL / MSDTS SURROUND selects per kind
  cycles: Partial<Record<Kind, Record<string, string[]>>>; // the modes each button went round, per kind
};

// What the probe found (see the header), so the panel is right before anything is learned.
const SEED: Store = {
  names: {
    'DOLBY AUDIO-DSUR': 'Dolby Surround', 'DOLBY ATMOS': 'Dolby Atmos', 'MCH STEREO': 'Multi Ch Stereo',
    'DOLBY AUDIO-DD+NEURAL:X': 'DD + Neural:X', 'DTS HD+NEURAL:X': 'DTS-HD + Neural:X',
  },
  // Also seen playing (not probed): Dolby Digital 5.1 in "DD + Neural:X", DTS-HD MA 7.1 in "DTS-HD + Neural:X".
  kinds: {
    pcm2: ['DOLBY AUDIO-DSUR'], 'pcm-multi': ['DOLBY AUDIO-DSUR'], atmos: ['DOLBY ATMOS'],
    dolby: ['DOLBY AUDIO-DD+NEURAL:X'], dts: ['DTS HD+NEURAL:X'],
  },
  native: { pcm2: 'DOLBY AUDIO-DSUR', 'pcm-multi': 'DOLBY AUDIO-DSUR', atmos: 'DOLBY ATMOS' },
  cycles: {
    pcm2: Object.fromEntries(['MSMOVIE', 'MSMUSIC', 'MSGAME'].map((b) => [b, ['DOLBY AUDIO-DSUR', 'MCH STEREO', 'STEREO']])),
    atmos: Object.fromEntries(['MSMOVIE', 'MSMUSIC', 'MSGAME'].map((b) => [b, ['DOLBY ATMOS', 'MCH STEREO', 'STEREO']])),
  },
};

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

export class SoundModes {
  private file: string;
  private io: SoundModeIo;
  private store: Store = structuredClone(SEED);
  private pendingLearn: ReturnType<typeof setTimeout> | undefined;
  private expectNative: { kind: Kind; until: number } | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  busy = false;

  constructor(dataDir: string, io: SoundModeIo) {
    this.file = path.join(dataDir, 'sound-modes.json');
    this.io = io;
  }

  private sleep(ms: number) { return this.io.sleep ? this.io.sleep(ms) : new Promise<void>((r) => setTimeout(r, ms)); }
  private now() { return this.io.now?.() ?? Date.now(); }

  async load() {
    try {
      const raw = JSON.parse(await fs.readFile(this.file, 'utf8'));
      const ok = (m: unknown): m is string => typeof m === 'string' && /^[\x20-\x7E]{1,40}$/.test(m);
      for (const [k, v] of Object.entries(raw.names ?? {})) if (ok(k) && ok(v)) this.store.names[k] = v as string;
      for (const [k, list] of Object.entries(raw.kinds ?? {})) {
        if (!Array.isArray(list)) continue;
        const cur = (this.store.kinds[k as Kind] ??= []);
        for (const m of list) if (ok(m) && !cur.includes(m)) cur.push(m);
      }
      for (const [k, v] of Object.entries(raw.native ?? {})) if (ok(v)) this.store.native[k as Kind] = v as string;
      for (const [k, byButton] of Object.entries(raw.cycles ?? {})) {
        for (const [b, list] of Object.entries(byButton as Record<string, unknown>)) {
          if (/^MS(MOVIE|MUSIC|GAME)$/.test(b) && Array.isArray(list) && list.every(ok)) ((this.store.cycles[k as Kind] ??= {})[b] = list as string[]);
        }
      }
    } catch { /* first run: the seed */ }
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
      if (text && this.store.names[st.surround] !== text) { this.store.names[st.surround] = text; this.save(); this.io.changed?.(); }
      return;
    }
    if (!/^MS(?!QUICK)/.test(line)) return;
    const mode = st.surround, kind = signalKind(st);
    if (!mode || !kind) return;
    // Remember it only if it stays, with the same signal, for a moment (mode reports arrive mid-handshake too).
    clearTimeout(this.pendingLearn);
    const expect = this.expectNative && this.now() < this.expectNative.until && this.expectNative.kind === kind;
    this.pendingLearn = setTimeout(() => {
      const s = this.io.state();
      if (s.surround !== mode || signalKind(s) !== kind) return;
      let changed = false;
      if (groupOf(mode) === 'surround') {
        const list = (this.store.kinds[kind] ??= []);
        if (!list.includes(mode)) { list.push(mode); changed = true; this.io.log?.(`sound mode learned for ${kind}: ${mode}`); }
        if (expect && this.store.native[kind] !== mode) { this.store.native[kind] = mode; changed = true; }
      }
      if (changed) { this.save(); this.io.changed?.(); }
    }, this.io.settleMs ?? SETTLE_MS);
  }

  /** Call when a command is sent (from anywhere): MSDOLBY DIGITAL / MSDTS SURROUND teach the native mode. */
  onCommand(cmd: string) {
    const kind = signalKind(this.io.state());
    if (kind && /^MS(DOLBY DIGITAL|DTS SURROUND)$/.test(cmd)) this.expectNative = { kind, until: this.now() + REPLY_MS };
  }

  label(mode: string) {
    return this.store.names[mode] ?? FIXED.find((f) => f.mode === mode)?.label ?? mode.replace(/\b([A-Z])([A-Z]+)\b/g, (_, a, b) => a + b.toLowerCase());
  }

  /** The modes known for the signal playing now, for the panel and the editor. */
  summary() {
    const st = this.io.state();
    const kind = signalKind(st);
    const surround = (kind ? this.store.kinds[kind] ?? [] : []).map((mode) => ({ mode, label: this.label(mode), group: 'surround' as Group }));
    const current = st.surround;
    const available: ModeInfo[] = [...surround, ...FIXED];
    if (current && !available.some((m) => m.mode === current)) available.unshift({ mode: current, label: this.label(current), group: groupOf(current) });
    return { kind, native: kind ? this.store.native[kind] ?? null : null, current, label: current ? this.label(current) : null, available, busy: this.busy };
  }

  /**
   * Select a mode: `exact` mode id, or the first known/reported mode containing `text`. Uses a direct command when
   * there is one, otherwise presses MOVIE, MUSIC, GAME until it appears or the modes repeat. With `back`, a search
   * that fails returns to the mode it started from.
   */
  async select(target: { exact?: string; text?: string }, opts: { back?: boolean } = {}): Promise<SelectResult> {
    if (this.busy) return { ok: false, mode: this.io.state().surround, note: 'another sound mode change is in progress' };
    if (this.io.state().zoneMain !== true) return { ok: false, mode: null, note: 'main zone is off' };
    this.busy = true;
    this.io.changed?.();
    try {
      return await this.run(target, opts);
    } finally {
      this.busy = false;
      this.io.changed?.();
    }
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
    const kind = signalKind(this.io.state());
    const native = kind ? this.store.native[kind] : undefined;

    // 1. A known mode with a direct command: one step.
    const known = [...(kind ? this.store.kinds[kind] ?? [] : []), ...FIXED.map((f) => f.mode)];
    const want = t.exact ?? known.find((m) => this.matches(m, t));
    const direct = want ? directCommand(want, native, kind) : null;
    if (direct) {
      const got = await this.press(direct);
      return this.matches(got, t) ? { ok: true, mode: got } : { ok: false, mode: got, note: 'the receiver didn\'t switch to it' };
    }

    // 2. Otherwise cycle MOVIE, MUSIC, GAME until it appears or the modes repeat. A button whose whole cycle is
    //    known for this signal and doesn't have it is skipped, so a mode that isn't offered costs no switching
    //    once it has been looked for (each switch drops the audio for a moment; many in a row upset players).
    for (const button of ['MSMOVIE', 'MSMUSIC', 'MSGAME']) {
      const known = kind ? this.store.cycles[kind]?.[button] : undefined;
      if (known && !known.some((m) => this.matches(m, t))) continue;
      const seen: string[] = [];
      for (let i = 0; i < MAX_PRESSES; i++) {
        const got = await this.press(button);
        if (this.matches(got, t)) return { ok: true, mode: got };
        if (!got) break;
        if (seen.includes(got)) { // round the whole cycle: remember it
          if (kind) { (this.store.cycles[kind] ??= {})[button] = seen; this.save(); }
          break;
        }
        seen.push(got);
      }
    }

    const note = 'not available for this signal';
    if (opts.back && start && this.io.state().surround !== start) {
      const back = directCommand(start, native, kind);
      if (back) await this.press(back);
      else await this.run({ exact: start }, {}); // reachable by cycling, since it was playing
    }
    return { ok: false, mode: this.io.state().surround, note };
  }
}
