import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { applyLine, emptyState, type AvrState } from './parse.ts';
import { guard } from './guard.ts';
import { compare, sameValue, OPS } from './automation-ops.ts';
import { CATALOG, PROPS, layoutOf, fromFormat, describeCatalog, type Ctx } from './automation-catalog.ts';
import { Automations, validate, evalCond, LIMITS, type Run } from './automation.ts';
import type { AudioMap, Grid } from './audio-map.ts';

// ---------- helpers ----------

/** A grid from channel codes; `on` lists the active ones (others are present but not active). */
function grid(all: string[], on: string[] = all): Grid {
  const rows: Grid = [];
  all.forEach((ch, i) => {
    const r = Math.floor(i / 5);
    rows[r] ??= [null, null, null, null, null];
    rows[r][i % 5] = { ch, on: on.includes(ch) };
  });
  return rows;
}
const map = (input: string[], output: string[] = input): AudioMap => ({ input: grid(input), output: grid(output) });

function fakeClock() {
  let t = 1_000_000, seq = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const flush = () => new Promise((r) => setImmediate(r));
  return {
    now: () => t,
    setTimeout: (fn: () => void, ms: number) => { timers.set(++seq, { at: t + Math.max(0, ms), fn }); return seq; },
    clearTimeout: (id: unknown) => { timers.delete(id as number); },
    async tick(ms: number) {
      const end = t + ms;
      for (;;) {
        await flush();
        let next: [number, { at: number; fn: () => void }] | null = null;
        for (const e of timers) if (e[1].at <= end && (!next || e[1].at < next[1].at)) next = e;
        if (!next) break;
        timers.delete(next[0]);
        t = next[1].at;
        next[1].fn();
      }
      t = end;
      await flush();
    },
  };
}

/** A receiver that applies every accepted command to its state (like the telnet echo), plus the engine. */
async function rig(opts: { cap?: number; echo?: (cmd: string) => boolean } = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'automation-'));
  const state: AvrState = emptyState();
  const ctx: Ctx = { state, audioMap: null };
  const clock = fakeClock();
  const sent: string[] = [];
  const logs: string[] = [];
  const runs = new Map<string, Run>();
  let eng!: Automations;
  const observeSoon = () => clock.setTimeout(() => eng.observe(), 40); // like scheduleBroadcast
  const io = {
    ctx: () => ctx,
    cmd: (c: string) => {
      const r = guard(c, state, opts.cap ?? 0);
      if (!r.ok) return r;
      sent.push(r.cmd);
      if (opts.echo?.(r.cmd) ?? true) { if (applyLine(state, r.cmd)) observeSoon(); }
      return r;
    },
    clock, log: (m: string) => logs.push(m), run: (r: Run) => runs.set(r.id, r),
  };
  eng = new Automations(dir, io);
  /** The receiver reports something (from its remote, a new signal…). */
  const line = (...ls: string[]) => { let ch = false; for (const l of ls) ch = applyLine(state, l) || ch; if (ch) observeSoon(); };
  const setMap = (m: AudioMap) => { ctx.audioMap = m; observeSoon(); };
  return { dir, state, ctx, clock, sent, logs, runs, eng, io, line, setMap, last: () => [...runs.values()].at(-1) };
}

/** A powered-on receiver with a few known values. */
function on(r: Awaited<ReturnType<typeof rig>>) {
  for (const l of ['PWON', 'ZMON', 'MV40', 'MUOFF', 'SIBD', 'MSDOLBY AUDIO-DSUR', 'PSDEH OFF', 'PSCINEMA EQ.OFF', 'PSDYNVOL OFF', 'PSLOM OFF', 'PSNEURAL OFF', 'PSLFE 00']) applyLine(r.state, l);
}

const rule = (when: unknown[], script: unknown[], extra: Record<string, unknown> = {}) => ({ name: 'Test rule', when, script, ...extra });

// ---------- operators ----------

test('operators', () => {
  assert.equal(compare('number', -20, 'ge', -20), true);
  assert.equal(compare('number', -20.5, 'ge', -20), false);
  assert.equal(compare('number', -30, 'between', [-20, -40]), true);
  assert.equal(compare('number', null, 'lt', 0), false); // unknown is false…
  assert.equal(compare('number', null, 'unknown'), true); // …except for "unknown"
  assert.equal(compare('number', 0, 'known'), true);
  assert.equal(compare('enum', 'OFF', 'isNot', 'OFF'), false);
  assert.equal(compare('enum', 'MED', 'in', ['LOW', 'MED']), true);
  assert.equal(compare('enum', 'MED', 'notIn', ['LOW', 'MED']), false);
  assert.equal(compare('bool', false, 'isOff'), true);
  assert.equal(compare('bool', null, 'isOff'), false);
  assert.equal(compare('text', 'DOLBY AUDIO-DSUR', 'contains', 'dolby'), true);
  assert.equal(compare('text', 'PCM', 'startsWith', 'dts'), false);
  assert.equal(compare('set', ['FL', 'FR', 'C'], 'hasAll', ['C', 'FL']), true);
  assert.equal(compare('set', ['FL', 'FR'], 'hasAny', ['C', 'LFE']), false);
  assert.equal(compare('set', [], 'empty'), true);
  assert.equal(sameValue(['C', 'FL'], ['FL', 'C']), true);
  assert.equal(sameValue(-20, -20.0000001), true);
  for (const t of Object.keys(OPS) as (keyof typeof OPS)[]) assert.ok(OPS[t].includes('unknown'), t);
});

// ---------- catalog ----------

test('catalog reads the state in human units', () => {
  const st = emptyState();
  for (const l of ['ZMON', 'MV375', 'SIGAME', 'PSSWL 44', 'PSLFE 05', 'PSBAS 47', 'PSDELAY 120', 'PSDEH MED', 'PSDYNEQ ON', 'CVC 535']) applyLine(st, l);
  const c: Ctx = { state: st, audioMap: null };
  const r = (id: string, p?: string) => PROPS[id].read(c, p);
  assert.equal(r('volume'), -42.5);
  assert.equal(r('input'), 'GAME');
  assert.equal(r('ps.SWL'), -6);
  assert.equal(r('ps.LFE'), -5);
  assert.equal(r('ps.BAS'), -3);
  assert.equal(r('ps.DELAY'), 120);
  assert.equal(r('ps.DEH'), 'MED');
  assert.equal(r('ps.DYNEQ'), true);
  assert.equal(r('ps.CES'), null); // never reported: unknown
  assert.equal(r('channel.level', 'C'), 3.5);
  assert.equal(r('mute'), null);
});

test('input channels: count, layout and each channel, from the grid or the format', () => {
  assert.equal(layoutOf(['FL', 'FR']), '2.0');
  assert.equal(layoutOf(['FL', 'FR', 'LFE']), '2.1');
  assert.equal(layoutOf(['FL', 'FR', 'C', 'LFE', 'SL', 'SR']), '5.1');
  assert.equal(layoutOf(['FL', 'FR', 'C', 'LFE', 'SL', 'SR', 'TFL', 'TFR', 'TRL', 'TRR']), '5.1.4');
  assert.deepEqual(fromFormat('3/2/.1'), { count: 6, layout: '5.1' });
  assert.deepEqual(fromFormat('2/0'), { count: 2, layout: '2.0' });

  const st = emptyState();
  const c: Ctx = { state: st, audioMap: null };
  const r = (id: string, p?: string) => PROPS[id].read(c, p);
  assert.equal(r('input.count'), null);
  applyLine(st, 'SSINFAISFOR 3/2/.1'); // before the grid arrives: count and layout only
  assert.equal(r('input.count'), 6);
  assert.equal(r('input.layout'), '5.1');
  assert.equal(r('input.channel', 'C'), null);
  // The grid wins, and inactive cells (present in the layout but not in the signal) don't count.
  c.audioMap = { input: grid(['FL', 'C', 'FR', 'LFE', 'SL', 'SR', 'FHL', 'FHR'], ['FL', 'C', 'FR', 'LFE', 'FHL', 'FHR']), output: grid(['FL', 'FR', 'SW'], ['FL', 'FR']) };
  assert.equal(r('input.count'), 6);
  assert.equal(r('input.layout'), '3.1.2');
  assert.equal(r('input.channel', 'FHL'), true);
  assert.equal(r('input.channel', 'SL'), false);
  assert.deepEqual(r('speakers.channels'), ['FL', 'FR']);
  assert.equal(r('speakers.count'), 2);
  assert.equal(evalCond({ type: 'channels', of: 'input', present: ['C', 'FHL'], absent: ['SL'] }, c), true);
  assert.equal(evalCond({ type: 'channels', of: 'input', present: ['C', 'SL'], absent: [] }, c), false);
  assert.equal(evalCond({ type: 'channels', of: 'speakers', present: ['SW'], absent: [] }, c), false);
});

test('every writable property produces commands the guard accepts', () => {
  const st = emptyState();
  applyLine(st, 'ZMON');
  const samples = (p: (typeof CATALOG)[number]): unknown[] => {
    switch (p.type) {
      case 'number': return [p.min, p.max, p.min! + p.step!];
      case 'enum': return p.options!().map((o) => o.value);
      case 'bool': return [true, false];
      case 'text': return p.writeOptions!.map((o) => o.value);
      default: return [];
    }
  };
  for (const p of CATALOG.filter((x) => x.write)) {
    const params = p.param ? p.param.options().map((o) => o.value) : [undefined];
    for (const param of params) {
      for (const v of samples(p)) {
        for (const c of p.write!(v as never, param)) {
          const r = guard(c, st, 18);
          assert.ok(r.ok, `${p.id}${param ? ` ${param}` : ''} = ${v}: ${c} (${!r.ok && r.reason})`);
        }
      }
    }
  }
  // Automations never send relative volume commands.
  assert.deepEqual(PROPS.volume.write!(-30), ['MV50']);
});

test('the catalog for the editor uses the receiver\'s input names', () => {
  const st = emptyState();
  applyLine(st, 'SSFUNBD Apple TV');
  const cat = describeCatalog({ state: st, audioMap: null });
  const input = cat.find((p) => p.id === 'input')!;
  assert.equal(input.options!.find((o) => o.value === 'BD')!.label, 'Apple TV');
  assert.equal(cat.find((p) => p.id === 'decoder')!.writable, false);
  assert.ok(cat.every((p) => JSON.stringify(p)));
});

// ---------- validation ----------

test('validation rejects bad rules and normalizes good ones', () => {
  const ok = validate(rule([{ type: 'change', prop: 'input', to: 'GAME', junk: 1 }], [{ type: 'set', prop: 'ps.DEH', value: 'OFF' }]));
  assert.deepEqual(ok.when, [{ type: 'change', prop: 'input', to: 'GAME' }]);
  assert.equal(ok.enabled, true);

  const fails = (r: unknown, msg: RegExp) => assert.throws(() => validate(r), msg);
  const set = [{ type: 'set', prop: 'ps.DEH', value: 'OFF' }];
  fails(rule([], set), /triggers/);
  fails(rule([{ type: 'change', prop: 'nope' }], set), /unknown property/);
  fails(rule([{ type: 'change', prop: 'input', to: 'NOPE' }], set), /choices/);
  fails(rule([{ type: 'change', prop: 'input' }], []), /empty/);
  fails(rule([{ type: 'change', prop: 'input' }], [{ type: 'set', prop: 'decoder', value: 'PCM' }]), /can't be set/);
  fails(rule([{ type: 'change', prop: 'input' }], [{ type: 'set', prop: 'volume', value: 30 }]), /-80 to 18/);
  fails(rule([{ type: 'change', prop: 'input' }], [{ type: 'set', prop: 'volume', value: -30.3 }]), /steps/);
  fails(rule([{ type: 'change', prop: 'input' }], [{ type: 'set', prop: 'ps.DEH', value: 'OFF', onlyLower: true }]), /only lower/);
  fails(rule([{ type: 'change', prop: 'input' }], [{ type: 'set', prop: 'soundMode', value: 'MOVIE' }]), /choices/); // cycles: can't be "set"
  fails(rule([{ type: 'change', prop: 'input' }], [{ type: 'set', prop: 'channel.level', value: 0 }]), /channel/); // no param
  fails(rule([{ type: 'change', prop: 'input' }], [{ type: 'wait', ms: LIMITS.waitMs + 1 }]), /wait/);
  fails(rule([{ type: 'change', prop: 'input' }], [{ type: 'if', cond: { type: 'cmp', prop: 'volume', op: 'contains', value: 1 }, then: [], else: [] }]), /comparison/);
  fails(rule([{ type: 'change', prop: 'input' }], [{ type: 'if', cond: { type: 'channels', of: 'input', present: ['C'], absent: ['C'] }, then: [], else: [] }]), /both/);
  fails(rule([{ type: 'change', prop: 'input' }], [{ type: 'if', cond: { type: 'all', items: [] }, then: [], else: [] }]), /all of/);
  fails(rule([{ type: 'change', prop: 'input.channels', to: 'C' }], set), /becomes/);
  fails({ ...rule([{ type: 'change', prop: 'input' }], set), name: '' }, /name/);
  fails(rule([{ type: 'change', prop: 'input' }], Array.from({ length: LIMITS.blocks + 1 }, () => set[0])), /blocks/);
  let deep: unknown = { type: 'stop' };
  for (let i = 0; i < 10; i++) deep = { type: 'if', cond: { type: 'cmp', prop: 'mute', op: 'isOn' }, then: [deep], else: [] };
  fails(rule([{ type: 'change', prop: 'input' }], [deep]), /nested/);
});

// ---------- runs ----------

test('change trigger: settles, runs, and skips actions that are already done', async () => {
  const r = await rig();
  on(r);
  await r.eng.save(rule([{ type: 'change', prop: 'input', to: 'GAME' }], [
    { type: 'set', prop: 'ps.DEH', value: 'MED' },
    { type: 'set', prop: 'soundMode', value: 'STEREO' },
  ]));
  r.eng.observe(); // baseline
  r.line('SIGAME');
  await r.clock.tick(1000);
  assert.deepEqual(r.sent, []); // still settling (input: 1.5 s)
  await r.clock.tick(1000);
  assert.deepEqual(r.sent, ['PSDEH MED', 'MSSTEREO']);
  assert.equal(r.last()!.status, 'done');
  await r.clock.tick(3000); // verify: both took
  assert.deepEqual(r.last()!.steps.map((s) => s.result), ['ok', 'ok']);

  // Away and back: runs again, but there's nothing left to change.
  r.line('SIBD');
  await r.clock.tick(2000);
  r.line('SIGAME');
  await r.clock.tick(2000);
  assert.deepEqual(r.sent, ['PSDEH MED', 'MSSTEREO']);
  assert.deepEqual(r.last()!.steps.map((s) => s.note), ['already set', 'already set']);
});

test('no triggers from unknown values, warm-up, or a change that is undone while settling', async () => {
  const r = await rig();
  await r.eng.save(rule([{ type: 'change', prop: 'input' }], [{ type: 'set', prop: 'mute', value: true }]));
  r.eng.observe();
  r.line('ZMON', 'MUOFF', 'SIBD'); // unknown -> value: the first report isn't a change
  await r.clock.tick(3000);
  assert.equal(r.runs.size, 0);

  r.eng.warmup(5000);
  r.line('SIGAME');
  await r.clock.tick(3000);
  assert.equal(r.runs.size, 0);
  await r.clock.tick(3000);

  // "to" trigger: GAME -> TV -> GAME within the settle time; at the end it's GAME again, so it runs once.
  await r.eng.save(rule([{ type: 'change', prop: 'input', to: 'TV' }], [{ type: 'set', prop: 'mute', value: true }]));
  r.line('SITV');
  await r.clock.tick(500);
  r.line('SIGAME');
  await r.clock.tick(3000);
  assert.equal([...r.runs.values()].filter((x) => x.trigger.includes('to TV')).length, 0); // not TV any more
});

test('if / else with channels, all of, and from-to triggers', async () => {
  const r = await rig();
  on(r);
  r.ctx.audioMap = map(['FL', 'FR', 'C', 'LFE', 'SL', 'SR']);
  const cond = { type: 'all', items: [
    { type: 'channels', of: 'input', present: ['C', 'FHL'], absent: [] },
    { type: 'cmp', prop: 'volume', op: 'le', value: -20 },
  ] };
  await r.eng.save(rule([{ type: 'change', prop: 'decoder', from: 'PCM' }], [
    { type: 'if', cond, then: [{ type: 'set', prop: 'ps.DEH', value: 'MED' }], else: [{ type: 'set', prop: 'ps.DEH', value: 'LOW' }] },
  ]));
  r.line('SYSDA PCM');
  r.eng.observe();
  r.line('SYSDA DOLBY ATMOS');
  await r.clock.tick(2000);
  assert.deepEqual(r.sent, ['PSDEH LOW']); // no FHL: else
  r.line('SYSDA PCM');
  await r.clock.tick(2000);
  assert.deepEqual(r.sent, ['PSDEH LOW']); // DOLBY ATMOS -> PCM isn't "from PCM"

  r.setMap(map(['FL', 'FR', 'C', 'LFE', 'SL', 'SR', 'FHL', 'FHR']));
  r.line('SYSDA DTS-HD MSTR');
  await r.clock.tick(2000);
  assert.deepEqual(r.sent, ['PSDEH LOW', 'PSDEH MED']);
});

test('becomes trigger with the channel picker', async () => {
  const r = await rig();
  on(r);
  r.ctx.audioMap = map(['FL', 'FR']);
  await r.eng.save(rule([{ type: 'becomes', cond: { type: 'channels', of: 'input', present: ['C', 'LFE'], absent: [] } }],
    [{ type: 'set', prop: 'ps.CINEMA EQ', value: true }]));
  r.eng.observe();
  r.setMap(map(['FL', 'FR', 'C', 'LFE', 'SL', 'SR']));
  await r.clock.tick(1000);
  assert.deepEqual(r.sent, []); // channels settle for 3 s
  await r.clock.tick(3000);
  assert.deepEqual(r.sent, ['PSCINEMA EQ.ON']);
  r.setMap(map(['FL', 'FR', 'C', 'LFE', 'SL', 'SR', 'FHL', 'FHR'])); // still true: no new run
  await r.clock.tick(5000);
  assert.equal(r.runs.size, 1);
});

test('wait until: met by a later change, timeout with stop or continue, cancelled by turning the rule off', async () => {
  const r = await rig();
  on(r);
  r.ctx.audioMap = map(['FL', 'FR']);
  const waitC = (onTimeout: string) => ({ type: 'waitUntil', cond: { type: 'channels', of: 'input', present: ['C'], absent: [] }, timeoutMs: 10_000, onTimeout });
  const a = await r.eng.save(rule([{ type: 'change', prop: 'input', to: 'GAME', settleMs: 0 }], [waitC('stop'), { type: 'set', prop: 'ps.DEH', value: 'HIGH' }]));
  r.eng.observe();

  r.line('SIGAME');
  await r.clock.tick(4000);
  assert.equal(r.last()!.status, 'running');
  r.setMap(map(['FL', 'FR', 'C']));
  await r.clock.tick(100);
  assert.deepEqual(r.sent, ['PSDEH HIGH']);
  assert.deepEqual(r.last()!.steps.map((s) => s.result), ['met', 'ok']);

  // Timeout + stop: nothing is sent.
  r.ctx.audioMap = map(['FL', 'FR']);
  r.line('SIBD');
  await r.clock.tick(100);
  r.line('SIGAME');
  await r.clock.tick(11_000);
  assert.equal(r.last()!.status, 'stopped');
  assert.deepEqual(r.sent, ['PSDEH HIGH']);

  // Timeout + continue: the rest runs.
  await r.eng.save({ ...a, script: [waitC('continue'), { type: 'set', prop: 'ps.DEH', value: 'LOW' }] });
  r.line('SIBD');
  await r.clock.tick(100);
  r.line('SIGAME');
  await r.clock.tick(11_000);
  assert.deepEqual(r.sent, ['PSDEH HIGH', 'PSDEH LOW']);

  // Turning the rule off cancels a waiting run.
  r.line('SIBD');
  await r.clock.tick(100);
  r.line('SIGAME');
  await r.clock.tick(3000);
  assert.equal(r.last()!.status, 'running');
  await r.eng.setEnabled(a.id, false);
  await r.clock.tick(100);
  assert.equal(r.last()!.status, 'cancelled');
});

test('one rule at a time: triggers during a run are ignored, by itself and by other rules', async () => {
  const r = await rig();
  on(r);
  const a = await r.eng.save(rule([{ type: 'change', prop: 'mute', settleMs: 0 }], [
    { type: 'wait', ms: 5000 }, { type: 'set', prop: 'ps.DEH', value: 'LOW' }, { type: 'stop' }, { type: 'set', prop: 'ps.DEH', value: 'HIGH' },
  ]));
  await r.eng.save(rule([{ type: 'change', prop: 'input', settleMs: 0 }], [{ type: 'set', prop: 'ps.CINEMA EQ', value: true }]));
  r.eng.observe();
  r.line('MUON');
  await r.clock.tick(1000);
  r.line('MUOFF'); // the same rule: ignored, it's running
  r.line('SIGAME'); // another rule: ignored too
  await r.clock.tick(500);
  assert.throws(() => r.eng.runNow(a.id), /Wait for/);
  await r.clock.tick(5000);
  assert.deepEqual(r.sent, ['PSDEH LOW']);
  assert.equal(r.runs.size, 1);
  assert.equal(r.last()!.status, 'stopped');
  assert.equal(r.eng.summary()[0].running, false);
  // What changed during the run is the new baseline: nothing fires late. The next change runs normally.
  await r.clock.tick(5000);
  assert.equal(r.runs.size, 1);
  r.line('SITV');
  await r.clock.tick(100);
  assert.deepEqual(r.sent, ['PSDEH LOW', 'PSCINEMA EQ.ON']);
});

test('volume: only lower, the cap, and nothing while the main zone is off', async () => {
  const r = await rig({ cap: -30 });
  on(r); // volume -40
  await r.eng.save(rule([{ type: 'change', prop: 'mute', settleMs: 0 }], [
    { type: 'set', prop: 'volume', value: -35, onlyLower: true }, // -40 is already lower: skipped
    { type: 'set', prop: 'ps.DEH', value: 'LOW' },
  ]));
  r.eng.observe();
  r.line('MUON');
  await r.clock.tick(100);
  assert.deepEqual(r.sent, ['PSDEH LOW']);
  assert.equal(r.last()!.steps[0].note, 'already at or below');

  // Above the cap: the guard clamps it, like any command from the app.
  const b = await r.eng.save(rule([{ type: 'change', prop: 'mute', to: false, settleMs: 0 }], [{ type: 'set', prop: 'volume', value: -10 }]));
  r.line('MUOFF');
  await r.clock.tick(100);
  assert.equal(r.sent.at(-1), 'MV50'); // -30 dB
  assert.equal(r.last()!.steps[0].note, 'limited by the volume cap');
  await r.eng.remove(b.id);

  r.line('ZMOFF');
  await r.clock.tick(100);
  r.line('MUON');
  await r.clock.tick(100);
  assert.equal(r.last()!.steps[0].note, 'main zone is off');
});

test('an action the receiver ignores is reported as not applied', async () => {
  const r = await rig({ echo: (c) => !c.startsWith('PSLFE') }); // like LFE with a PCM source
  on(r);
  await r.eng.save(rule([{ type: 'change', prop: 'mute', settleMs: 0 }], [{ type: 'set', prop: 'ps.LFE', value: -5 }]));
  r.eng.observe();
  r.line('MUON');
  await r.clock.tick(100);
  assert.deepEqual(r.sent, ['PSLFE 05']);
  assert.equal(r.last()!.steps[0].result, 'ok');
  await r.clock.tick(3000);
  assert.equal(r.last()!.steps[0].result, 'not-applied');
});

test('loops: a rule that keeps firing turns itself off; chains stop at the depth limit', async () => {
  const r = await rig();
  on(r);
  // A ping-pong with the "receiver": every mute change toggles Cinema EQ, and something keeps toggling mute.
  const a = await r.eng.save(rule([{ type: 'change', prop: 'mute', settleMs: 0 }], [{ type: 'set', prop: 'ps.CINEMA EQ', value: true }]));
  r.eng.observe();
  for (let i = 0; i < 12; i++) { r.line(i % 2 ? 'MUOFF' : 'MUON'); await r.clock.tick(500); }
  assert.match(r.eng.get(a.id)!.disabled!, /turned off/);
  assert.equal(r.eng.summary()[0].disabled !== null, true);
  const count = r.runs.size;
  r.line('MUON');
  await r.clock.tick(500);
  assert.equal(r.runs.size, count); // off now
  await r.eng.setEnabled(a.id, true); // turning it on again clears the stop
  assert.equal(r.eng.get(a.id)!.disabled, undefined);
  await r.eng.remove(a.id);

  // Chain: each rule's action triggers the next (Cinema EQ is on from the part above). Depth 0 (the user), 1, 2, 3 run; the 5th rule (depth 4) doesn't.
  const chain = [['mute', 'ps.DEH', 'LOW'], ['ps.DEH', 'ps.CINEMA EQ', false], ['ps.CINEMA EQ', 'ps.DYNVOL', 'MED'], ['ps.DYNVOL', 'ps.LOM', true], ['ps.LOM', 'ps.NEURAL', true]] as const;
  for (const [from, prop, value] of chain) await r.eng.save(rule([{ type: 'change', prop: from, settleMs: 0 }], [{ type: 'set', prop, value }]));
  r.eng.observe();
  r.sent.length = 0;
  r.line('MUOFF');
  await r.clock.tick(5000);
  assert.deepEqual(r.sent, ['PSDEH LOW', 'PSCINEMA EQ.OFF', 'PSDYNVOL MED', 'PSLOM ON']);
  assert.ok(r.logs.some((l) => /chain of 4 rules/.test(l)));
});

test('dry run sends nothing; run now ignores the trigger', async () => {
  const r = await rig();
  on(r);
  const a = await r.eng.save(rule([{ type: 'change', prop: 'input', to: 'TV' }], [
    { type: 'if', cond: { type: 'cmp', prop: 'input', op: 'is', value: 'BD' }, then: [
      { type: 'set', prop: 'ps.DEH', value: 'OFF' }, { type: 'set', prop: 'ps.DEH', value: 'HIGH' }], else: [] },
  ]));
  const t = r.eng.test(a.id);
  assert.deepEqual(t.steps.map((s) => [s.path, s.result, s.note ?? s.cmds?.join()]), [
    ['0', 'true', undefined], ['0.then.0', 'skipped', 'already set'], ['0.then.1', 'would-send', 'PSDEH HIGH']]);
  assert.deepEqual(r.sent, []);
  assert.equal(r.eng.test({ ...a, script: [{ type: 'stop' }] }).status, 'stopped'); // unsaved rules can be tested too
  r.eng.runNow(a.id);
  await r.clock.tick(100);
  assert.deepEqual(r.sent, ['PSDEH HIGH']);
});

test('rules are saved to disk and load back', async () => {
  const r = await rig();
  const a = await r.eng.save(rule([{ type: 'becomes', cond: { type: 'not', item: { type: 'cmp', prop: 'volume', op: 'between', value: [-40, -20] } } }],
    [{ type: 'waitUntil', cond: { type: 'any', items: [{ type: 'cmp', prop: 'input.count', op: 'ge', value: 6 }] }, timeoutMs: 5000, onTimeout: 'continue' },
      { type: 'set', prop: 'channel.level', param: 'C', value: 1.5 }], { enabled: false }));
  const b = new Automations(r.dir, r.io);
  await b.load();
  assert.deepEqual(b.all(), [a]);
  await r.eng.remove(a.id);
  const c = new Automations(r.dir, r.io);
  await c.load();
  assert.deepEqual(c.all(), []);
  const raw = JSON.parse(await fs.readFile(path.join(r.dir, 'automations.json'), 'utf8'));
  assert.equal(raw.version, 1);
});

test('find sound mode: found, not found (stop / continue / back), dry run, validation', async () => {
  const r = await rig();
  on(r); // Dolby Surround
  const calls: [string, boolean][] = [];
  (r.io as Record<string, unknown>).findMode = async (text: string, back: boolean) => {
    calls.push([text, back]);
    if (/neural/i.test(text)) return { ok: false, mode: 'DOLBY AUDIO-DSUR', note: 'not available for this signal' };
    applyLine(r.state, 'MSMCH STEREO');
    return { ok: true, mode: 'MCH STEREO' };
  };
  const a = await r.eng.save(rule([{ type: 'change', prop: 'mute', settleMs: 0 }], [
    { type: 'findMode', text: 'Neural:X', onNotFound: 'stop' }, { type: 'set', prop: 'ps.DEH', value: 'LOW' }]));
  r.eng.observe();
  r.line('MUON');
  await r.clock.tick(100);
  assert.deepEqual(calls, [['Neural:X', false]]);
  assert.deepEqual(r.sent, []);
  assert.deepEqual(r.last()!.steps.map((s) => [s.result, s.note]), [['not-found', 'not available for this signal']]);
  assert.equal(r.last()!.status, 'stopped');

  await r.eng.save({ ...a, script: [{ type: 'findMode', text: 'neural', onNotFound: 'back' }, { type: 'findMode', text: 'mch stereo', onNotFound: 'stay' }, { type: 'set', prop: 'ps.DEH', value: 'LOW' }] });
  r.line('MUOFF');
  await r.clock.tick(100);
  assert.deepEqual(calls.slice(1), [['neural', true], ['mch stereo', false]]);
  assert.deepEqual(r.last()!.steps.map((s) => s.result), ['not-found', 'ok', 'ok']); // "back" carries on
  assert.deepEqual(r.sent, ['PSDEH LOW']);

  // Dry run: no search, just whether it's already there.
  const t = r.eng.test({ ...a, script: [{ type: 'findMode', text: 'stereo', onNotFound: 'stay' }, { type: 'findMode', text: 'atmos', onNotFound: 'stay' }] });
  assert.deepEqual(t.steps.map((s) => [s.result, s.note]), [['skipped', 'already set'], ['would-send', 'would search the modes the receiver offers']]);
  assert.equal(calls.length, 3);

  assert.throws(() => validate(rule([{ type: 'change', prop: 'mute' }], [{ type: 'findMode', text: '', onNotFound: 'stay' }])), /find sound mode/);
  assert.throws(() => validate(rule([{ type: 'change', prop: 'mute' }], [{ type: 'findMode', text: 'x', onNotFound: 'maybe' }])), /find sound mode/);
});
