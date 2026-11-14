import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { applyLine, emptyState, type AvrState } from './parse.ts';
import { SoundModes, signalKey, familyOf, groupOf, fixedCommand, nativeCommand, decoderMode } from './sound-modes.ts';

/**
 * A receiver that behaves like the X1700H (tested 2026-11-14), on a fake clock. Each button cycles through
 * `cycle`. A press within WINDOW of that button's last press moves on; otherwise it only shows the mode when the
 * current mode is the one the button remembers, or jumps to the remembered one. Direct commands for stereo /
 * direct, and `native` for MSDOLBY DIGITAL / MSDTS SURROUND ('' = ignored; 'recall' = the DTS / Dolby mode used
 * last, as the real unit does). `extra.codes`: modes selected by MS<code>; `extra.auto`: what MSAUTO selects.
 */
const WINDOW = 1500;
type Extra = { codes?: string[]; auto?: string; onLine?: (l: string) => void };
function receiver(lines: string[], cycle: string[], native: string, memory: Record<string, string> = {}, extra: Extra = {}) {
  const st: AvrState = emptyState();
  for (const l of ['ZMON', 'SSINFFRMAVR D400-9123-9071-9031', ...lines]) applyLine(st, l);
  const clock = { now: 0 };
  const sent: string[] = [];
  const moves: string[] = [];
  const lastPress: Record<string, number> = {};
  let lastDecoder = /^(DTS|DOLBY)/.test(st.surround ?? '') ? st.surround! : '';
  const set = (m: string) => {
    if (st.surround !== m) moves.push(m);
    if (/^(DTS|DOLBY)/.test(m)) lastDecoder = m;
    applyLine(st, `MS${m}`);
    extra.onLine?.(`MS${m}`);
  };
  const cmd = (c: string) => {
    sent.push(c);
    if (c === 'MSDOLBY DIGITAL' || c === 'MSDTS SURROUND') { const n = native === 'recall' ? lastDecoder : native; if (n) set(n); }
    else if (['MSSTEREO', 'MSMCH STEREO', 'MSDIRECT', 'MSPURE DIRECT'].includes(c)) set(c.slice(2));
    else if (c === 'MSAUTO') { if (extra.auto) set(extra.auto); }
    else if (extra.codes?.includes(c.slice(2))) set(c.slice(2));
    else if (/^MS(MOVIE|MUSIC|GAME)$/.test(c)) {
      const cur = st.surround ?? '';
      const open = lastPress[c] !== undefined && clock.now - lastPress[c] < WINDOW;
      lastPress[c] = clock.now;
      const advance = () => cycle[(cycle.indexOf(cur) + 1) % cycle.length];
      const next = open || memory[c] === undefined ? advance() : memory[c] === cur ? null : memory[c];
      if (next) { memory[c] = next; set(next); }
    } // anything else is ignored, like the real unit
    return { ok: true };
  };
  return { st, sent, moves, cmd, clock };
}

async function rig(lines: string[], cycle: string[], native: string, dir?: string, memory?: Record<string, string>, extra: Extra = {}) {
  dir ??= await fs.mkdtemp(path.join(os.tmpdir(), 'sound-modes-'));
  const r = receiver(lines, cycle, native, memory, extra);
  const sm = new SoundModes(dir, {
    state: () => r.st, cmd: (c) => { sm.onCommand(c); return r.cmd(c); }, settleMs: 5,
    now: () => r.clock.now, sleep: async (ms) => { r.clock.now += ms; },
  });
  extra.onLine ??= (l) => sm.onLine(l);
  await sm.load();
  return { ...r, sm, dir };
}
const wait = (ms: number) => new Promise((res) => setTimeout(res, ms));
const DTS_HD = ['SYSDA DTS-HD MSTR', 'SSINFAISFOR 3/4/.1'];
const surround = (sm: SoundModes) => sm.summary().available.filter((m) => m.group === 'surround').map((m) => m.mode);

test('one list per decoder; PCM split by channels', () => {
  const k = (...ls: string[]) => { const st = emptyState(); for (const l of ls) applyLine(st, l); return signalKey(st); };
  assert.equal(k('SYSDA PCM', 'SSINFAISFOR 2/0/.0'), 'PCM:2CH');
  assert.equal(k('SYSDA PCM', 'SSINFAISFOR 3/2/.1'), 'PCM:MULTI');
  assert.equal(k('SYSDA Dolby Atmos'), 'DOLBYATMOS');
  assert.equal(k('SYSDA Dolby Audio - DD'), 'DOLBYAUDIO-DD');
  assert.equal(k('SYSDA DTS-HD MSTR'), 'DTS-HDMSTR');
  assert.equal(k('SYSDA DTS'), 'DTS'); // plain DTS keeps its own list
  assert.equal(k('SYSDA PCM ZERO'), null); // no audio
  assert.equal(k(), null);
  assert.equal(familyOf('DTS-HDMSTR'), 'dts');
  assert.equal(familyOf('DOLBYAUDIO-DD'), 'dolby');
  assert.equal(groupOf('PURE DIRECT'), 'direct');
  assert.equal(groupOf('MCH STEREO'), 'stereo');
  assert.equal(fixedCommand('MCH STEREO'), 'MSMCH STEREO');
  assert.equal(fixedCommand('MONO MOVIE'), null);
  assert.equal(nativeCommand('DOLBYATMOS'), 'MSDOLBY DIGITAL');
  assert.equal(nativeCommand('DTS-HDMSTR'), 'MSDTS SURROUND');
  assert.equal(decoderMode('DTS-HDMSTR', 'DTS HD+DSUR'), true);
  assert.equal(decoderMode('DTS-HDMSTR', 'VIRTUAL'), false);
});

test('effect modes by their code: tried once, remembered, and not tried again when ignored', async () => {
  // The real unit with DTS-HD MSTR (2026-11-14): MSVIRTUAL, MSVIDEO GAME, MSMONO MOVIE work.
  const cycle = ['DTS HD+DSUR', 'DTS HD+NEURAL:X', 'MCH STEREO', 'VIDEO GAME', 'VIRTUAL', 'JAZZ CLUB', 'STEREO', 'DTS HD MSTR'];
  const codes = ['VIRTUAL', 'VIDEO GAME', 'MONO MOVIE', 'ROCK ARENA'];
  const r = await rig([...DTS_HD, 'MSDTS HD MSTR'], [...cycle, 'ROCK ARENA'], 'recall', undefined, undefined, { codes });
  assert.deepEqual(await r.sm.select({ exact: 'VIRTUAL' }), { ok: true, mode: 'VIRTUAL' });
  assert.deepEqual(r.sent, ['MSVIRTUAL']);
  r.sent.length = 0; // a code no one tried yet: tried, works
  assert.deepEqual(await r.sm.select({ exact: 'ROCK ARENA' }), { ok: true, mode: 'ROCK ARENA' });
  assert.deepEqual(r.sent, ['MSROCK ARENA']);
  r.sent.length = 0; // ignored: found by cycling, and not tried the next time
  assert.equal((await r.sm.select({ exact: 'JAZZ CLUB' })).ok, true);
  assert.equal(r.sent[0], 'MSJAZZ CLUB');
  await r.sm.select({ exact: 'STEREO' });
  r.sent.length = 0;
  assert.equal((await r.sm.select({ exact: 'JAZZ CLUB' })).ok, true);
  assert.ok(!r.sent.includes('MSJAZZ CLUB'));
  r.sent.length = 0; // decoder modes are never tried by code
  await r.sm.select({ exact: 'DTS HD+DSUR' });
  assert.ok(!r.sent.some((c) => /^MSDTS HD/.test(c)), r.sent.join());
});

test('decoder modes: Auto, and the native-mode command returns to the one used last', async () => {
  const cycle = ['DTS HD+DSUR', 'DTS HD+NEURAL:X', 'MCH STEREO', 'VIDEO GAME', 'VIRTUAL', 'STEREO', 'DTS HD MSTR'];
  const r = await rig([...DTS_HD, 'MSDTS HD MSTR'], cycle, 'recall', undefined, { MSGAME: 'DTS HD MSTR' }, { auto: 'DTS HD+NEURAL:X', codes: ['VIRTUAL'] });
  assert.deepEqual(await r.sm.select({ exact: 'DTS HD+NEURAL:X' }), { ok: true, mode: 'DTS HD+NEURAL:X' });
  assert.deepEqual(r.sent, ['MSAUTO']); // one switch
  await wait(30);
  assert.equal(r.sm.summary().native, 'DTS HD+NEURAL:X'); // the one MSDTS SURROUND leads to now
  await r.sm.select({ exact: 'VIRTUAL' });
  r.sent.length = 0;
  assert.deepEqual(await r.sm.select({ exact: 'DTS HD+NEURAL:X' }), { ok: true, mode: 'DTS HD+NEURAL:X' });
  assert.deepEqual(r.sent, ['MSDTS SURROUND']);
  // MSTR isn't the one used last: by the buttons, and from then on MSDTS SURROUND leads to it.
  assert.equal((await r.sm.select({ exact: 'DTS HD MSTR' })).ok, true);
  await wait(30);
  await r.sm.select({ exact: 'VIRTUAL' });
  r.sent.length = 0;
  assert.deepEqual(await r.sm.select({ exact: 'DTS HD MSTR' }), { ok: true, mode: 'DTS HD MSTR' });
  assert.deepEqual(r.sent, ['MSDTS SURROUND']);
});

test('cycling starts with the button that remembers the mode: one switch', async () => {
  // The real unit's DTS-HD MSTR cycles (2026-11-14). Only GAME has MSTR, and GAME last went to it.
  const game = ['DTS HD+DSUR', 'DTS HD+NEURAL:X', 'MCH STEREO', 'VIDEO GAME', 'VIRTUAL', 'STEREO', 'DTS HD MSTR'];
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sound-modes-'));
  await fs.writeFile(path.join(dir, 'sound-modes.json'), JSON.stringify({ version: 2, names: {}, signals: { 'DTS-HDMSTR': {
    modes: [], native: 'DTS HD+NEURAL:X', remembers: { MSGAME: 'DTS HD MSTR' },
    cycles: { MSMOVIE: ['MONO MOVIE', 'STEREO', 'DTS HD+DSUR', 'MCH STEREO'], MSGAME: game,
      MSMUSIC: ['JAZZ CLUB', 'VIRTUAL', 'STEREO', 'DTS HD+DSUR', 'DTS HD+NEURAL:X', 'ROCK ARENA', 'MATRIX'] } } } }));
  const r = await rig([...DTS_HD, 'MSDTS HD+NEURAL:X'], game, 'recall', dir, { MSGAME: 'DTS HD MSTR', MSMOVIE: 'MONO MOVIE', MSMUSIC: 'JAZZ CLUB' });
  assert.deepEqual(await r.sm.select({ exact: 'DTS HD MSTR' }), { ok: true, mode: 'DTS HD MSTR' });
  assert.deepEqual(r.sent, ['MSGAME']);
  assert.deepEqual(r.moves, ['DTS HD MSTR']);
});

test('hints fill the lists before anything is learned', async () => {
  const r = await rig(['SYSDA PCM', 'SSINFAISFOR 2/0/.0', 'MSSTEREO'], ['DOLBY AUDIO-DSUR', 'MCH STEREO', 'STEREO'], 'DOLBY AUDIO-DSUR');
  assert.deepEqual(r.sm.summary().available.map((m) => `${m.group}:${m.label}`),
    ['surround:Dolby Surround', 'stereo:Stereo', 'stereo:Multi Ch Stereo', 'direct:Direct', 'direct:Pure Direct']);
  assert.equal(r.sm.summary().canLearn, true);
  // A different DTS decoder doesn't get the DTS-HD hints.
  const p = await rig(['SYSDA DTS', 'SSINFAISFOR 3/2/.1', 'MSSTEREO'], ['DTS SURROUND', 'MCH STEREO', 'STEREO'], 'DTS SURROUND');
  assert.deepEqual(surround(p.sm), []);
});

test('select uses a direct command when there is one', async () => {
  const r = await rig(['SYSDA Dolby Atmos', 'SSINFAISFOR Atmos', 'MSSTEREO'], ['DOLBY ATMOS', 'MCH STEREO', 'STEREO'], 'DOLBY ATMOS');
  assert.deepEqual(await r.sm.select({ exact: 'DOLBY ATMOS' }), { ok: true, mode: 'DOLBY ATMOS' });
  assert.deepEqual(r.sent, ['MSDOLBY DIGITAL']);
  assert.equal((await r.sm.select({ text: 'atmos' })).note, 'already set');
  assert.deepEqual(await r.sm.select({ exact: 'PURE DIRECT' }), { ok: true, mode: 'PURE DIRECT' });
  assert.deepEqual(r.sent, ['MSDOLBY DIGITAL', 'MSPURE DIRECT']);
});

test('select cycles for a mode without a direct command, remembers full cycles, and goes back', async () => {
  const cycle = ['DTS SURROUND', 'DTS NEURAL:X', 'MCH STEREO', 'STEREO'];
  const r = await rig(['SYSDA DTS', 'SSINFAISFOR 3/2/.1', 'MSSTEREO'], cycle, 'DTS SURROUND');
  assert.deepEqual(await r.sm.select({ text: 'neural' }), { ok: true, mode: 'DTS NEURAL:X' });
  assert.deepEqual(r.moves, ['DTS SURROUND', 'DTS NEURAL:X']); // two moves, no more

  r.sent.length = 0;
  const no = await r.sm.select({ text: 'virtual:x' }, { back: true });
  assert.deepEqual([no.ok, no.note], [false, 'not available for this signal']);
  assert.equal(r.st.surround, 'DTS NEURAL:X'); // back
  assert.ok(r.moves.length <= 2 + 3 * (cycle.length + 1) + cycle.length, `${r.moves.length} moves`); // shows don't drop the audio; moves do
  r.sent.length = 0; // the second time it's known not to be there: no switching at all
  assert.equal((await r.sm.select({ text: 'virtual:x' })).ok, false);
  assert.deepEqual(r.sent, []);
});

test('hints never rule a button out', async () => {
  // A receiver whose DTS-HD MSTR cycle differs from the hints (no Mono Movie, but Rock Arena).
  const cycle = ['DTS HD+NEURAL:X', 'DTS HD MSTR', 'ROCK ARENA', 'MCH STEREO', 'STEREO'];
  const r = await rig([...DTS_HD, 'MSDTS HD+NEURAL:X'], cycle, 'DTS HD+NEURAL:X');
  assert.ok(surround(r.sm).includes('VIDEO GAME')); // a hint, for now
  assert.equal((await r.sm.select({ text: 'rock arena' })).ok, true); // not in the hints: found by cycling anyway
});

test('learn modes: full cycles, back to the start, hints this receiver lacks drop out, then not offered', async () => {
  const cycle = ['DTS HD+NEURAL:X', 'DTS HD MSTR', 'ROCK ARENA', 'MCH STEREO', 'STEREO'];
  const r = await rig([...DTS_HD, 'MSDTS HD+NEURAL:X'], cycle, 'DTS HD+NEURAL:X');
  assert.equal(r.sm.summary().canLearn, true);
  const res = await r.sm.learn();
  assert.equal(res.ok, true);
  assert.deepEqual([...res.modes].sort(), ['DTS HD MSTR', 'DTS HD+NEURAL:X', 'ROCK ARENA']);
  assert.equal(r.st.surround, 'DTS HD+NEURAL:X'); // back where it was
  assert.deepEqual([...surround(r.sm)].sort(), ['DTS HD MSTR', 'DTS HD+NEURAL:X', 'ROCK ARENA']); // Video Game, Virtual, DSur gone
  assert.equal(r.sm.summary().canLearn, false);
  // A firmware update offers it again.
  applyLine(r.st, 'SSINFFRMAVR D400-9200-0000-0000');
  assert.equal(r.sm.summary().canLearn, true);
});

test('learns modes, names and the native mode from what the receiver reports', async () => {
  const r = await rig(['SYSDA DTS', 'SSINFAISFOR 3/2/.1', 'MSSTEREO'], ['DTS SURROUND', 'MCH STEREO', 'STEREO'], 'DTS SURROUND');
  r.sm.onCommand('MSDTS SURROUND');
  applyLine(r.st, 'MSDTS SURROUND');
  r.sm.onLine('MSDTS SURROUND');
  applyLine(r.st, 'SYSMIDTS Surround');
  r.sm.onLine('SYSMIDTS Surround');
  await wait(30);
  const s = r.sm.summary();
  assert.equal(s.native, 'DTS SURROUND');
  assert.deepEqual(s.available.find((m) => m.mode === 'DTS SURROUND'), { mode: 'DTS SURROUND', label: 'DTS Surround', group: 'surround' });

  // A mode reported while the signal is changing is not learned for the old signal.
  applyLine(r.st, 'MSDOLBY AUDIO-DSUR');
  r.sm.onLine('MSDOLBY AUDIO-DSUR');
  applyLine(r.st, 'SYSDA PCM'); // the signal changes before the mode has settled
  await wait(30);
  applyLine(r.st, 'SYSDA DTS');
  applyLine(r.st, 'MSSTEREO');
  assert.deepEqual(surround(r.sm), ['DTS SURROUND']);

  // Saved and loaded back.
  await wait(1100);
  const again = new SoundModes(r.dir, { state: () => r.st, cmd: r.cmd });
  await again.load();
  assert.equal(again.summary().native, 'DTS SURROUND');
});

test('the first file format is migrated: lists per decoder, probed cycles count as learned', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sound-modes-'));
  const three = (m: string) => Object.fromEntries(['MSMOVIE', 'MSMUSIC', 'MSGAME'].map((b) => [b, [m, 'MCH STEREO', 'STEREO']]));
  await fs.writeFile(path.join(dir, 'sound-modes.json'), JSON.stringify({
    names: { 'DTS HD MSTR': 'DTS-HD MSTR' },
    kinds: { pcm2: ['DOLBY AUDIO-DSUR'], dts: ['DTS HD+NEURAL:X', 'DTS HD MSTR', 'MONO MOVIE'] },
    native: { dts: 'DTS HD+NEURAL:X' },
    cycles: { pcm2: three('DOLBY AUDIO-DSUR'), atmos: three('DOLBY ATMOS') },
  }));
  const pcm = await rig(['SYSDA PCM', 'SSINFAISFOR 2/0/.0', 'MSSTEREO'], [], '', dir);
  assert.equal(pcm.sm.summary().canLearn, false); // probed
  const dts = await rig([...DTS_HD, 'MSSTEREO'], [], '', dir);
  assert.deepEqual(surround(dts.sm).slice(0, 3), ['DTS HD+NEURAL:X', 'DTS HD MSTR', 'MONO MOVIE']);
  assert.equal(dts.sm.summary().native, 'DTS HD+NEURAL:X');
  assert.equal(dts.sm.summary().canLearn, true); // cycled with the remote, but no full cycles recorded
});

test('nothing happens while the main zone is off, or while another change runs', async () => {
  const r = await rig(['SYSDA PCM', 'SSINFAISFOR 2/0/.0', 'MSSTEREO', 'ZMOFF'], ['DOLBY AUDIO-DSUR', 'MCH STEREO', 'STEREO'], 'DOLBY AUDIO-DSUR');
  assert.equal((await r.sm.select({ exact: 'DIRECT' })).note, 'main zone is off');
  assert.equal((await r.sm.learn()).note, 'main zone is off');
  applyLine(r.st, 'ZMON');
  r.sm.busy = 'select';
  assert.match((await r.sm.select({ exact: 'DIRECT' })).note!, /in progress/);
  assert.deepEqual(r.sent, []);
});

test('like the real buttons: a press that only shows the mode is followed by two presses a second apart', async () => {
  // What happened on 2026-11-14: DTS-HD MSTR playing, the Movie button remembering it, Neural:X two modes on.
  const cycle = ['DTS HD+DSUR', 'DTS HD+NEURAL:X', 'MCH STEREO', 'VIDEO GAME', 'VIRTUAL', 'STEREO', 'DTS HD MSTR'];
  const mem = { MSMOVIE: 'DTS HD MSTR', MSMUSIC: 'DTS HD MSTR', MSGAME: 'DTS HD MSTR' };
  const r = await rig([...DTS_HD, 'MSDTS HD MSTR'], cycle, '', undefined, mem);
  assert.deepEqual(await r.sm.select({ exact: 'DTS HD+NEURAL:X' }), { ok: true, mode: 'DTS HD+NEURAL:X' });
  assert.deepEqual(r.moves, ['DTS HD+DSUR', 'DTS HD+NEURAL:X']); // never more than one move per step
  assert.ok(!r.sent.some((c) => /DOLBY DIGITAL|DTS SURROUND/.test(c))); // no native command with DTS-HD

  // Learn modes from there: every button's whole cycle, not just the mode it showed.
  const res = await r.sm.learn();
  assert.equal(res.ok, true);
  assert.deepEqual([...res.modes].sort(), ['DTS HD MSTR', 'DTS HD+DSUR', 'DTS HD+NEURAL:X', 'VIDEO GAME', 'VIRTUAL']);
  assert.equal(r.st.surround, 'DTS HD+NEURAL:X');
});

test('a native-mode command that is ignored is noted, and the buttons are used instead', async () => {
  const r = await rig(['SYSDA PCM', 'SSINFAISFOR 2/0/.0', 'MSSTEREO'], ['DOLBY AUDIO-DSUR', 'MCH STEREO', 'STEREO'], '');
  assert.deepEqual(await r.sm.select({ exact: 'DOLBY AUDIO-DSUR' }), { ok: true, mode: 'DOLBY AUDIO-DSUR' });
  assert.equal(r.sent[0], 'MSDOLBY DIGITAL');
  assert.equal(r.sm.summary().native, null);
  r.sent.length = 0;
  await r.sm.select({ exact: 'STEREO' });
  await r.sm.select({ exact: 'DOLBY AUDIO-DSUR' });
  assert.ok(!r.sent.includes('MSDOLBY DIGITAL')); // not tried again
});

test('display names: only a code and a name that arrive together, with the same first word', async () => {
  const r = await rig([...DTS_HD, 'MSDTS HD MSTR'], [], '');
  const line = (l: string) => { applyLine(r.st, l); r.sm.onLine(l); };
  line('MSVIDEO GAME');
  r.clock.now += 1500;
  line('SYSMIVirtual'); // the next mode's name, before its code: not paired with Video Game
  line('MSVIRTUAL');
  assert.equal(r.sm.label('VIDEO GAME'), 'Video Game');
  assert.equal(r.sm.label('VIRTUAL'), 'Virtual');
  line('SYSMIDTS-HD + Neural:X'); // arrives right after a code it doesn't fit
  assert.equal(r.sm.label('VIRTUAL'), 'Virtual');
});

test('data saved by the earlier bugs is cleaned up on load', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sound-modes-'));
  await fs.writeFile(path.join(dir, 'sound-modes.json'), JSON.stringify({ version: 2,
    names: { 'VIDEO GAME': 'Virtual', VIRTUAL: 'Virtual' },
    signals: { 'DTS-HDMSTR': { modes: ['DTS HD+NEURAL:X', 'VIDEO GAME'], native: 'DTS HD+NEURAL:X',
      cycles: { MSMOVIE: ['DTS HD MSTR'], MSMUSIC: ['DTS HD MSTR'], MSGAME: ['DTS HD+DSUR', 'DTS HD+NEURAL:X', 'STEREO'] },
      learnedFw: 'D400-9123-9071-9031' } } }));
  const r = await rig([...DTS_HD, 'MSDTS HD MSTR'], [], '', dir);
  assert.equal(r.sm.label('VIDEO GAME'), 'Video Game');
  assert.equal(r.sm.summary().canLearn, true); // the one-mode "cycles" were dropped
});

test('every known mode for the editor, grouped by the signals it was seen with', async () => {
  const r = await rig([...DTS_HD, 'MSDTS HD MSTR'], [], '');
  const all = r.sm.allModes();
  const find = (m: string) => all.find((x) => x.value === m);
  assert.equal(find('DOLBY AUDIO-DSUR')?.group, 'With Stereo PCM / Multi-channel PCM');
  assert.deepEqual(find('DTS HD+NEURAL:X'), { value: 'DTS HD+NEURAL:X', label: 'DTS-HD + Neural:X', group: 'With DTS-HD MSTR' });
  assert.deepEqual(all.slice(-5).map((x) => x.value), ['STEREO', 'MCH STEREO', 'DIRECT', 'PURE DIRECT', 'AUTO']);
  assert.equal(new Set(all.map((x) => x.value)).size, all.length); // each mode once
});

test('after an input change, a selection waits a little for the new signal', async () => {
  const cycle = ['DTS HD+DSUR', 'DTS HD+NEURAL:X', 'MCH STEREO', 'STEREO', 'DTS HD MSTR'];
  const r = await rig(['MSSTEREO'], cycle, ''); // no decoder yet
  const sm = new SoundModes(r.dir, {
    state: () => r.st, cmd: r.cmd, settleMs: 5, now: () => r.clock.now,
    sleep: async (ms) => { r.clock.now += ms; if (r.clock.now >= 1500 && !r.st.decoder) for (const l of DTS_HD) applyLine(r.st, l); },
  });
  await sm.load();
  const res = await sm.select({ text: 'neural' }, { waitSignalMs: 6000 });
  assert.equal(res.ok, true);
  assert.equal(r.st.surround, 'DTS HD+NEURAL:X');
});
