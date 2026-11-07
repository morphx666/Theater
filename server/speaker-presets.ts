// Speaker presets beyond the receiver's two built-in slots (design: docs/SPEAKER-PRESETS.md).
//
// The receiver keeps two Speaker Presets. Each holds Amp Assign, speaker config, distances, levels, crossovers,
// bass, Audyssey settings, Manual (Graphic) EQ and the MultEQ XT calibration (manual p.197). Everything except the
// calibration can be read and written through the setup API, so an app preset stores those values and is "based on"
// one slot, whose calibration it uses. Applying a preset switches to its slot and writes any values that differ.
//
// Like the native presets, the active preset auto-saves: after a write to one of its pages, the affected values are
// read back from the receiver into the preset.
//
// The engine is driven from server code (REST today; input / audio-format triggers later), never from the browser
// directly, so every write still goes through setup.ts validation and the telnet guard.

import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export type Slot = 1 | 2;
type Indexed = Record<string, number>;

/** Everything a preset stores. Every group is optional so that new groups can be added later without migrations. */
export type PresetValues = {
  ampAssign?: { mode: number };
  speakerConfig?: Indexed; // kind index -> value (1 None, 2 Small, 3 Large, 4 Yes, 5 No, ...)
  distances?: { unit: number; list: Indexed; dolby: Indexed }; // raw (cm for unit 1/2, 0.1 ms for unit 3)
  levels?: Indexed; // level index -> dB x 10
  crossovers?: { selection: number | null; all: number | null; list: Indexed }; // Hz
  bass?: { subwooferMode: number | null; lpf: number | null };
  frontSpeaker?: number | null; // 1 A, 2 B, 3 A+B (only used with Amp Assign = Front B)
  audyssey?: { multEq: number | null; dynamicEq: number | null; refLevelOffset: number | null; dynamicVolume: number | null };
  graphicEq?: { enable: number | null; selection: number | null; curves: Record<string, number[]> }; // dB x 10 per band
};
export type GroupKey = keyof PresetValues;

export type SpeakerPreset = {
  id: string; // stable: future automation rules refer to presets by id
  name: string;
  slot: Slot; // receiver slot whose Audyssey calibration this preset uses
  values: PresetValues | null; // null = not read from the receiver yet
  updatedAt: string | null;
};
export type PresetStore = {
  version: 1;
  presets: SpeakerPreset[];
  active: string | null; // preset whose values are on the receiver's current slot
  slotOwner: Record<'1' | '2', string | null>; // whose values were last written into each slot
  incomplete: string | null; // an apply failed part-way: the slot holds a mix, so don't auto-save until re-applied
};

// ---------------------------------------------------------------- XML helpers (the setup API's XML is flat and regular)

type Leaf = { value: number | null; display: string | null };

/** Remove every <tag ...>...</tag> block (used to skip nested lists that reuse element names). */
export const strip = (xml: string, tag: string) => xml.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?</${tag}>`, 'g'), '');
/** Inner XML of the first <tag>...</tag>, or ''. */
export const inner = (xml: string, tag: string) => xml.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`))?.[1] ?? '';
const attr = (attrs: string, name: string) => attrs.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] ?? null;

/** First numeric leaf <tag attrs>N</tag>. */
export function leaf(xml: string, tag: string): Leaf {
  const m = xml.match(new RegExp(`<${tag}\\b([^>]*)>\\s*(-?\\d+)\\s*</${tag}>`));
  return m ? { value: Number(m[2]), display: attr(m[1], 'display') } : { value: null, display: null };
}
/** <Speaker index="i" display="d">v</Speaker> entries. */
export function speakers(xml: string): Record<string, Leaf> {
  const out: Record<string, Leaf> = {};
  for (const m of xml.matchAll(/<Speaker\b([^>]*)>\s*(-?\d+)\s*<\/Speaker>/g)) {
    const i = attr(m[1], 'index');
    if (i !== null) out[i] = { value: Number(m[2]), display: attr(m[1], 'display') };
  }
  return out;
}
const values = (m: Record<string, Leaf>): Indexed => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v.value as number]));
const editable = (l: Leaf | undefined) => !!l && l.value !== null && (l.display ?? '3') === '3';
const items = (xml: string) => [...xml.matchAll(/<Item>\s*(-?\d+)\s*<\/Item>/g)].map((m) => Number(m[1]));

// ---------------------------------------------------------------- page parsers

export function parseAmp(xml: string) {
  return { type: leaf(xml, 'AmpType').value, mode: leaf(xml, 'AssignMode').value };
}
/** Assign Mode values the X1700H (AmpType 3) offers; matches the check in setup.ts validateWrite. */
export const AMP_MODES = [1, 2, 5, 6, 7, 8, 9, 10, 11];

export function parseConfig(xml: string): Record<string, { value: number; options: number[] }> {
  const out: Record<string, { value: number; options: number[] }> = {};
  for (const m of xml.matchAll(/<Speaker\b([^>]*)>([\s\S]*?)<\/Speaker>/g)) {
    const i = attr(m[1], 'index');
    const v = leaf(m[2], 'Value').value;
    if (i === null || v === null) continue;
    out[i] = { value: v, options: [...m[2].matchAll(/<List>\s*(\d+)\s*<\/List>/g)].map((x) => Number(x[1])) };
  }
  return out;
}
export function parseDistances(xml: string) {
  return { unit: leaf(xml, 'Unit').value, list: speakers(inner(xml, 'List')), dolby: speakers(inner(xml, 'DolbySpeakerSetup')) };
}
export const parseLevels = (xml: string) => speakers(inner(xml, 'List'));
export function parseCrossovers(xml: string) {
  const top = strip(xml, 'SelectableValue');
  return { selection: leaf(top, 'Selection'), all: leaf(top, 'All'), list: speakers(inner(top, 'List')), values: items(inner(xml, 'SelectableValue')) };
}
export function parseBass(xml: string) {
  const top = strip(xml, 'SelectableValue');
  return { subwooferMode: leaf(top, 'SubwooferMode'), lpf: leaf(top, 'LPFforLFE'), lpfValues: items(inner(xml, 'SelectableValue')) };
}
export const parseFrontSpeaker = (xml: string) => Number(xml.match(/<FrontSpeaker>\s*(\d)/)?.[1] ?? NaN) || null;
export function parseAudyssey(xml: string) {
  return {
    lrBypass: leaf(xml, 'LRBypass').value,
    multEq: leaf(xml, 'MultEQ'), dynamicEq: leaf(xml, 'DynamicEQ'),
    refLevelOffset: leaf(xml, 'ReferenceLevelOffset'), dynamicVolume: leaf(xml, 'DynamicVolume'),
  };
}
export const GEQ_BANDS = ['63Hz', '125Hz', '250Hz', '500Hz', '1kHz', '2kHz', '4kHz', '8kHz', '16kHz'];
export function parseGeq(xml: string) {
  const top = strip(xml, 'Headphone');
  const selection = leaf(top, 'SpeakerSelection');
  const digits = inner(xml, selection.value === 2 ? 'Each' : 'LR').trim();
  const adj = xml.match(/<AdjustEQ\b([^>]*)>([\s\S]*?)<\/AdjustEQ>/);
  return {
    headphones: leaf(inner(xml, 'Headphone'), 'Inserted').value === 1,
    enable: leaf(top, 'Enable'),
    selection,
    channels: [...digits].flatMap((d, i) => (d === '3' ? [String(i)] : [])), // codes for SpeakerSelection 2 / 3
    adjust: adj ? {
      display: attr(adj[1], 'display'),
      channel: leaf(adj[2], 'Channel').value,
      bands: GEQ_BANDS.map((b) => leaf(adj[2], `Eq${b}`).value ?? 0),
    } : null,
  };
}

// ---------------------------------------------------------------- payload builders (pure; only what differs)

const clampStep = (v: number, lo: number, hi: number, step: number) => Math.min(hi, Math.max(lo, Math.round(v / step) * step));

/** Speaker config writes, one per speaker kind (as the receiver's UI sends them). The subwoofer goes first when it is
 *  being added and last when removed, so that Small speakers always have somewhere to send their bass. */
export function configWrites(target: Indexed, cur: ReturnType<typeof parseConfig>): string[] {
  const idx = Object.keys(target).filter((i) => cur[i] && cur[i].value !== target[i] && cur[i].options.includes(target[i]));
  const sub = idx.filter((i) => i === '2');
  const rest = idx.filter((i) => i !== '2').sort((a, b) => Number(a) - Number(b));
  const order = sub.length && target['2'] === 4 ? [...sub, ...rest] : [...rest, ...sub];
  return order.map((i) => `<Speaker index="${i}">${target[i]}</Speaker>`);
}
export function levelsPayload(target: Indexed, cur: Record<string, Leaf>): string | null {
  const ch = Object.keys(target).filter((i) => editable(cur[i]) && cur[i].value !== clampStep(target[i], -120, 120, 5));
  return ch.length ? `<List>${ch.map((i) => `<Speaker index="${i}">${clampStep(target[i], -120, 120, 5)}</Speaker>`).join('')}</List>` : null;
}
export function distancesPayload(target: { list: Indexed; dolby: Indexed }, cur: ReturnType<typeof parseDistances>): string | null {
  const pick = (t: Indexed, c: Record<string, Leaf>) =>
    Object.keys(t).filter((i) => editable(c[i]) && c[i].value !== Math.min(1800, Math.max(0, Math.round(t[i]))))
      .map((i) => `<Speaker index="${i}">${Math.min(1800, Math.max(0, Math.round(t[i])))}</Speaker>`).join('');
  const main = pick(target.list, cur.list);
  const dol = pick(target.dolby, cur.dolby);
  if (!main && !dol) return null;
  return `<Distances>${main ? `<List>${main}</List>` : ''}${dol ? `<DolbySpeakerSetup>${dol}</DolbySpeakerSetup>` : ''}</Distances>`;
}
export function crossoverWrites(target: NonNullable<PresetValues['crossovers']>, cur: ReturnType<typeof parseCrossovers>): string[] {
  const ok = (hz: number) => cur.values.includes(hz);
  if (cur.selection.value === 1) {
    return target.all !== null && editable(cur.all) && cur.all.value !== target.all && ok(target.all) ? [`<All>${target.all}</All>`] : [];
  }
  return Object.keys(target.list).filter((i) => editable(cur.list[i]) && cur.list[i].value !== target.list[i] && ok(target.list[i]))
    .map((i) => `<Speaker index="${i}">${target.list[i]}</Speaker>`);
}
export function geqCurvePayload(code: string, bands: number[], dolby: boolean): string {
  const b = GEQ_BANDS.map((name, i) => `<Eq${name}>${dolby && i >= 5 ? 0 : clampStep(bands[i] ?? 0, -200, 60, 5)}</Eq${name}>`).join('');
  return `<GraphicEQ><AdjustEQ><Channel>${code}</Channel>${b}</AdjustEQ></GraphicEQ>`;
}
// Graphic EQ channel codes of the Dolby (up-firing) speakers, which only use the 63 Hz - 1 kHz bands (docs/SETUP-API.md).
const GEQ_DOLBY = { 3: ['12', '13', '14'], 2: ['22', '23', '25', '26', '27', '28'] } as Record<number, string[]>;

// Audyssey writes go over telnet: the setup API refuses them (HTTP 500) on this unit.
export const AUDYSSEY_CMDS = {
  multEq: { 1: 'PSMULTEQ:AUDYSSEY', 2: 'PSMULTEQ:BYP.LR', 3: 'PSMULTEQ:FLAT', 4: 'PSMULTEQ:OFF' },
  dynamicEq: { 1: 'PSDYNEQ ON', 2: 'PSDYNEQ OFF' },
  refLevelOffset: { 0: 'PSREFLEV 0', 5: 'PSREFLEV 5', 10: 'PSREFLEV 10', 15: 'PSREFLEV 15' },
  dynamicVolume: { 1: 'PSDYNVOL HEV', 2: 'PSDYNVOL MED', 3: 'PSDYNVOL LIT', 4: 'PSDYNVOL OFF' },
} as Record<string, Record<number, string>>;

/** "5.1.2"-style layout from installed level indices (codes from parse.ts LEVEL_INDEX_TO_CODE). */
export function layoutOf(codes: string[]): string | null {
  if (!codes.length) return null;
  const subs = codes.filter((c) => c.startsWith('SW')).length;
  const heights = codes.filter((c) => /^(FH|TF|TM|TR|FD|SD|BD|RH|SH|TS|CH)/.test(c)).length;
  return `${codes.length - subs - heights}.${subs}${heights ? '.' + heights : ''}`;
}

// ---------------------------------------------------------------- groups: how each part is read and applied

export type Io = {
  get(section: string, type: number, extra?: Record<string, string>): Promise<string>;
  set(section: string, type: number, xml: string): Promise<void>;
  cmd(c: string): void; // guarded telnet command
  wait(ms: number): Promise<void>;
  warn(msg: string): void;
};

type Group = {
  key: GroupKey;
  label: string;
  pages: string[]; // a write to one of these pages makes this group stale
  capture(io: Io): Promise<unknown>;
  apply(target: any, io: Io): Promise<void>;
};

const ALL_SPEAKER_PAGES = ['speakers/2', 'speakers/3'];

/** Apply order matters: Amp Assign and speaker config decide which channels the other pages have. */
export const GROUPS: Group[] = [
  {
    key: 'ampAssign', label: 'Amp Assign', pages: ['speakers/2'],
    async capture(io) { const a = parseAmp(await io.get('speakers', 2)); return a.mode === null ? undefined : { mode: a.mode }; },
    async apply(t: { mode: number }, io) {
      const a = parseAmp(await io.get('speakers', 2));
      if (a.mode === t.mode) return;
      if (a.type !== 3 || !AMP_MODES.includes(t.mode)) { io.warn('Amp Assign not changed (unsupported value)'); return; }
      await io.set('speakers', 2, `<AmpAssign><AssignMode>${t.mode}</AssignMode></AmpAssign>`);
      await io.wait(2000);
    },
  },
  {
    key: 'speakerConfig', label: 'Speaker config', pages: ALL_SPEAKER_PAGES,
    async capture(io) { const c = parseConfig(await io.get('speakers', 3)); return Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v.value])); },
    async apply(t: Indexed, io) {
      for (let pass = 0; pass < 2; pass++) { // a second pass catches changes the receiver refused until another one landed
        const writes = configWrites(t, parseConfig(await io.get('speakers', 3)));
        if (!writes.length) return;
        for (const w of writes) { await io.set('speakers', 3, w); await io.wait(500); }
      }
      if (configWrites(t, parseConfig(await io.get('speakers', 3))).length) io.warn('Some speaker config changes were refused');
    },
  },
  {
    key: 'bass', label: 'Bass', pages: [...ALL_SPEAKER_PAGES, 'speakers/7'],
    async capture(io) { const b = parseBass(await io.get('speakers', 7)); return { subwooferMode: b.subwooferMode.value, lpf: b.lpf.value }; },
    async apply(t: NonNullable<PresetValues['bass']>, io) {
      let b = parseBass(await io.get('speakers', 7));
      if (t.subwooferMode !== null && [1, 2].includes(t.subwooferMode) && editable(b.subwooferMode) && b.subwooferMode.value !== t.subwooferMode) {
        await io.set('speakers', 7, `<SubwooferMode>${t.subwooferMode}</SubwooferMode>`);
        await io.wait(700);
        b = parseBass(await io.get('speakers', 7));
      }
      if (t.lpf !== null && editable(b.lpf) && b.lpf.value !== t.lpf && b.lpfValues.includes(t.lpf)) await io.set('speakers', 7, `<LPFforLFE>${t.lpf}</LPFforLFE>`);
    },
  },
  {
    key: 'crossovers', label: 'Crossovers', pages: [...ALL_SPEAKER_PAGES, 'speakers/6', 'speakers/7'],
    async capture(io) {
      const x = parseCrossovers(await io.get('speakers', 6));
      return { selection: x.selection.value, all: x.all.value, list: values(x.list) };
    },
    async apply(t: NonNullable<PresetValues['crossovers']>, io) {
      let x = parseCrossovers(await io.get('speakers', 6));
      if (t.selection !== null && [1, 2].includes(t.selection) && editable(x.selection) && x.selection.value !== t.selection) {
        await io.set('speakers', 6, `<Selection>${t.selection}</Selection>`);
        await io.wait(1500);
        x = parseCrossovers(await io.get('speakers', 6));
      }
      for (const w of crossoverWrites(t, x)) await io.set('speakers', 6, w);
    },
  },
  {
    key: 'distances', label: 'Distances', pages: [...ALL_SPEAKER_PAGES, 'speakers/4'],
    async capture(io) {
      const d = parseDistances(await io.get('speakers', 4));
      return d.unit === null ? undefined : { unit: d.unit, list: values(d.list), dolby: values(d.dolby) };
    },
    async apply(t: NonNullable<PresetValues['distances']>, io) {
      let d = parseDistances(await io.get('speakers', 4));
      // Unit 1 (m) and 2 (ft) share the same raw centimetres; unit 3 (ms) is a different scale.
      if ((t.unit === 3) !== (d.unit === 3)) { io.warn('Distances not changed (different units)'); return; }
      if (t.unit !== d.unit && [1, 2].includes(t.unit)) {
        await io.set('speakers', 4, `<Unit>${t.unit}</Unit>`);
        await io.wait(700);
        d = parseDistances(await io.get('speakers', 4));
      }
      const xml = distancesPayload(t, d);
      if (xml) await io.set('speakers', 4, xml);
    },
  },
  {
    key: 'levels', label: 'Levels', pages: [...ALL_SPEAKER_PAGES, 'speakers/5'],
    async capture(io) { return values(parseLevels(await io.get('speakers', 5))); },
    async apply(t: Indexed, io) {
      const xml = levelsPayload(t, parseLevels(await io.get('speakers', 5)));
      if (xml) await io.set('speakers', 5, xml);
    },
  },
  {
    key: 'frontSpeaker', label: 'Front speaker', pages: ['speakers/2', 'speakers/8'],
    async capture(io) { return parseFrontSpeaker(await io.get('speakers', 8)); },
    async apply(t: number | null, io) {
      if (t === null || ![1, 2, 3].includes(t)) return;
      if (parseAmp(await io.get('speakers', 2)).mode !== 6) return; // only meaningful with Amp Assign = Front B
      if (parseFrontSpeaker(await io.get('speakers', 8)) !== t) await io.set('speakers', 8, `<FrontSpeaker>${t}</FrontSpeaker>`);
    },
  },
  {
    key: 'audyssey', label: 'Audyssey', pages: [...ALL_SPEAKER_PAGES, 'audio/9'],
    async capture(io) {
      const a = parseAudyssey(await io.get('audio', 9));
      return { multEq: a.multEq.value, dynamicEq: a.dynamicEq.value, refLevelOffset: a.refLevelOffset.value, dynamicVolume: a.dynamicVolume.value };
    },
    async apply(t: NonNullable<PresetValues['audyssey']>, io) {
      // One at a time and re-read: Dynamic EQ needs MultEQ on, Reference Level Offset needs Dynamic EQ on.
      for (const k of ['multEq', 'dynamicEq', 'refLevelOffset', 'dynamicVolume'] as const) {
        const a = parseAudyssey(await io.get('audio', 9));
        const want = t[k];
        if (want === null || !editable(a[k]) || a[k].value === want) continue;
        if (k === 'multEq' && want === 2 && a.lrBypass !== 2) continue;
        const cmd = AUDYSSEY_CMDS[k][want];
        if (!cmd) continue;
        io.cmd(cmd);
        await io.wait(1200);
      }
    },
  },
  {
    key: 'graphicEq', label: 'Graphic EQ', pages: [...ALL_SPEAKER_PAGES, 'audio/10'],
    async capture(io) {
      const g = parseGeq(await io.get('audio', 10));
      const curves: Record<string, number[]> = {};
      const codes = g.selection.value === 1 ? (g.adjust?.channel != null ? [String(g.adjust.channel)] : []) : g.channels;
      let last = g.adjust?.channel != null ? String(g.adjust.channel) : null;
      for (const c of codes) {
        const a = parseGeq(await io.get('audio', 10, { opt1: c, opt2: '0' })).adjust;
        if (a) curves[c] = a.bands;
        last = c;
      }
      // Reading a channel also selects it on the receiver: put back the one that was showing.
      if (g.adjust?.channel != null && last !== String(g.adjust.channel)) await io.get('audio', 10, { opt1: String(g.adjust.channel), opt2: '0' });
      return { enable: g.enable.value, selection: g.selection.value, curves };
    },
    async apply(t: NonNullable<PresetValues['graphicEq']>, io) {
      let g = parseGeq(await io.get('audio', 10));
      if (t.enable !== null && [1, 2].includes(t.enable) && g.enable.value !== t.enable) {
        if (g.headphones) io.warn('Graphic EQ on/off not changed (headphones plugged in)');
        else { await io.set('audio', 10, `<GraphicEQ><Enable>${t.enable}</Enable></GraphicEQ>`); await io.wait(1000); }
      }
      if (t.selection !== null && [1, 2, 3].includes(t.selection) && editable(g.selection) && g.selection.value !== t.selection) {
        await io.set('audio', 10, `<GraphicEQ><SpeakerSelection>${t.selection}</SpeakerSelection></GraphicEQ>`);
        await io.wait(1500);
        g = parseGeq(await io.get('audio', 10));
      }
      const sel = g.selection.value ?? 0;
      const shown = g.adjust?.channel != null ? String(g.adjust.channel) : null;
      const codes = Object.keys(t.curves).filter((c) => (sel === 1 ? c === shown : g.channels.includes(c)));
      for (const c of codes) {
        const a = parseGeq(await io.get('audio', 10, { opt1: c, opt2: '0' })).adjust;
        if (!a || (a.display ?? '3') !== '3') continue;
        const dolby = (GEQ_DOLBY[sel] ?? []).includes(c);
        const want = GEQ_BANDS.map((_, i) => (dolby && i >= 5 ? 0 : clampStep(t.curves[c][i] ?? 0, -200, 60, 5)));
        if (want.some((v, i) => !(dolby && i >= 5) && v !== a.bands[i])) { await io.set('audio', 10, geqCurvePayload(c, want, dolby)); await io.wait(800); }
      }
      if (shown !== null && codes.length && codes.at(-1) !== shown) await io.get('audio', 10, { opt1: shown, opt2: '0' });
    },
  },
];

/** Which groups go stale after a write to `section/type`. */
export function groupsForPage(page: string): GroupKey[] {
  return GROUPS.filter((g) => g.pages.includes(page)).map((g) => g.key);
}

// ---------------------------------------------------------------- store validation

export const validPresetName = (s: unknown): s is string =>
  typeof s === 'string' && s.trim().length >= 1 && s.trim().length <= 24 && !/[\x00-\x1f\x7f]/.test(s);
export const MAX_PRESETS = 40;

export function emptyStore(): PresetStore {
  return { version: 1, presets: [], active: null, slotOwner: { 1: null, 2: null }, incomplete: null };
}

/** Load and sanity-check a stored file (it is only ever written by this module, but may be hand-edited). */
export function normalizeStore(raw: any): PresetStore {
  const s = emptyStore();
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.presets)) return s;
  for (const p of raw.presets.slice(0, MAX_PRESETS)) {
    if (!p || typeof p.id !== 'string' || !/^[\w-]{1,64}$/.test(p.id) || !validPresetName(p.name) || ![1, 2].includes(p.slot)) continue;
    if (s.presets.some((q) => q.id === p.id)) continue;
    s.presets.push({ id: p.id, name: p.name.trim(), slot: p.slot, values: p.values && typeof p.values === 'object' ? p.values : null, updatedAt: p.updatedAt ?? null });
  }
  const known = (id: unknown) => (typeof id === 'string' && s.presets.some((p) => p.id === id) ? id : null);
  s.active = known(raw.active);
  s.slotOwner = { 1: known(raw.slotOwner?.['1']), 2: known(raw.slotOwner?.['2']) };
  s.incomplete = known(raw.incomplete);
  return s;
}

// ---------------------------------------------------------------- engine

export class PresetError extends Error {
  status: number;
  confirm?: { kind: 'amp'; from: number | null; to: number };
  constructor(status: number, msg: string, confirm?: PresetError['confirm']) {
    super(msg);
    this.status = status;
    this.confirm = confirm;
  }
}

export type EngineDeps = {
  io: Omit<Io, 'warn'>;
  zoneOn(): boolean;
  muted(): boolean | null;
  log(msg: string): void;
  changed(): void; // summary changed: broadcast
  applied(): void; // receiver values changed: re-query telnet, re-read installed speakers
  levelCodes(levels: Indexed): string[];
};

export class SpeakerPresets {
  private file: string;
  store: PresetStore = emptyStore();
  supported: boolean | null = null; // null until the receiver has been asked
  busy: { id: string; step: string } | null = null;
  rev = 0; // bumped after every apply, so open setup pages know to re-read
  private stale = new Set<GroupKey>();
  private staleTimer: NodeJS.Timeout | undefined;
  private syncTimer: NodeJS.Timeout | undefined;
  private deps: EngineDeps;

  constructor(dataDir: string, deps: EngineDeps) {
    this.file = path.join(dataDir, 'speaker-presets.json');
    this.deps = deps;
  }

  async load() {
    try { this.store = normalizeStore(JSON.parse(await fs.readFile(this.file, 'utf8'))); } catch { this.store = emptyStore(); }
  }
  private async save() {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    await fs.writeFile(tmp, JSON.stringify(this.store, null, 2));
    await fs.rename(tmp, this.file);
  }

  summary() {
    return {
      supported: this.supported,
      list: this.store.presets.map((p) => ({
        id: p.id, name: p.name, slot: p.slot, captured: !!p.values, updatedAt: p.updatedAt,
        layout: p.values?.levels ? layoutOf(this.deps.levelCodes(p.values.levels)) : null,
      })),
      active: this.store.active,
      incomplete: this.store.incomplete,
      busy: this.busy,
      rev: this.rev,
    };
  }

  private find(id: unknown): SpeakerPreset {
    const p = this.store.presets.find((x) => x.id === id);
    if (!p) throw new PresetError(404, 'No such preset');
    return p;
  }
  private io(): Io {
    return { ...this.deps.io, warn: (m) => this.warnings.push(m) };
  }
  private warnings: string[] = [];

  private async readSlot(): Promise<0 | Slot> {
    const n = Number((await this.deps.io.get('globals', 10)).match(/<SpeakerPreset>\s*(\d)/)?.[1] ?? NaN);
    if (n !== 0 && n !== 1 && n !== 2) throw new PresetError(502, 'Could not read the active speaker preset');
    return n as 0 | Slot;
  }

  /** Read groups (default: all) from the receiver into a preset. */
  private async capture(p: SpeakerPreset, keys: GroupKey[] = GROUPS.map((g) => g.key)) {
    const io = this.io();
    const vals: PresetValues = { ...(p.values ?? {}) };
    for (const g of GROUPS) {
      if (!keys.includes(g.key)) continue;
      const v = await g.capture(io);
      if (v !== undefined) (vals as any)[g.key] = v;
    }
    p.values = vals;
    p.updatedAt = new Date().toISOString();
  }

  /**
   * Line the store up with the receiver: create entries for the two native presets on first run, mark the
   * preset on the current slot active, and read it in (picks up changes made on the receiver itself).
   */
  async sync() {
    if (this.busy) return;
    try {
      const slot = await this.readSlot();
      this.supported = slot !== 0;
      if (!this.supported) { this.deps.changed(); return; }
      if (!this.store.presets.length) {
        for (const n of [1, 2] as Slot[]) {
          const p: SpeakerPreset = { id: randomUUID(), name: `Preset ${n}`, slot: n, values: null, updatedAt: null };
          this.store.presets.push(p);
          this.store.slotOwner[n] = p.id;
        }
        this.deps.log('speaker presets: created entries for the receiver\'s Preset 1 and Preset 2');
      }
      const owner = this.store.slotOwner[slot];
      this.store.active = owner;
      const p = owner ? this.store.presets.find((x) => x.id === owner) : null;
      if (p && this.store.incomplete !== p.id) await this.capture(p);
      await this.save();
    } catch (e) {
      this.deps.log(`speaker presets: sync failed: ${(e as Error).message}`);
    }
    this.deps.changed();
  }
  /** The receiver switched slot by itself (remote, front panel, console): follow it after it settles. */
  slotChanged() {
    if (this.busy) return;
    clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => this.sync(), 4000);
  }

  /** Auto-save: a setup page of the active preset was written (from this app) or a telnet value changed. */
  noteWrite(section: string, type: number) {
    if (section === 'speakers' && type === 11) return this.slotChanged();
    const keys = groupsForPage(`${section}/${type}`);
    if (!keys.length) return;
    for (const k of keys) this.stale.add(k);
    clearTimeout(this.staleTimer);
    this.staleTimer = setTimeout(() => this.flushStale(), 2500);
  }
  private async flushStale() {
    if (this.busy) { this.staleTimer = setTimeout(() => this.flushStale(), 2500); return; }
    const keys = [...this.stale];
    this.stale.clear();
    const p = this.store.presets.find((x) => x.id === this.store.active);
    if (!p || !keys.length || this.store.incomplete === p.id) return;
    try {
      if ((await this.readSlot()) !== p.slot) return; // the receiver moved on; sync() will sort it out
      await this.capture(p, keys);
      await this.save();
      this.deps.changed();
    } catch (e) {
      this.deps.log(`speaker presets: auto-save failed: ${(e as Error).message}`);
    }
  }

  // ---------- manager actions ----------

  async create(name: unknown, fromId: unknown, slot: unknown): Promise<SpeakerPreset> {
    if (this.busy) throw new PresetError(409, 'Busy applying a preset');
    if (!validPresetName(name)) throw new PresetError(400, 'Name: 1-24 characters');
    if (this.store.presets.length >= MAX_PRESETS) throw new PresetError(400, `Up to ${MAX_PRESETS} presets`);
    this.checkUnique(name);
    const src = fromId ? this.find(fromId) : this.store.presets.find((x) => x.id === this.store.active) ?? null;
    const live = await this.readSlot().catch(() => null);
    const p: SpeakerPreset = { id: randomUUID(), name: name.trim(), slot: 1, values: null, updatedAt: new Date().toISOString() };
    if (src) {
      // copying the active preset: take what is on the receiver right now, not what was last saved
      if (src.id === this.store.active && live === src.slot && this.store.incomplete !== src.id) await this.capture(src);
      if (!src.values) throw new PresetError(409, `${src.name} hasn't been read yet. Switch to it once first.`);
      p.values = structuredClone(src.values);
      p.slot = slot === 1 || slot === 2 ? slot : src.slot;
    } else {
      // No active preset (its entry was deleted): save what is on the receiver now; it becomes the active preset.
      if (live !== 1 && live !== 2) throw new PresetError(502, 'Could not read the receiver');
      p.slot = live;
      await this.capture(p);
      this.store.slotOwner[live] = p.id;
      this.store.active = p.id;
    }
    this.store.presets.push(p);
    await this.save();
    this.deps.log(`speaker preset "${p.name}" created from ${src ? `"${src.name}"` : 'the receiver'}`);
    this.deps.changed();
    return p;
  }
  private checkUnique(name: string, except?: string) {
    if (this.store.presets.some((p) => p.id !== except && p.name.toLowerCase() === name.trim().toLowerCase())) {
      throw new PresetError(400, 'A preset with that name exists');
    }
  }
  async rename(id: unknown, name: unknown) {
    const p = this.find(id);
    if (!validPresetName(name)) throw new PresetError(400, 'Name: 1-24 characters');
    this.checkUnique(name, p.id);
    p.name = name.trim();
    await this.save();
    this.deps.changed();
  }
  async setSlot(id: unknown, slot: unknown) {
    if (this.busy) throw new PresetError(409, 'Busy applying a preset');
    const p = this.find(id);
    if (slot !== 1 && slot !== 2) throw new PresetError(400, 'slot must be 1 or 2');
    if (p.slot === slot) return;
    if (p.id === this.store.active) throw new PresetError(409, 'Switch to another preset first');
    if (!p.values) throw new PresetError(409, `${p.name} hasn't been read yet. Switch to it once first.`);
    if (this.store.slotOwner[p.slot] === p.id) this.store.slotOwner[p.slot] = null; // its values stay there, but unowned
    p.slot = slot;
    await this.save();
    this.deps.changed();
  }
  async remove(id: unknown) {
    if (this.busy) throw new PresetError(409, 'Busy applying a preset');
    const p = this.find(id);
    if (p.id === this.store.active) throw new PresetError(409, 'Switch to another preset first');
    if (this.store.presets.length <= 1) throw new PresetError(409, 'Keep at least one preset');
    if (this.store.slotOwner[p.slot] === p.id) {
      // Its values are still in that slot. Without an owner the next preset on this slot is written in full.
      this.store.slotOwner[p.slot] = null;
    }
    if (this.store.incomplete === p.id) this.store.incomplete = null;
    this.store.presets = this.store.presets.filter((x) => x.id !== p.id);
    await this.save();
    this.deps.log(`speaker preset "${p.name}" deleted`);
    this.deps.changed();
  }

  // ---------- apply ----------

  /**
   * Make `id` the active preset. If its values are already in its slot (it owns the slot), this is just a native
   * slot switch. Otherwise its values are written into the slot, muted. `confirmAmp` must be set when the preset
   * changes Amp Assign (re-routes the amplifiers; the UI shows the wiring warning first).
   */
  async apply(id: unknown, { confirmAmp = false } = {}): Promise<{ warnings: string[] }> {
    if (this.busy) throw new PresetError(409, 'Busy applying a preset');
    if (!this.deps.zoneOn()) throw new PresetError(409, 'Turn the receiver on first');
    const target = this.find(id);
    this.busy = { id: target.id, step: 'Starting' };
    this.warnings = [];
    this.deps.changed();
    let mutedByUs = false;
    const step = (s: string) => { this.busy = { id: target.id, step: s }; this.deps.changed(); };
    try {
      let slot = await this.readSlot();
      if (slot === 0) { this.supported = false; throw new PresetError(409, 'This receiver has no speaker presets'); }
      const owns = this.store.slotOwner[target.slot] === target.id && this.store.incomplete !== target.id;
      const needWrites = !owns && !!target.values;

      // Even a plain slot switch can change Amp Assign (it is stored per slot), so check whenever it is known.
      if (target.values?.ampAssign && !confirmAmp) {
        const cur = parseAmp(await this.deps.io.get('speakers', 2)).mode;
        if (cur !== target.values.ampAssign.mode) {
          throw new PresetError(409, 'This preset changes Amp Assign', { kind: 'amp', from: cur, to: target.values.ampAssign.mode });
        }
      }

      // Auto-save the outgoing preset (picks up anything changed on the receiver itself).
      const out = this.store.presets.find((x) => x.id === this.store.active);
      if (out && slot === out.slot && this.store.incomplete !== out.id) {
        if (out.id === target.id) return { warnings: [] }; // already active
        step(`Saving ${out.name}`);
        await this.capture(out);
      }

      if (needWrites && this.deps.muted() === false) { this.deps.io.cmd('MUON'); mutedByUs = true; }

      if (slot !== target.slot) {
        step(`Switching to slot ${target.slot}`);
        await this.deps.io.set('speakers', 11, `<SpeakerPreset>${target.slot}</SpeakerPreset>`);
        await this.deps.io.wait(5000); // the receiver's own UI waits this long before re-reading
        slot = await this.readSlot();
        if (slot !== target.slot) throw new PresetError(502, 'The receiver did not switch preset slot');
      }

      // The slot's current owner was never read (a native preset on first use): keep its values before overwriting.
      const ownerId = this.store.slotOwner[target.slot];
      const owner = ownerId && ownerId !== target.id ? this.store.presets.find((x) => x.id === ownerId) : null;
      if (owner && !owner.values && needWrites) { step(`Saving ${owner.name}`); await this.capture(owner); }

      this.store.active = target.id;
      if (!target.values) {
        step('Reading'); // never read: whatever is in the slot is this preset
        await this.capture(target);
        this.store.slotOwner[target.slot] = target.id;
      } else if (needWrites) {
        this.store.slotOwner[target.slot] = target.id;
        this.store.incomplete = target.id;
        await this.save();
        const io = this.io();
        for (const g of GROUPS) {
          const t = (target.values as any)[g.key];
          if (t === undefined) continue;
          step(g.label);
          await g.apply(t, io);
        }
        this.store.incomplete = null;
      }
      this.deps.log(`speaker preset "${target.name}" applied (slot ${target.slot}${needWrites ? ', values written' : ''})`
        + (this.warnings.length ? `; ${this.warnings.join('; ')}` : ''));
      return { warnings: [...this.warnings] };
    } finally {
      if (mutedByUs) this.deps.io.cmd('MUOFF');
      this.busy = null;
      this.rev++;
      this.stale.clear(); // our own writes, not user edits
      await this.save().catch((e) => this.deps.log(`speaker presets: save failed: ${e.message}`));
      this.deps.applied();
      this.deps.changed();
    }
  }
}
