// Automation engine: "when <trigger> → script of if / wait / wait until / set blocks" (docs/AUTOMATION.md).
// No I/O except its own file; the receiver, clock and logging are injected so tests can run it on a fake clock.
// Every action goes through the injected `cmd`, which is index.ts's guarded sendCommand.

import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { PROPS, type Ctx, type PropDef, type AppAction } from './automation-catalog.ts';
import { OPS, argKind, compare, sameValue, type Value } from './automation-ops.ts';

// ---------- model ----------

export type Cond =
  | { type: 'cmp'; prop: string; param?: string; op: string; value?: unknown }
  | { type: 'channels'; of: 'input' | 'speakers'; present: string[]; absent: string[] }
  | { type: 'all' | 'any'; items: Cond[] }
  | { type: 'not'; item: Cond };

export type Trigger =
  | { type: 'change'; prop: string; param?: string; from?: Value; to?: Value; settleMs?: number }
  | { type: 'becomes'; cond: Cond; settleMs?: number };

export type Block =
  | { type: 'set'; prop: string; param?: string; value: Value; onlyLower?: boolean; confirmAmp?: boolean }
  | { type: 'if'; cond: Cond; then: Block[]; else: Block[] }
  | { type: 'wait'; ms: number }
  | { type: 'waitUntil'; cond: Cond; timeoutMs: number; onTimeout: 'continue' | 'stop' }
  | { type: 'findMode'; text: string; onNotFound: 'back' | 'stay' | 'stop' }
  | { type: 'stop' };

export type Automation = {
  id: string;
  name: string;
  enabled: boolean;
  when: Trigger[];
  script: Block[];
  disabled?: string; // why the server turned it off (loop protection); cleared when the user turns it on
};

export type StepResult = 'ok' | 'skipped' | 'error' | 'not-applied' | 'true' | 'false' | 'met' | 'timeout' | 'waited' | 'stop' | 'would-send' | 'not-found';
export type Step = { path: string; what: string; result: StepResult; note?: string; cmds?: string[] };
export type Run = {
  id: string; automation: string; name: string; trigger: string; depth: number;
  at: number; endedAt: number | null; status: 'running' | 'done' | 'stopped' | 'cancelled' | 'error';
  error?: string; steps: Step[];
};

export class AutomationError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

// ---------- limits ----------

export const LIMITS = {
  automations: 100, triggers: 8, blocks: 100, nesting: 8, condItems: 20, condNesting: 6, listItems: 40,
  waitMs: 10 * 60_000, settleMs: 60_000, name: 40,
  runsKept: 100, runsPerMinute: 10, chainDepth: 3, chainWindowMs: 3000, verifyMs: 2500, recheckMs: 1000,
  defaultSettleMs: 300,
};

// ---------- validation (never trust the client) ----------

const bad = (msg: string): never => { throw new AutomationError(400, msg); };
const isObj = (x: unknown): x is Record<string, any> => !!x && typeof x === 'object' && !Array.isArray(x);
const CODE = /^[A-Z][A-Z0-9]{0,3}$/;

function propOf(id: unknown): PropDef {
  const p = typeof id === 'string' ? PROPS[id] : undefined;
  return p ?? bad(`unknown property: ${String(id).slice(0, 40)}`);
}

function checkParam(def: PropDef, param: unknown): string | undefined {
  if (!def.param) {
    if (param !== undefined) bad(`${def.label} takes no channel or other parameter`);
    return undefined;
  }
  if (typeof param !== 'string' || !def.param.options().some((o) => o.value === param)) bad(`${def.label}: pick a ${def.param.label.toLowerCase()}`);
  return param as string;
}

/** One value of the property's type (for comparisons, trigger from / to, and actions). */
function checkValue(def: PropDef, v: unknown, forWrite: boolean): Value {
  const what = `${def.label}: `;
  switch (def.type) {
    case 'number': {
      if (typeof v !== 'number' || !Number.isFinite(v)) return bad(what + 'needs a number');
      if ((def.min !== undefined && v < def.min) || (def.max !== undefined && v > def.max)) bad(what + `must be ${def.min} to ${def.max}`);
      if (def.step && Math.abs(Math.round(v / def.step) * def.step - v) > 1e-9) bad(what + `must be in steps of ${def.step}`);
      return v;
    }
    case 'enum':
      // Presets and favorites change: they're checked by form here, and at run time against the live list.
      if (def.validValue ? !def.validValue(v) : typeof v !== 'string' || !def.options!().some((o) => o.value === v)) bad(what + 'not one of its choices');
      return v as string;
    case 'bool':
      if (typeof v !== 'boolean') bad(what + 'needs on or off');
      return v as boolean;
    case 'text':
      if (typeof v !== 'string' || v.length > 60) bad(what + 'needs text (up to 60 characters)');
      if (forWrite && !(def.validValue ? def.validValue(v) : def.writeChoices?.().some((o) => o.value === v))) bad(what + 'not one of its choices');
      return v as string;
    case 'set':
      if (typeof v !== 'string' || !CODE.test(v)) bad(what + 'needs a channel');
      return v as string;
  }
}

function checkCond(c: unknown, depth = 0): Cond {
  if (depth > LIMITS.condNesting) bad('conditions are nested too deep');
  if (!isObj(c)) return bad('bad condition');
  switch (c.type) {
    case 'cmp': {
      const def = propOf(c.prop);
      if (def.writeOnly) bad(`${def.label} can only be set, not tested`);
      const param = checkParam(def, c.param);
      if (typeof c.op !== 'string' || !OPS[def.type].includes(c.op)) bad(`${def.label}: bad comparison`);
      const kind = argKind(c.op);
      let value: unknown;
      if (kind === 'one') value = checkValue(def, c.value, false);
      else if (kind === 'pair') {
        if (!Array.isArray(c.value) || c.value.length !== 2) bad(`${def.label}: needs two values`);
        value = c.value.map((x: unknown) => checkValue(def, x, false));
      } else if (kind === 'list') {
        if (!Array.isArray(c.value) || !c.value.length || c.value.length > LIMITS.listItems) bad(`${def.label}: needs a list of values`);
        value = [...new Set(c.value.map((x: unknown) => checkValue(def, x, false)))];
      }
      return { type: 'cmp', prop: def.id, ...(param ? { param } : {}), op: c.op, ...(kind === 'none' ? {} : { value }) };
    }
    case 'channels': {
      if (c.of !== 'input' && c.of !== 'speakers') bad('channels: input or speakers');
      const list = (x: unknown) => {
        if (!Array.isArray(x) || x.length > 40 || !x.every((s) => typeof s === 'string' && CODE.test(s))) bad('channels: bad channel list');
        return [...new Set(x as string[])];
      };
      const present = list(c.present ?? []), absent = list(c.absent ?? []);
      if (!present.length && !absent.length) bad('channels: mark at least one channel');
      if (present.some((x) => absent.includes(x))) bad('channels: a channel can\'t be both present and absent');
      return { type: 'channels', of: c.of, present, absent };
    }
    case 'all':
    case 'any':
      if (!Array.isArray(c.items) || !c.items.length || c.items.length > LIMITS.condItems) bad(`${c.type === 'all' ? 'all of' : 'any of'}: needs 1 to ${LIMITS.condItems} conditions`);
      return { type: c.type, items: c.items.map((x: unknown) => checkCond(x, depth + 1)) };
    case 'not':
      return { type: 'not', item: checkCond(c.item, depth + 1) };
  }
  return bad('bad condition');
}

const ms = (v: unknown, max: number, what: string) => {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > max) bad(`${what}: 0 to ${max / 1000} s`);
  return v as number;
};

function checkTrigger(t: unknown): Trigger {
  if (!isObj(t)) return bad('bad trigger');
  const settle = t.settleMs === undefined ? {} : { settleMs: ms(t.settleMs, LIMITS.settleMs, 'settle time') };
  if (t.type === 'change') {
    const def = propOf(t.prop);
    if (def.writeOnly) bad(`${def.label} can only be set, not watched`);
    const param = checkParam(def, t.param);
    const out: Trigger = { type: 'change', prop: def.id, ...(param ? { param } : {}), ...settle };
    for (const k of ['from', 'to'] as const) {
      if (t[k] === undefined || t[k] === null) continue;
      if (def.type === 'set') bad(`${def.label}: use "becomes" with the channel picker to watch for channels`);
      out[k] = checkValue(def, t[k], false);
    }
    return out;
  }
  if (t.type === 'becomes') return { type: 'becomes', cond: checkCond(t.cond), ...settle };
  return bad('bad trigger');
}

function checkBlocks(list: unknown, depth: number, count: { n: number }): Block[] {
  if (!Array.isArray(list)) return bad('bad script');
  if (depth > LIMITS.nesting) bad('blocks are nested too deep');
  return list.map((b): Block => {
    if (++count.n > LIMITS.blocks) bad(`a rule can have up to ${LIMITS.blocks} blocks`);
    if (!isObj(b)) return bad('bad block');
    switch (b.type) {
      case 'set': {
        const def = propOf(b.prop);
        if (!def.write && !def.app) bad(`${def.label} can't be set`);
        const param = checkParam(def, b.param);
        const value = checkValue(def, b.value, true);
        if (b.onlyLower && !def.onlyLower) bad(`${def.label}: "only lower" is for volume`);
        if (b.confirmAmp && !def.confirmAmp) bad(`${def.label}: the Amp Assign confirmation is for speaker presets`);
        return { type: 'set', prop: def.id, ...(param ? { param } : {}), value, ...(b.onlyLower ? { onlyLower: true } : {}),
          ...(b.confirmAmp ? { confirmAmp: true } : {}) };
      }
      case 'if':
        return { type: 'if', cond: checkCond(b.cond), then: checkBlocks(b.then ?? [], depth + 1, count), else: checkBlocks(b.else ?? [], depth + 1, count) };
      case 'wait':
        return { type: 'wait', ms: ms(b.ms, LIMITS.waitMs, 'wait') };
      case 'waitUntil':
        if (b.onTimeout !== 'continue' && b.onTimeout !== 'stop') bad('wait until: continue or stop after the timeout');
        return { type: 'waitUntil', cond: checkCond(b.cond), timeoutMs: ms(b.timeoutMs, LIMITS.waitMs, 'wait until'), onTimeout: b.onTimeout };
      case 'findMode': {
        const text = typeof b.text === 'string' ? b.text.trim() : '';
        if (!/^[A-Za-z0-9 :+.\-/]{1,40}$/.test(text)) bad('find sound mode: 1 to 40 letters, digits or : + . - /');
        if (!['back', 'stay', 'stop'].includes(b.onNotFound)) bad('find sound mode: go back, stay or stop when not found');
        return { type: 'findMode', text, onNotFound: b.onNotFound };
      }
      case 'stop':
        return { type: 'stop' };
    }
    return bad('bad block');
  });
}

/** Validate and normalize an automation from the client or the file. Unknown fields are dropped. */
export function validate(a: unknown): Automation {
  if (!isObj(a)) return bad('bad automation');
  const name = typeof a.name === 'string' ? a.name.trim() : '';
  if (!name || name.length > LIMITS.name || !/^[^\x00-\x1f]+$/.test(name)) bad(`name: 1 to ${LIMITS.name} characters`);
  if (a.id !== undefined && (typeof a.id !== 'string' || !/^[a-z0-9]{8}$/.test(a.id))) bad('bad id');
  if (!Array.isArray(a.when) || !a.when.length || a.when.length > LIMITS.triggers) bad(`needs 1 to ${LIMITS.triggers} triggers`);
  const out: Automation = {
    id: a.id ?? '',
    name,
    enabled: a.enabled !== false,
    when: a.when.map(checkTrigger),
    script: checkBlocks(a.script, 0, { n: 0 }),
  };
  if (!out.script.length) bad('the script is empty');
  if (typeof a.disabled === 'string' && a.disabled) out.disabled = a.disabled.slice(0, 120);
  return out;
}

// ---------- evaluation ----------

const keyOf = (prop: string, param?: string) => (param ? `${prop}:${param}` : prop);

export function evalCond(c: Cond, ctx: Ctx): boolean {
  switch (c.type) {
    case 'cmp': {
      const def = PROPS[c.prop];
      return !!def && compare(def.type, def.read(ctx, c.param), c.op, c.value);
    }
    case 'channels': {
      const list = PROPS[c.of === 'input' ? 'input.channels' : 'speakers.channels'].read(ctx) as string[] | null;
      return !!list && c.present.every((x) => list.includes(x)) && c.absent.every((x) => !list.includes(x));
    }
    case 'all': return c.items.every((x) => evalCond(x, ctx));
    case 'any': return c.items.some((x) => evalCond(x, ctx));
    case 'not': return !evalCond(c.item, ctx);
  }
}

const show = (v: unknown) => (Array.isArray(v) ? v.join(' ') : String(v));
function describeTrigger(t: Trigger): string {
  if (t.type === 'becomes') return 'condition became true';
  const label = PROPS[t.prop]?.label ?? t.prop;
  const name = t.param ? `${label} ${t.param}` : label;
  return `${name} changed${t.from !== undefined ? ` from ${show(t.from)}` : ''}${t.to !== undefined ? ` to ${show(t.to)}` : ''}`;
}
const describeSet = (b: Extract<Block, { type: 'set' }>, ctx?: Ctx) => {
  const def = PROPS[b.prop];
  const v = (ctx && def?.options?.(ctx).find((o) => o.value === b.value)?.label) ?? show(b.value); // preset names, not ids
  return `set ${def?.label ?? b.prop}${b.param ? ` ${b.param}` : ''} to ${v}${b.onlyLower ? ' (only lower)' : ''}`;
};
const describeAction = (x: AppAction, ctx?: Ctx) =>
  x.kind === 'speakerPreset' ? `apply speaker preset "${ctx?.presets?.list.find((p) => p.id === x.id)?.name ?? x.id}"`
  : x.kind === 'soundMode' ? `select sound mode "${ctx?.soundModeChoices?.find((m) => m.value === x.mode)?.label ?? x.mode}"`
  : x.kind === 'heos' ? `HEOS ${x.action}`
  : `play HEOS favorite ${x.index}${ctx?.favorites?.[x.index - 1] ? ` (${ctx.favorites[x.index - 1].name})` : ''}`;

// ---------- engine ----------

export type Clock = {
  now: () => number;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (t: unknown) => void;
};
export type AutomationIo = {
  ctx: () => Ctx;
  cmd: (c: string, who: string) => { ok: boolean; cmd?: string; reason?: string };
  clock?: Clock;
  log?: (m: string) => void;
  changed?: () => void; // the summary changed (broadcast a snapshot)
  run?: (r: Run) => void; // a run started, progressed or ended
  /** Perform an app action (speaker preset, HEOS); resolves when it's done. */
  app?: (a: AppAction) => Promise<{ ok: boolean; note?: string }>;
  /** Select the first sound mode containing `text` (server/sound-modes.ts); with `back`, return if not found. */
  findMode?: (text: string, back: boolean) => Promise<{ ok: boolean; mode: string | null; note?: string }>;
};

const CANCEL = Symbol('cancelled');
type Live = Run & { cancelled: boolean; cancel: () => void; pending: Set<() => void> };

export class Automations {
  private file: string;
  private io: AutomationIo;
  private clock: Clock;
  private list: Automation[] = [];
  private values = new Map<string, Value>(); // last known (non-null) value per watched property
  private becomesPrev = new Map<string, boolean>();
  private armed = new Map<string, unknown>(); // settle timers per trigger
  private current: Live | null = null; // only one rule runs at a time
  private waiters = new Set<() => void>();
  private starts = new Map<string, number[]>(); // run start times, for the rate limit
  private recent: Run[] = [];
  private warmUntil = 0;
  private lastAction = { at: -Infinity, depth: 0 };

  constructor(dataDir: string, io: AutomationIo) {
    this.file = path.join(dataDir, 'automations.json');
    this.io = io;
    this.clock = io.clock ?? { now: Date.now, setTimeout: (f, m) => setTimeout(f, m), clearTimeout: (t) => clearTimeout(t as NodeJS.Timeout) };
  }

  private log(m: string) { this.io.log?.(`automation: ${m}`); }

  // ----- storage -----

  async load() {
    let raw: any;
    try { raw = JSON.parse(await fs.readFile(this.file, 'utf8')); } catch { return; }
    for (const a of Array.isArray(raw?.automations) ? raw.automations : []) {
      try {
        const v = validate(a);
        if (!v.id || this.list.some((x) => x.id === v.id)) v.id = newId();
        this.list.push(v);
      } catch (e) {
        this.log(`skipped an invalid rule in ${path.basename(this.file)}: ${(e as Error).message}`);
      }
    }
  }

  // Saves are queued: two at once (the loop protection turning a rule off while the user saves) would race on
  // the temp file. Each one writes the list as it is when its turn comes.
  private saving: Promise<void> = Promise.resolve();
  private persist(): Promise<void> {
    const write = async () => {
      await fs.mkdir(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      await fs.writeFile(tmp, JSON.stringify({ version: 1, automations: this.list }, null, 2));
      await fs.rename(tmp, this.file);
    };
    this.saving = this.saving.catch(() => {}).then(write);
    return this.saving;
  }

  // ----- API (REST) -----

  all(): Automation[] { return structuredClone(this.list); }
  get(id: string) { return this.list.find((a) => a.id === id); }
  runs(): Run[] { return this.recent.map(publicRun); }

  summary() {
    return this.list.map((a) => {
      const last = this.recent.findLast((r) => r.automation === a.id);
      return {
        id: a.id, name: a.name, enabled: a.enabled, disabled: a.disabled ?? null,
        running: this.current?.automation === a.id, lastRun: last ? { at: last.at, status: last.status, error: last.error ?? null } : null,
      };
    });
  }

  async save(input: unknown): Promise<Automation> {
    const a = validate(input);
    const i = a.id ? this.list.findIndex((x) => x.id === a.id) : -1;
    if (i < 0) {
      if (this.list.length >= LIMITS.automations) bad(`up to ${LIMITS.automations} rules`);
      a.id = newId();
      this.list.push(a);
    } else {
      if (a.enabled) delete a.disabled; // saving it turned on clears a loop-protection stop
      this.list[i] = a;
    }
    this.reset(a.id);
    await this.persist();
    this.io.changed?.();
    return structuredClone(a);
  }

  async remove(id: string) {
    const i = this.list.findIndex((a) => a.id === id);
    if (i < 0) throw new AutomationError(404, 'no such rule');
    if (this.current?.automation === id) this.current.cancel();
    this.list.splice(i, 1);
    this.reset(id);
    await this.persist();
    this.io.changed?.();
  }

  async setEnabled(id: string, on: boolean) {
    const a = this.get(id) ?? bad('no such rule');
    a.enabled = on;
    if (on) delete a.disabled;
    else if (this.current?.automation === id) this.current.cancel();
    this.reset(id);
    await this.persist();
    this.io.changed?.();
  }

  /** Run now, from the UI: ignores the trigger and on/off (still guarded, still rate-limited). */
  runNow(id: string): Run {
    const a = this.get(id) ?? bad('no such rule');
    if (this.current) throw new AutomationError(409, `Wait for "${this.current.name}" to finish`);
    return publicRun(this.start(a, 'run now', 0) ?? bad('could not start'));
  }

  /** Dry run against the current state: what would happen, sending nothing. Accepts an id or an unsaved rule. */
  test(input: unknown): Run {
    const a = typeof input === 'string' ? (this.get(input) ?? bad('no such rule')) : validate(input);
    const run: Run = { id: newId(), automation: a.id, name: a.name, trigger: 'test', depth: 0, at: this.clock.now(), endedAt: this.clock.now(), status: 'done', steps: [] };
    const ctx = this.io.ctx();
    const walk = (blocks: Block[], at: string): boolean => { // false = stopped
      for (let i = 0; i < blocks.length; i++) {
        const b = blocks[i], p = at ? `${at}.${i}` : String(i);
        if (b.type === 'set') {
          const why = this.skipReason(b, ctx);
          const def = PROPS[b.prop];
          const cmds = def.app ? [describeAction(def.app(b.value, b.param, b), ctx)] : def.write!(b.value, b.param);
          run.steps.push(why ? { path: p, what: describeSet(b, ctx), result: 'skipped', note: why }
            : { path: p, what: describeSet(b, ctx), result: 'would-send', cmds });
        } else if (b.type === 'if') {
          const ok = evalCond(b.cond, ctx);
          run.steps.push({ path: p, what: 'if', result: ok ? 'true' : 'false' });
          if (!walk(ok ? b.then : b.else, `${p}.${ok ? 'then' : 'else'}`)) return false;
        } else if (b.type === 'findMode') {
          const what = `find sound mode containing "${b.text}"`;
          const cur = String(ctx.state.surround ?? '');
          run.steps.push(ctx.state.zoneMain !== true ? { path: p, what, result: 'skipped', note: 'main zone is off' }
            : cur.toUpperCase().includes(b.text.toUpperCase()) ? { path: p, what, result: 'skipped', note: 'already set' }
            : { path: p, what, result: 'would-send', note: 'would search the modes the receiver offers' });
        } else if (b.type === 'wait') {
          run.steps.push({ path: p, what: `wait ${b.ms / 1000} s`, result: 'waited' });
        } else if (b.type === 'waitUntil') {
          const met = evalCond(b.cond, ctx);
          run.steps.push({ path: p, what: 'wait until', result: met ? 'met' : 'timeout', note: met ? undefined : `not true now; would wait up to ${b.timeoutMs / 1000} s` });
          if (!met && b.onTimeout === 'stop') { run.status = 'stopped'; return false; }
        } else {
          run.steps.push({ path: p, what: 'stop', result: 'stop' });
          run.status = 'stopped';
          return false;
        }
      }
      return true;
    };
    walk(a.script, '');
    return run;
  }

  /** Ignore changes for a while (the server starting, telnet reconnecting and re-reading everything). */
  warmup(ms: number) { this.warmUntil = Math.max(this.warmUntil, this.clock.now() + ms); }

  stop() {
    for (const t of this.armed.values()) this.clock.clearTimeout(t);
    this.armed.clear();
    this.current?.cancel();
  }

  // ----- change detection -----

  /** Call after every state change (index.ts calls it from the broadcast timer). */
  observe() {
    const ctx = this.io.ctx();
    const now = this.clock.now();
    // While a rule runs, nothing else starts: the changes it makes (e.g. stepping through sound modes) would
    // otherwise trigger other rules mid-way. The values are still read, so they become the new baseline.
    const quiet = now < this.warmUntil || !!this.current;
    // Changes shortly after one of our own actions were probably caused by it (chain depth, §6).
    const depth = now - this.lastAction.at <= LIMITS.chainWindowMs ? this.lastAction.depth + 1 : 0;

    const active = this.list.filter((a) => a.enabled && !a.disabled);
    const events = new Map<string, { from: Value; to: Value }>();
    const read = new Set<string>(); // each property is read once, even when several triggers watch it
    for (const a of active) {
      for (const t of a.when) {
        if (t.type !== 'change') continue;
        const k = keyOf(t.prop, t.param);
        if (read.has(k)) continue;
        read.add(k);
        const v = PROPS[t.prop].read(ctx, t.param);
        if (v === null || v === undefined) continue; // unknown: keep the last known value
        const prev = this.values.get(k);
        this.values.set(k, v);
        if (prev !== undefined && !sameValue(prev, v)) events.set(k, { from: prev, to: v });
      }
    }

    for (const a of active) {
      a.when.forEach((t, i) => {
        const tk = `${a.id}#${i}`;
        if (t.type === 'change') {
          const e = events.get(keyOf(t.prop, t.param));
          if (!e || quiet) return;
          if (t.from !== undefined && !sameValue(t.from, e.from)) return;
          if (t.to !== undefined && !sameValue(t.to, e.to)) return;
          this.arm(a, i, depth);
        } else {
          const b = evalCond(t.cond, ctx);
          const prev = this.becomesPrev.get(tk);
          this.becomesPrev.set(tk, b);
          if (!quiet && prev === false && b) this.arm(a, i, depth);
        }
      });
    }
    for (const w of [...this.waiters]) w();
  }

  /** Forget a rule's pending triggers, and take the current values as its new baseline (so a rule that is
   *  turned on or edited doesn't fire on changes that happened while it wasn't watching). */
  private reset(id: string) {
    for (const [k, t] of this.armed) if (k.startsWith(`${id}#`)) { this.clock.clearTimeout(t); this.armed.delete(k); }
    for (const k of this.becomesPrev.keys()) if (k.startsWith(`${id}#`)) this.becomesPrev.delete(k);
    const a = this.get(id);
    if (!a) return;
    const ctx = this.io.ctx();
    for (const t of a.when) {
      if (t.type !== 'change') continue;
      const v = PROPS[t.prop].read(ctx, t.param);
      if (v !== null && v !== undefined) this.values.set(keyOf(t.prop, t.param), v);
    }
  }

  /** Start (or restart) a trigger's settle time; when it ends and the trigger still holds, run. */
  private arm(a: Automation, i: number, depth: number) {
    const t = a.when[i];
    const tk = `${a.id}#${i}`;
    const settle = t.settleMs ?? (t.type === 'change' ? PROPS[t.prop].settleMs : settleOf(t.cond)) ?? LIMITS.defaultSettleMs;
    this.clock.clearTimeout(this.armed.get(tk));
    this.armed.set(tk, this.clock.setTimeout(() => {
      this.armed.delete(tk);
      const cur = this.get(a.id);
      if (!cur || !cur.enabled || cur.disabled || cur.when[i] !== t) return;
      if (this.current) return; // another rule started while this one was settling
      const ctx = this.io.ctx();
      if (t.type === 'change' && t.to !== undefined && !sameValue(PROPS[t.prop].read(ctx, t.param), t.to)) return; // changed again meanwhile
      if (t.type === 'becomes' && !evalCond(t.cond, ctx)) return;
      this.start(cur, describeTrigger(t), depth);
    }, settle));
  }

  // ----- runs -----

  private start(a: Automation, trigger: string, depth: number): Live | null {
    if (depth > LIMITS.chainDepth) {
      this.log(`"${a.name}" not run: started by a chain of ${depth} rules (limit ${LIMITS.chainDepth})`);
      return null;
    }
    if (this.current) return null; // one rule at a time
    // Rate limit: a rule that keeps firing is probably in a loop with another rule (or with the receiver).
    const now = this.clock.now();
    const starts = (this.starts.get(a.id) ?? []).filter((t) => now - t < 60_000);
    starts.push(now);
    this.starts.set(a.id, starts);
    if (starts.length > LIMITS.runsPerMinute) {
      a.disabled = `Ran more than ${LIMITS.runsPerMinute} times in a minute, so it was turned off. Check it for a loop.`;
      this.log(`"${a.name}" turned off: ran more than ${LIMITS.runsPerMinute} times in a minute`);
      this.reset(a.id);
      this.persist().catch((e) => this.log(`could not save: ${e.message}`));
      this.io.changed?.();
      return null;
    }

    const run: Live = {
      id: newId(), automation: a.id, name: a.name, trigger, depth, at: now, endedAt: null, status: 'running', steps: [],
      cancelled: false, pending: new Set(),
      cancel: () => { run.cancelled = true; for (const p of [...run.pending]) p(); },
    };
    this.current = run;
    this.recent.push(run);
    if (this.recent.length > LIMITS.runsKept) this.recent.splice(0, this.recent.length - LIMITS.runsKept);
    this.log(`"${a.name}" started (${trigger})`);
    this.emit(run);
    this.io.changed?.();
    this.exec(run, a);
    return run;
  }

  private async exec(run: Live, a: Automation) {
    try {
      run.status = (await this.seq(run, a, a.script, '')) ? 'done' : 'stopped';
    } catch (e) {
      if (e === CANCEL) run.status = 'cancelled';
      else { run.status = 'error'; run.error = (e as Error).message; this.log(`"${a.name}" failed: ${run.error}`); }
    } finally {
      run.endedAt = this.clock.now();
      if (this.current === run) this.current = null;
      this.emit(run);
      this.io.changed?.();
    }
  }

  /** Run a list of blocks. Returns false when a `stop` (or a wait until that stops) ended the run. */
  private async seq(run: Live, a: Automation, blocks: Block[], at: string): Promise<boolean> {
    for (let i = 0; i < blocks.length; i++) {
      if (run.cancelled) throw CANCEL;
      const b = blocks[i], p = at ? `${at}.${i}` : String(i);
      switch (b.type) {
        case 'set':
          await this.doSet(run, a, b, p);
          break;
        case 'if': {
          const ok = evalCond(b.cond, this.io.ctx());
          this.step(run, { path: p, what: 'if', result: ok ? 'true' : 'false' });
          if (!(await this.seq(run, a, ok ? b.then : b.else, `${p}.${ok ? 'then' : 'else'}`))) return false;
          break;
        }
        case 'wait':
          await this.sleep(run, b.ms);
          this.step(run, { path: p, what: `wait ${b.ms / 1000} s`, result: 'waited' });
          break;
        case 'waitUntil': {
          const met = await this.waitUntil(run, b.cond, b.timeoutMs);
          this.step(run, { path: p, what: 'wait until', result: met ? 'met' : 'timeout' });
          if (!met && b.onTimeout === 'stop') return false;
          break;
        }
        case 'findMode':
          if (!(await this.findMode(run, b, p))) return false;
          break;
        case 'stop':
          this.step(run, { path: p, what: 'stop', result: 'stop' });
          return false;
      }
    }
    return true;
  }

  /** Why a set-action would be skipped right now, or null to send it. */
  private skipReason(b: Extract<Block, { type: 'set' }>, ctx: Ctx): string | null {
    const def = PROPS[b.prop];
    if (def.needsZone && ctx.state.zoneMain !== true) return 'main zone is off';
    if (def.needsZone2 && ctx.state.zone2.power !== true) return 'zone 2 is off';
    if (def.needsInput && ctx.state.source !== def.needsInput) return `the input isn't ${def.needsInput === 'TUNER' ? 'Tuner' : def.needsInput}`;
    const cur = def.read(ctx, b.param);
    if (b.onlyLower && typeof cur === 'number' && cur <= (b.value as number)) return 'already at or below';
    if (!def.alwaysSend && cur !== null && (def.same ?? sameValue)(cur, b.value)) return 'already set';
    return null;
  }

  private async doSet(run: Live, a: Automation, b: Extract<Block, { type: 'set' }>, p: string) {
    const def = PROPS[b.prop];
    const what = describeSet(b, this.io.ctx());
    const why = this.skipReason(b, this.io.ctx());
    if (why) { this.step(run, { path: p, what, result: 'skipped', note: why }); return; }
    if (def.app) { // the app does it (speaker preset, HEOS): wait until it's done
      const action = def.app(b.value, b.param, b);
      if (!this.io.app) throw new Error(`${what}: not available`);
      const r = await this.io.app(action);
      if (run.cancelled) throw CANCEL;
      this.lastAction = { at: this.clock.now(), depth: run.depth };
      if (!r.ok) {
        this.step(run, { path: p, what, result: 'error', note: r.note });
        throw new Error(`${what}: ${r.note ?? 'failed'}`);
      }
      this.step(run, { path: p, what, result: 'ok', cmds: [describeAction(action, this.io.ctx())], ...(r.note ? { note: r.note } : {}) });
      return;
    }
    const sent: string[] = [];
    for (const c of def.write!(b.value, b.param)) {
      const r = this.io.cmd(c, `automation: ${a.name}`);
      if (!r.ok) {
        this.step(run, { path: p, what, result: 'error', note: r.reason, cmds: sent });
        throw new Error(`${what}: ${r.reason}`);
      }
      sent.push(r.cmd ?? c);
    }
    this.lastAction = { at: this.clock.now(), depth: run.depth };
    const clamped = sent.some((c, i) => c !== def.write!(b.value, b.param)[i]);
    const step: Step = { path: p, what, result: 'ok', cmds: sent, ...(clamped ? { note: 'limited by the volume cap' } : {}) };
    this.step(run, step);
    // The receiver silently ignores some settings in some states (e.g. LFE with PCM): check it took.
    if (!def.alwaysSend && !clamped) {
      this.clock.setTimeout(() => {
        const v = def.read(this.io.ctx(), b.param);
        if (v === null || !(def.same ?? sameValue)(v, b.value)) {
          step.result = 'not-applied';
          step.note = 'not applied by the receiver';
          this.log(`"${a.name}": ${what} was not applied by the receiver`);
          this.emit(run);
        }
      }, LIMITS.verifyMs);
    }
  }

  /** Returns false when the mode wasn't found and the block says to stop. */
  private async findMode(run: Live, b: Extract<Block, { type: 'findMode' }>, p: string): Promise<boolean> {
    const what = `find sound mode containing "${b.text}"`;
    if (this.io.ctx().state.zoneMain !== true) { this.step(run, { path: p, what, result: 'skipped', note: 'main zone is off' }); return true; }
    if (!this.io.findMode) throw new Error('sound mode search is not available');
    const r = await this.io.findMode(b.text, b.onNotFound === 'back');
    if (run.cancelled) throw CANCEL;
    if (r.ok) {
      const already = r.note === 'already set';
      if (!already) this.lastAction = { at: this.clock.now(), depth: run.depth };
      this.step(run, { path: p, what, result: already ? 'skipped' : 'ok', note: already ? 'already set' : r.mode ?? undefined });
      return true;
    }
    this.lastAction = { at: this.clock.now(), depth: run.depth };
    this.step(run, { path: p, what, result: 'not-found', note: r.note });
    return b.onNotFound !== 'stop';
  }

  private step(run: Live, s: Step) { run.steps.push(s); this.emit(run); }
  private emit(run: Run) { this.io.run?.(publicRun(run)); }

  private sleep(run: Live, ms: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const done = () => { run.pending.delete(cancel); };
      const t = this.clock.setTimeout(() => { done(); resolve(); }, ms);
      const cancel = () => { this.clock.clearTimeout(t); done(); reject(CANCEL); };
      run.pending.add(cancel);
    });
  }

  /** Resolve true as soon as the condition holds (checked on every change and every second), false at the timeout. */
  private waitUntil(run: Live, cond: Cond, timeoutMs: number): Promise<boolean> {
    if (evalCond(cond, this.io.ctx())) return Promise.resolve(true);
    return new Promise((resolve, reject) => {
      let recheck: unknown;
      const finish = () => {
        this.clock.clearTimeout(timeout); this.clock.clearTimeout(recheck);
        this.waiters.delete(check); run.pending.delete(cancel);
      };
      const check = () => { if (evalCond(cond, this.io.ctx())) { finish(); resolve(true); } };
      const tick = () => { check(); if (this.waiters.has(check)) recheck = this.clock.setTimeout(tick, LIMITS.recheckMs); };
      const timeout = this.clock.setTimeout(() => { finish(); resolve(evalCond(cond, this.io.ctx())); }, timeoutMs);
      const cancel = () => { finish(); reject(CANCEL); };
      this.waiters.add(check);
      run.pending.add(cancel);
      recheck = this.clock.setTimeout(tick, LIMITS.recheckMs);
    });
  }
}

// ---------- helpers ----------

function newId() { return randomUUID().replace(/-/g, '').slice(0, 8); }

function publicRun(r: Run): Run {
  const { id, automation, name, trigger, depth, at, endedAt, status, error, steps } = r;
  return { id, automation, name, trigger, depth, at, endedAt, status, ...(error ? { error } : {}), steps: steps.map((s) => ({ ...s })) };
}

/** Settle time for a "becomes" trigger: the longest of the properties its condition reads. */
function settleOf(c: Cond): number | undefined {
  switch (c.type) {
    case 'cmp': return PROPS[c.prop]?.settleMs;
    case 'channels': return PROPS[c.of === 'input' ? 'input.channels' : 'speakers.channels'].settleMs;
    case 'all': case 'any': {
      const s = c.items.map(settleOf).filter((x): x is number => x !== undefined);
      return s.length ? Math.max(...s) : undefined;
    }
    case 'not': return settleOf(c.item);
  }
}
