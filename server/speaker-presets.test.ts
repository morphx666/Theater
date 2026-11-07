import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import {
  parseAmp, parseConfig, parseDistances, parseLevels, parseCrossovers, parseBass, parseFrontSpeaker, parseAudyssey, parseGeq,
  configWrites, levelsPayload, distancesPayload, crossoverWrites, geqCurvePayload, groupsForPage, normalizeStore, layoutOf,
  SpeakerPresets, PresetError,
} from './speaker-presets.ts';

// Real responses from the X1700H (Preset 1, 2026-11-06).
const XML: Record<string, string> = {
  'speakers/2': '<AmpAssign><AmpType mode="0" display="3">3</AmpType><AssignMode mode="1">10</AssignMode><SpeakerFor display="1"/><FloorLayout display="1"/><HeightSpeaker display="1"/><ThreeTiersHeightLayout display="1"/><CustomSettings display="1"/><HeightLayout display="1"/><Preout display="1"/><TopSurrOut display="1"/></AmpAssign>',
  'speakers/3': '<SpeakerConfig><Speaker index="0"><Value>2</Value><List>2</List><List>3</List></Speaker><Speaker index="1"><Value>2</Value><List>1</List><List>2</List></Speaker><Speaker index="2"><Value>4</Value><List>5</List><List>4</List></Speaker><Speaker index="3"><Value>2</Value><List>1</List><List>2</List></Speaker><Speaker index="8"><Value>2</Value><List>1</List><List>2</List></Speaker></SpeakerConfig>',
  'speakers/4': '<Distances mode="normal"><Unit>2</Unit><MsecMax>50</MsecMax><Step>1</Step><SubwooferType><MaxNumber>1</MaxNumber><CurrentNumber>4</CurrentNumber><Mode>0</Mode><Layout>0</Layout></SubwooferType><SpeakerPreset display="3"/><M2FConvertRatio>3000</M2FConvertRatio><Dirac display="1"/><List><Speaker index="0" display="3">228</Speaker><Speaker index="1" display="3">228</Speaker><Speaker index="2" display="3">216</Speaker><Speaker index="3" display="3">225</Speaker><Speaker index="7" display="3">204</Speaker><Speaker index="8" display="3">204</Speaker><Speaker index="16" display="3">228</Speaker><Speaker index="17" display="3">228</Speaker></List><DolbySpeakerSetup display="3"><Speaker index="0" display="3">174</Speaker></DolbySpeakerSetup></Distances>',
  'speakers/5': '<Levels mode="normal"><SubwooferType><MaxNumber>1</MaxNumber><CurrentNumber>4</CurrentNumber><Mode>0</Mode><Layout>0</Layout></SubwooferType><Dirac display="1"/><SpeakerPreset display="3"/><List><Speaker index="0" display="3">0</Speaker><Speaker index="1" display="3">30</Speaker><Speaker index="2" display="3">0</Speaker><Speaker index="4" display="3">40</Speaker><Speaker index="8" display="3">40</Speaker><Speaker index="11" display="3">40</Speaker><Speaker index="26" display="3">40</Speaker><Speaker index="30" display="3">-30</Speaker></List></Levels>',
  'speakers/6': '<Crossovers mode="normal"><SpeakerPreset display="3"/><Selection display="3">2</Selection><All display="2">80</All><List><Speaker index="0" display="3">80</Speaker><Speaker index="1" display="3">100</Speaker><Speaker index="2" display="3">90</Speaker><Speaker index="6" display="3">80</Speaker></List><SelectableValue><List><Item>40</Item><Item>60</Item><Item>80</Item><Item>90</Item><Item>100</Item><Item>110</Item><Item>120</Item><Item>150</Item><Item>180</Item><Item>200</Item><Item>250</Item></List></SelectableValue></Crossovers>',
  'speakers/7': '<Bass><SubwooferMode display="3">1</SubwooferMode><LPFforLFE display="3">120</LPFforLFE><SelectableValue><LPFforLFE><List><Item>80</Item><Item>90</Item><Item>100</Item><Item>110</Item><Item>120</Item><Item>150</Item><Item>180</Item><Item>200</Item><Item>250</Item></List></LPFforLFE></SelectableValue></Bass>',
  'speakers/8': '<FrontSpeaker>1<SpeakerPreset display="3"/></FrontSpeaker>',
  'audio/9': '<Audyssey><Setup>2</Setup><SpeakerPreset display="3"/><MultEQ group="2" display="3">4</MultEQ><LRBypass>2</LRBypass><DynamicEQ display="2" gray="0">2</DynamicEQ><ReferenceLevelOffset display="2" gray="4">0</ReferenceLevelOffset><DynamicVolume display="2" gray="0">4</DynamicVolume><AudysseyLFC display="1">0</AudysseyLFC></Audyssey>',
  'audio/10': '<GraphicEQ><Headphone><Inserted>2</Inserted><Enable>2</Enable><SpeakerPreset display="3"/></Headphone><Enable>1</Enable><SpeakerPreset display="3"/><SpeakerSelection display="3">3</SpeakerSelection><SelectableSpeaker><LR>33311111111131111</LR></SelectableSpeaker><AdjustEQ display="3"><Channel display="3">0</Channel><Eq63Hz>0</Eq63Hz><Eq125Hz>0</Eq125Hz><Eq250Hz>0</Eq250Hz><Eq500Hz>0</Eq500Hz><Eq1kHz>0</Eq1kHz><Eq2kHz>0</Eq2kHz><Eq4kHz>10</Eq4kHz><Eq8kHz>30</Eq8kHz><Eq16kHz>60</Eq16kHz></AdjustEQ><CurveCopy display="1"/></GraphicEQ>',
};

test('speaker preset pages parse', () => {
  assert.deepEqual(parseAmp(XML['speakers/2']), { type: 3, mode: 10 });
  assert.deepEqual(parseConfig(XML['speakers/3'])['1'], { value: 2, options: [1, 2] });
  assert.equal(Object.keys(parseConfig(XML['speakers/3'])).join(), '0,1,2,3,8');
  const d = parseDistances(XML['speakers/4']);
  assert.equal(d.unit, 2);
  assert.equal(d.list['16'].value, 228);
  assert.equal(Object.keys(d.list).length, 8);
  assert.deepEqual(Object.keys(d.dolby), ['0']); // Dolby speaker-to-ceiling is separate from the main list
  assert.equal(parseLevels(XML['speakers/5'])['30'].value, -30);
  const x = parseCrossovers(XML['speakers/6']);
  assert.equal(x.selection.value, 2);
  assert.equal(x.all.display, '2');
  assert.equal(Object.keys(x.list).join(), '0,1,2,6'); // not the SelectableValue items
  assert.equal(x.values.length, 11);
  const b = parseBass(XML['speakers/7']);
  assert.equal(b.lpf.value, 120); // the leaf, not the SelectableValue <LPFforLFE> list
  assert.equal(b.lpfValues.at(-1), 250);
  assert.equal(parseFrontSpeaker(XML['speakers/8']), 1);
  const a = parseAudyssey(XML['audio/9']);
  assert.deepEqual([a.multEq.value, a.multEq.display, a.dynamicEq.display, a.lrBypass], [4, '3', '2', 2]);
  const g = parseGeq(XML['audio/10']);
  assert.equal(g.enable.value, 1); // top level, not the headphone one
  assert.equal(g.headphones, false);
  assert.deepEqual(g.channels, ['0', '1', '2', '12']);
  assert.deepEqual(g.adjust, { display: '3', channel: 0, bands: [0, 0, 0, 0, 0, 0, 10, 30, 60] });
});

test('speaker preset payloads contain only what differs', () => {
  const lv = parseLevels(XML['speakers/5']);
  assert.equal(levelsPayload({ 0: 0, 1: 30 }, lv), null);
  assert.equal(levelsPayload({ 1: 20, 30: -100, 99: 5 }, lv), '<List><Speaker index="1">20</Speaker><Speaker index="30">-100</Speaker></List>');
  assert.equal(levelsPayload({ 1: 500 }, lv), '<List><Speaker index="1">120</Speaker></List>'); // clamped to +12 dB

  const d = parseDistances(XML['speakers/4']);
  assert.equal(distancesPayload({ list: { 0: 228 }, dolby: { 0: 174 } }, d), null);
  assert.equal(distancesPayload({ list: { 2: 210 }, dolby: { 0: 180 } }, d),
    '<Distances><List><Speaker index="2">210</Speaker></List><DolbySpeakerSetup><Speaker index="0">180</Speaker></DolbySpeakerSetup></Distances>');

  const cfg = parseConfig(XML['speakers/3']);
  assert.deepEqual(configWrites({ 1: 1, 2: 5, 3: 3 }, cfg), ['<Speaker index="1">1</Speaker>', '<Speaker index="2">5</Speaker>']); // 3=Large not offered
  assert.deepEqual(configWrites({ 2: 4, 8: 1 }, { ...cfg, 2: { value: 5, options: [5, 4] } }),
    ['<Speaker index="2">4</Speaker>', '<Speaker index="8">1</Speaker>']); // subwoofer added first

  const x = parseCrossovers(XML['speakers/6']);
  assert.deepEqual(crossoverWrites({ selection: 2, all: 80, list: { 0: 80, 1: 120, 2: 95 } }, x), ['<Speaker index="1">120</Speaker>']); // 95 Hz isn't offered
  assert.deepEqual(crossoverWrites({ selection: 1, all: 120, list: {} }, { ...x, selection: { value: 1, display: '3' }, all: { value: 80, display: '3' } }), ['<All>120</All>']);

  assert.equal(geqCurvePayload('12', [10, 0, 0, 0, 0, 30, 30, 30, 30], true),
    '<GraphicEQ><AdjustEQ><Channel>12</Channel><Eq63Hz>10</Eq63Hz><Eq125Hz>0</Eq125Hz><Eq250Hz>0</Eq250Hz><Eq500Hz>0</Eq500Hz><Eq1kHz>0</Eq1kHz><Eq2kHz>0</Eq2kHz><Eq4kHz>0</Eq4kHz><Eq8kHz>0</Eq8kHz><Eq16kHz>0</Eq16kHz></AdjustEQ></GraphicEQ>');
});

test('speaker preset helpers', () => {
  assert.deepEqual(groupsForPage('speakers/5'), ['levels']);
  assert.ok(groupsForPage('speakers/3').includes('graphicEq')); // config changes which channels everything has
  assert.deepEqual(groupsForPage('inputs/3'), []);
  assert.equal(layoutOf(['FL', 'C', 'FR', 'SR', 'SL', 'FDR', 'FDL', 'SW']), '5.1.2');
  const s = normalizeStore({ presets: [{ id: 'a', name: ' Movie ', slot: 1 }, { id: 'a', name: 'dup', slot: 1 }, { id: 'b', name: '', slot: 1 },
    { id: 'c', name: 'x', slot: 3 }], active: 'a', slotOwner: { 1: 'a', 2: 'zzz' } });
  assert.deepEqual(s.presets.map((p) => p.name), ['Movie']);
  assert.deepEqual(s.slotOwner, { 1: 'a', 2: null });
});

/** A receiver with two slots that differ in levels and Amp Assign; enough to drive the engine. */
function fakeReceiver() {
  const slots: Record<number, Record<string, string>> = {
    1: { 'speakers/5': XML['speakers/5'], 'speakers/2': XML['speakers/2'] },
    2: { 'speakers/5': XML['speakers/5'].replace('index="1" display="3">30', 'index="1" display="3">20'), 'speakers/2': XML['speakers/2'] },
  };
  const r = {
    slot: 1, writes: [] as string[], cmds: [] as string[], muted: false,
    io: {
      async get(section: string, type: number) {
        const page = `${section}/${type}`;
        if (page === 'globals/10') return `<SpeakerPreset>${r.slot}</SpeakerPreset>`;
        return slots[r.slot][page] ?? XML[page];
      },
      async set(section: string, type: number, xml: string) {
        r.writes.push(`${section}/${type} ${xml}`);
        if (section === 'speakers' && type === 11) r.slot = Number(xml.match(/\d/)![0]);
        if (section === 'speakers' && type === 5) {
          for (const m of xml.matchAll(/index="(\d+)">(-?\d+)</g)) {
            slots[r.slot]['speakers/5'] = slots[r.slot]['speakers/5'].replace(new RegExp(`(index="${m[1]}" display="3">)-?\\d+`), `$1${m[2]}`);
          }
        }
        if (section === 'speakers' && type === 2) slots[r.slot]['speakers/2'] = XML['speakers/2'].replace('>10</AssignMode>', `>${xml.match(/>(\d+)</)![1]}</AssignMode>`);
      },
      cmd(c: string) { r.cmds.push(c); if (c === 'MUON') r.muted = true; if (c === 'MUOFF') r.muted = false; },
      wait: async () => {},
    },
  };
  return r;
}

test('speaker presets: first sync, create, apply onto a slot, native switch, auto-save', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'presets-'));
  const r = fakeReceiver();
  const e = new SpeakerPresets(dir, {
    io: r.io, zoneOn: () => true, muted: () => r.muted, log: () => {}, changed: () => {}, applied: () => {},
    levelCodes: (lv) => Object.keys(lv),
  });
  await e.load();
  await e.sync();
  const [p1, p2] = e.store.presets;
  assert.deepEqual([p1.name, p2.name, e.store.active], ['Preset 1', 'Preset 2', p1.id]);
  assert.equal(p1.values?.levels?.['1'], 30);
  assert.equal(p2.values, null); // the other slot is read on first use (switching is audible)

  // A new preset copies the active one; give it its own center level.
  const movie = await e.create('Movie', undefined, undefined);
  assert.equal(movie.slot, 1);
  movie.values!.levels!['1'] = 50;
  await assert.rejects(e.create('movie', undefined, undefined), /exists/);

  // Preset 2 owns slot 2: a plain switch, no value writes, no mute; it gets read on arrival.
  r.writes = [];
  await e.apply(p2.id);
  assert.deepEqual(r.writes, ['speakers/11 <SpeakerPreset>2</SpeakerPreset>']);
  assert.deepEqual(r.cmds, []);
  assert.equal(p2.values?.levels?.['1'], 20);

  // Movie is written onto slot 1 (owned by Preset 1, already read): only the differing level, muted meanwhile.
  r.writes = [];
  await e.apply(movie.id);
  assert.deepEqual(r.writes, ['speakers/11 <SpeakerPreset>1</SpeakerPreset>', 'speakers/5 <List><Speaker index="1">50</Speaker></List>']);
  assert.deepEqual(r.cmds, ['MUON', 'MUOFF']);
  assert.equal(e.store.slotOwner['1'], movie.id);
  assert.equal(e.store.active, movie.id);
  assert.equal(e.store.incomplete, null);
  assert.equal(p1.values?.levels?.['1'], 30); // Preset 1's own copy is untouched

  // Auto-save: an edit on the receiver's level page lands in the active preset.
  await r.io.set('speakers', 5, '<List><Speaker index="1">45</Speaker></List>');
  e.noteWrite('speakers', 5);
  await (e as any).flushStale();
  assert.equal(movie.values?.levels?.['1'], 45);

  // Back to Preset 1: its values are rewritten into slot 1.
  r.writes = [];
  r.cmds = [];
  await e.apply(p1.id);
  assert.deepEqual(r.writes, ['speakers/5 <List><Speaker index="1">30</Speaker></List>']);

  // Amp Assign changes need confirmation; nothing is written before it.
  p2.values!.ampAssign = { mode: 6 };
  r.writes = [];
  await assert.rejects(e.apply(p2.id), (err: PresetError) => err.status === 409 && err.confirm?.to === 6 && err.confirm?.from === 10);
  assert.deepEqual(r.writes, []);
  assert.equal(e.busy, null);

  // Can't delete the active preset; deleting another frees its slot.
  await assert.rejects(e.remove(p1.id), /another preset/);
  await e.remove(movie.id);
  assert.equal(e.store.presets.length, 2);

  // The file round-trips.
  const again = new SpeakerPresets(dir, { ...(e as any).deps });
  await again.load();
  assert.deepEqual(again.store, e.store);
  await fs.rm(dir, { recursive: true, force: true });
});
