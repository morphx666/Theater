import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { applyLine, emptyState, type AvrState } from './parse.ts';
import { SoundModes, signalKind, groupOf, directCommand } from './sound-modes.ts';

/**
 * A receiver that behaves like the X1700H did when probed (2026-11-14): each button cycles through `cycle`
 * (the first press goes to the button's remembered mode), direct commands for stereo / direct / the native mode.
 */
function receiver(lines: string[], cycle: string[], native: string) {
  const st: AvrState = emptyState();
  for (const l of ['ZMON', ...lines]) applyLine(st, l);
  const sent: string[] = [];
  const memory: Record<string, string> = {};
  const cmd = (c: string) => {
    sent.push(c);
    const set = (m: string) => applyLine(st, `MS${m}`);
    if (c === 'MSDOLBY DIGITAL' || c === 'MSDTS SURROUND') set(native);
    else if (['MSSTEREO', 'MSMCH STEREO', 'MSDIRECT', 'MSPURE DIRECT'].includes(c)) set(c.slice(2));
    else if (/^MS(MOVIE|MUSIC|GAME)$/.test(c)) {
      const cur = st.surround ?? '';
      const next = memory[c] && memory[c] !== cur ? memory[c] : cycle[(cycle.indexOf(cur) + 1) % cycle.length];
      memory[c] = next;
      set(next);
    } // anything else is ignored, like the real unit
    return { ok: true };
  };
  return { st, sent, cmd };
}

async function rig(lines: string[], cycle: string[], native: string) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sound-modes-'));
  const r = receiver(lines, cycle, native);
  const sm = new SoundModes(dir, { state: () => r.st, cmd: r.cmd, sleep: async () => {}, settleMs: 5 });
  await sm.load();
  return { ...r, sm, dir };
}
const wait = (ms: number) => new Promise((res) => setTimeout(res, ms));

test('signal kinds and groups', () => {
  const k = (...ls: string[]) => { const st = emptyState(); for (const l of ls) applyLine(st, l); return signalKind(st); };
  assert.equal(k('SYSDA PCM', 'SSINFAISFOR 2/0/.0'), 'pcm2');
  assert.equal(k('SYSDA PCM', 'SSINFAISFOR 3/2/.1'), 'pcm-multi');
  assert.equal(k('SYSDA Dolby Atmos'), 'atmos');
  assert.equal(k('SYSDA DOLBY DIGITAL +'), 'dolby');
  assert.equal(k('SYSDA DTS-HD MSTR'), 'dts');
  assert.equal(k('SYSDA DTS:X'), 'dtsx');
  assert.equal(k('SYSDA PCM ZERO'), null); // no audio
  assert.equal(k(), null);
  assert.equal(groupOf('PURE DIRECT'), 'direct');
  assert.equal(groupOf('MCH STEREO'), 'stereo');
  assert.equal(groupOf('DOLBY AUDIO-DSUR'), 'surround');
  assert.equal(directCommand('DOLBY ATMOS', 'DOLBY ATMOS', 'atmos'), 'MSDOLBY DIGITAL');
  assert.equal(directCommand('DTS NEURAL:X', 'DTS SURROUND', 'dts'), null); // only by cycling
});

test('the panel list starts from what the receiver was seen to offer', async () => {
  const r = await rig(['SYSDA PCM', 'SSINFAISFOR 2/0/.0', 'MSSTEREO'], ['DOLBY AUDIO-DSUR', 'MCH STEREO', 'STEREO'], 'DOLBY AUDIO-DSUR');
  const s = r.sm.summary();
  assert.equal(s.kind, 'pcm2');
  assert.deepEqual(s.available.map((m) => `${m.group}:${m.label}`),
    ['surround:Dolby Surround', 'stereo:Stereo', 'stereo:Multi Ch Stereo', 'direct:Direct', 'direct:Pure Direct']);
});

test('select uses a direct command when there is one', async () => {
  const r = await rig(['SYSDA Dolby Atmos', 'SSINFAISFOR Atmos', 'MSSTEREO'], ['DOLBY ATMOS', 'MCH STEREO', 'STEREO'], 'DOLBY ATMOS');
  assert.deepEqual(await r.sm.select({ exact: 'DOLBY ATMOS' }), { ok: true, mode: 'DOLBY ATMOS' });
  assert.deepEqual(r.sent, ['MSDOLBY DIGITAL']);
  assert.equal((await r.sm.select({ text: 'atmos' })).note, 'already set');
  assert.deepEqual(await r.sm.select({ exact: 'PURE DIRECT' }), { ok: true, mode: 'PURE DIRECT' });
  assert.deepEqual(r.sent, ['MSDOLBY DIGITAL', 'MSPURE DIRECT']);
});

test('select cycles for a mode without a direct command, and gives up when the modes repeat', async () => {
  const cycle = ['DTS SURROUND', 'DTS NEURAL:X', 'MCH STEREO', 'STEREO'];
  const r = await rig(['SYSDA DTS', 'SSINFAISFOR 3/2/.1', 'MSSTEREO'], cycle, 'DTS SURROUND');
  const ok = await r.sm.select({ text: 'neural' });
  assert.deepEqual(ok, { ok: true, mode: 'DTS NEURAL:X' });
  assert.deepEqual(r.sent, ['MSMOVIE', 'MSMOVIE']);

  // Not offered at all: each button goes round once (and is remembered), then back to where it started.
  r.sent.length = 0;
  const no = await r.sm.select({ text: 'virtual:x' }, { back: true });
  assert.equal(no.ok, false);
  assert.equal(no.note, 'not available for this signal');
  assert.equal(r.st.surround, 'DTS NEURAL:X'); // back
  const presses = r.sent.length;
  assert.ok(presses <= 3 * (cycle.length + 1) + cycle.length + 1, `${presses} presses`);

  // The second time it's known not to be there: no switching at all.
  r.sent.length = 0;
  assert.equal((await r.sm.select({ text: 'virtual:x' })).ok, false);
  assert.deepEqual(r.sent, []);
});

test('built in from the probe: no switching for modes this unit does not offer', async () => {
  const r = await rig(['SYSDA Dolby Atmos', 'SSINFAISFOR Atmos', 'MSDOLBY ATMOS'], ['DOLBY ATMOS', 'MCH STEREO', 'STEREO'], 'DOLBY ATMOS');
  const res = await r.sm.select({ text: 'neural:x' }, { back: true });
  assert.deepEqual([res.ok, res.note, r.sent], [false, 'not available for this signal', []]);
});

test('learns modes per signal, names from SYSMI, and the native mode', async () => {
  const r = await rig(['SYSDA DTS', 'SSINFAISFOR 3/2/.1', 'MSSTEREO'], ['DTS SURROUND', 'MCH STEREO', 'STEREO'], 'DTS SURROUND');
  r.sm.onCommand('MSDTS SURROUND');
  applyLine(r.st, 'MSDTS SURROUND');
  r.sm.onLine('MSDTS SURROUND');
  applyLine(r.st, 'SYSMIDTS Surround');
  r.sm.onLine('SYSMIDTS Surround');
  await wait(30);
  const s = r.sm.summary();
  assert.equal(s.native, 'DTS SURROUND');
  assert.deepEqual(s.available[0], { mode: 'DTS SURROUND', label: 'DTS Surround', group: 'surround' });

  // A mode reported while the signal is changing is not learned for the old signal.
  applyLine(r.st, 'MSDOLBY AUDIO-DSUR');
  r.sm.onLine('MSDOLBY AUDIO-DSUR');
  applyLine(r.st, 'SYSDA PCM'); // the signal changes before the mode has settled
  await wait(30);
  applyLine(r.st, 'SYSDA DTS');
  applyLine(r.st, 'MSSTEREO');
  assert.deepEqual(r.sm.summary().available.filter((m) => m.group === 'surround').map((m) => m.mode), ['DTS SURROUND']);

  // Saved and loaded back.
  await wait(1100);
  const again = new SoundModes(r.dir, { state: () => r.st, cmd: r.cmd });
  await again.load();
  applyLine(r.st, 'MSSTEREO');
  assert.equal(again.summary().native, 'DTS SURROUND');
});

test('nothing happens while the main zone is off, or while another change runs', async () => {
  const r = await rig(['SYSDA PCM', 'SSINFAISFOR 2/0/.0', 'MSSTEREO', 'ZMOFF'], ['DOLBY AUDIO-DSUR', 'MCH STEREO', 'STEREO'], 'DOLBY AUDIO-DSUR');
  assert.equal((await r.sm.select({ exact: 'DIRECT' })).note, 'main zone is off');
  applyLine(r.st, 'ZMON');
  r.sm.busy = true;
  assert.match((await r.sm.select({ exact: 'DIRECT' })).note!, /in progress/);
  assert.deepEqual(r.sent, []);
});
