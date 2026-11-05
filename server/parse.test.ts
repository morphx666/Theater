import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyLine, emptyState, volToDb, dbToVol, levelToDb, dbToLevel } from './parse.ts';
import { guard, effectiveCap } from './guard.ts';

// Real lines captured from the X1700H.
const CAPTURE = `PWON
MV375
MVMAX 91
SISAT/CBL
MSDOLBY AUDIO-DSUR
PSDRC OFF
PSLFE 00
PSBAS 53
PSTRE 56
PSTONE CTRL OFF
PSDYNEQ ON
PSMULTEQ:OFF
PSDYNVOL OFF
PSCINEMA EQ.OFF
SYSMI Dolby Audio - Dolby Surround
SYSDA PCM
PSSWL 47
CVFL 50
CVC 505
CVFDL 48
CVEND
SLPOFF
ECOAUTO
DIM DIM
Z2OFF
Z2SOURCE
Z240
SSFUNSAT/CBL Fire TV Stick
SSFUNMPLAY Kodi
SSFUN END
SSSODSAT/CBL USE
SSSODCD DEL
SSQSNZMAQS1 Fire TV Stick
SSQSNZMAQS2
SSLEVC 53
SSVCTZMALIM OFF
SSVCTZMAPON LAS
SSINFAISFSV 48K
SSINFFRMAVR D400-9123-9071-9031
TFAN009490
TMANFM
SPPR 1
STBY15M
MSQUICK0`;

test('parses a real capture', () => {
  const st = emptyState();
  for (const l of CAPTURE.split('\n')) applyLine(st, l);
  assert.equal(st.power, true);
  assert.equal(st.volume, -42.5);
  assert.equal(st.volumeMax, 11);
  assert.equal(st.source, 'SAT/CBL');
  assert.equal(st.surround, 'DOLBY AUDIO-DSUR');
  assert.equal(st.ps['TONE CTRL'], 'OFF');
  assert.equal(st.ps['CINEMA EQ'], 'OFF');
  assert.equal(st.ps.MULTEQ, 'OFF');
  assert.equal(st.ps.BAS, '53');
  assert.equal(st.ps.SWL, '47');
  assert.deepEqual(st.channels, { FL: 0, C: 0.5, FDL: -2 });
  assert.equal(st.zone2.power, false);
  assert.equal(st.zone2.source, 'SOURCE');
  assert.equal(st.zone2.volume, -40);
  assert.equal(st.inputs['SAT/CBL'].name, 'Fire TV Stick');
  assert.equal(st.inputs['SAT/CBL'].hidden, false);
  assert.equal(st.inputs.CD.hidden, true);
  assert.deepEqual(st.quickNames, ['Fire TV Stick', '', '', '']);
  assert.equal(st.setupLevels.C, 3);
  assert.equal(st.volumeLimit, 'OFF');
  assert.equal(st.powerOnLevel, 'LAS');
  assert.equal(st.sampleRate, '48K');
  assert.equal(st.firmware.AVR, 'D400-9123-9071-9031');
  assert.equal(st.tuner.freq, '009490');
  assert.equal(st.sleep, 0);
  assert.equal(st.eco, 'AUTO');
  assert.equal(st.dimmer, 'DIM');
  assert.equal(st.quick, 0);
});

test('change detection', () => {
  const st = emptyState();
  assert.equal(applyLine(st, 'MV40'), true);
  assert.equal(applyLine(st, 'MV40'), false);
  assert.equal(applyLine(st, 'PSDYNEQ ON'), true);
  assert.equal(applyLine(st, 'PSDYNEQ ON'), false);
});

test('volume conversions', () => {
  assert.equal(volToDb('80'), 0);
  assert.equal(volToDb('375'), -42.5);
  assert.equal(dbToVol(-42.5), '375');
  assert.equal(dbToVol(-40), '40');
  assert.equal(dbToVol(-79.5), '005');
  assert.equal(dbToVol(50), '98');
  assert.equal(levelToDb('38'), -12);
  assert.equal(dbToLevel(1.5), '515');
  assert.equal(dbToLevel(99), '62');
});

test('guard blocks dangerous commands', () => {
  const st = emptyState();
  for (const c of ['SYRST', 'NSRBT', 'SYPANEL LOCK ON', 'FOO', 'MV40\rSYRST', 'SSFUN SAT/CBL x']) {
    assert.equal(guard(c, st, -10).ok, false, c);
  }
  assert.deepEqual(guard('psdyneq on', st, -10), { ok: true, cmd: 'PSDYNEQ ON' });
  assert.deepEqual(guard('SSFUN ?', st, -10), { ok: true, cmd: 'SSFUN ?' });
  assert.deepEqual(guard('SYMO', st, -10), { ok: true, cmd: 'SYMO' });
});

test('guard enforces the volume cap', () => {
  const st = emptyState();
  assert.deepEqual(guard('MV98', st, -10), { ok: true, cmd: 'MV70' });
  assert.deepEqual(guard('MV50', st, -10), { ok: true, cmd: 'MV50' });
  st.volume = -10;
  assert.equal(guard('MVUP', st, -10).ok, false);
  st.volume = -20;
  assert.equal(guard('MVUP', st, -10).ok, true);
  assert.deepEqual(guard('Z280', st, -10), { ok: true, cmd: 'Z270' });
  st.volumeLimit = '060';
  assert.equal(effectiveCap(-10, st), -20);
  st.volumeLimit = 'OFF';
  assert.equal(effectiveCap(-10, st), -10);
});

test('setup proxy strips dangerous extra params', async () => {
  const { safeExtra } = await import('./setup.ts');
  assert.deepEqual(safeExtra('general', 11, { opt1: '2' }), {});
  assert.deepEqual(safeExtra('audio', 9, { opt1: '1' }), {});
  assert.deepEqual(safeExtra('audio', 10, { opt1: '3', opt2: '9', evil: 'x' }), { opt1: '3', opt2: '0' });
  assert.deepEqual(safeExtra('audio', 10, { opt1: '2&type=11' }), {});
});

test('setup write validation', async () => {
  const { validateWrite } = await import('./setup.ts');
  const ok = (s: string, t: number, x: string) => assert.equal(validateWrite(s, t, x, -10), null, x);
  const bad = (s: string, t: number, x: string) => assert.notEqual(validateWrite(s, t, x, -10), null, x);
  ok('inputs', 3, '<Source index="5">Kodi</Source>');
  ok('speakers', 5, '<List><Speaker index="1">35</Speaker></List>');
  ok('audio', 7, '<Limit>70</Limit>');
  ok('audio', 7, '<PowerOnLevel>99</PowerOnLevel>');
  ok('audio', 7, '<PowerOnLevel>50</PowerOnLevel>');
  bad('audio', 7, '<PowerOnLevel>90</PowerOnLevel>');
  bad('general', 4, '<PowerOnVolume>85</PowerOnVolume>');
  bad('speakers', 5, '<SetDefaults></SetDefaults>');
  bad('audio', 10, '<GraphicEQ><SetDefaults>1</SetDefaults></GraphicEQ>');
  bad('globals', 8, '<SetupLock>1</SetupLock>');
  bad('inputs', 3, '<Hide index="1">2</Hide>');
  bad('inputs', 3, '<Source index="1">a</Source><Reboot>1</Reboot>');
  bad('general', 11, '<AutoUpdate>1</AutoUpdate>');
});
