<script>
  import { untrack } from 'svelte';
  import { useSetup } from '../lib/useSetup.svelte.js';
  import { txt, editable } from '../lib/setup.js';
  import Seg from '../lib/Seg.svelte';
  import Icon from '../lib/Icon.svelte';
  import Slider from '../lib/Slider.svelte';
  import Panel from '../lib/Panel.svelte';
  import { remember } from '../lib/remember.js';
  import { avr } from '../lib/avr.svelte.js';
  import { AMP_MODES, presetName } from '../lib/speakerPresets.svelte.js';
  import PresetPicker from '../lib/PresetPicker.svelte';

  const config = useSetup('speakers', 3);
  const dist = useSetup('speakers', 4);
  const levels = useSetup('speakers', 5);
  const xo = useSetup('speakers', 6);
  const bass = useSetup('speakers', 7);
  const amp = useSetup('speakers', 2, { reloadDelay: 2000 });

  // Each speaker preset holds its own config, distances, levels, crossovers and bass (manual p.197), and the
  // config decides which speakers the other pages list. Re-read the affected pages after these changes, or
  // they keep showing the previous values.
  const reloadAll = (...pages) => Promise.all(pages.map((p) => p.reload()));
  // A speaker preset was applied (from any device): every page below changed.
  const sp = $derived(avr.speakerPresets);
  let seenRev = null;
  $effect(() => {
    const rev = sp?.rev;
    if (seenRev !== null && rev !== seenRev && !sp?.busy) untrack(() => { levelEdits = {}; distEdits = {}; reloadAll(amp, config, dist, levels, xo, bass); });
    if (!sp?.busy) seenRev = rev;
  });
  async function setConfig(idx, value) {
    if (await config.write(`<Speaker index="${idx}">${value}</Speaker>`)) reloadAll(dist, levels, xo, bass);
  }
  async function setSubwooferMode(v) {
    if (await bass.write(`<SubwooferMode>${v}</SubwooferMode>`)) xo.reload(); // crossovers depend on it (p.188)
  }
  const bassEditable = (tag) => editable(bass.doc?.querySelector(`:scope > ${tag}`));

  // Amp Assign: what the Surround Back / Height amp channels drive (manual p.187-188, AmpType 3 = 7ch).
  const ampMode = $derived(txt(amp.doc, 'AssignMode'));
  const ampSettable = $derived(txt(amp.doc, 'AmpType') === '3' && ampMode in AMP_MODES);
  let confirmAmp = $state(null);
  async function setAmp(v) {
    if (await amp.write(`<AmpAssign><AssignMode>${v}</AssignMode></AmpAssign>`)) reloadAll(config, dist, levels, xo, bass);
  }

  // Each setup page numbers channels differently (see docs/SETUP-API.md §4).
  const LEVEL_NAMES = ['Front L', 'Center', 'Front R', 'Front Wide R', 'Surround R', 'Surr. Back R', 'Surr. Back', 'Surr. Back L', 'Surround L',
    'Front Wide L', 'Front Height R', 'Front Dolby R', 'Top Front R', 'Top Middle R', 'Surr. Dolby R', 'Top Rear R', 'Surr. Height R',
    'Rear Height R', 'Back Dolby R', 'Back Dolby L', 'Rear Height L', 'Surr. Height L', 'Top Rear L', 'Surr. Dolby L', 'Top Middle L',
    'Top Front L', 'Front Dolby L', 'Front Height L', 'Center Height', 'Top Surround', 'Subwoofer', 'Subwoofer 2', '', 'Subwoofer 3', 'Subwoofer 4'];
  const DIST_NAMES = ['Front L', 'Front R', 'Center', 'Subwoofer', 'Subwoofer 2', 'Subwoofer 3', 'Subwoofer 4', 'Surround L', 'Surround R',
    'Surr. Back L', 'Surr. Back R', 'Surr. Back', 'Front Wide L', 'Front Wide R', 'Front Height L', 'Front Height R', 'Front Dolby L',
    'Front Dolby R', 'Top Front L', 'Top Front R', 'Top Middle L', 'Top Middle R', 'Surr. Dolby L', 'Surr. Dolby R', 'Top Rear L', 'Top Rear R',
    'Surr. Height L', 'Surr. Height R', 'Rear Height L', 'Rear Height R', 'Back Dolby L', 'Back Dolby R', 'Center Height', 'Top Surround'];
  const XO_NAMES = ['Front', 'Center', 'Surround', 'Surround Back', 'Front Wide', 'Front Height', 'Front Dolby', 'Top Front', 'Top Middle',
    'Surround Dolby', 'Top Rear', 'Surround Height', 'Rear Height', 'Back Dolby', 'Center Height', 'Top Surround'];
  const KIND_NAMES = ['Front', 'Center', 'Subwoofer', 'Surround', 'Surround Back', 'Surr. Back count', 'Front Wide', 'Front Height', 'Front Dolby',
    'Top Front', 'Top Middle', 'Surround Dolby', 'Top Rear', 'Surround Height', 'Rear Height', 'Back Dolby', 'Center Height', 'Top Surround'];
  const SIZE = { 1: 'None', 2: 'Small', 3: 'Large', 4: 'Yes', 5: 'No', 6: '1 spkr', 7: '2 spkrs', 8: '3 spkrs', 9: '4 spkrs' };
  const DOLBY_SETUP = ['Front Dolby', 'Surround Dolby', 'Back Dolby'];

  // ---------- distances ----------
  const unit = $derived(dist.doc?.querySelector(':scope > Unit')?.textContent.trim() ?? '2'); // 1 m, 2 ft, 3 ms
  const ratio = $derived(Number(txt(dist.doc, 'M2FConvertRatio') ?? 3000) / 1000);
  const fromRaw = (raw) => {
    if (unit === '1') return raw / 100;
    if (unit === '3') return raw / 10;
    if (ratio === 3) { const r = raw - (raw % 3); return Math.floor((r / 30) * 10) / 10; }
    return Number((raw / (ratio * 10)).toFixed(1));
  };
  const toRaw = (v) => (unit === '1' ? Math.round(v * 100) : unit === '3' ? Math.round(v * 10) : Math.min(1800, Math.round(v * ratio * 10)));
  const unitLabel = $derived(unit === '1' ? 'm' : unit === '3' ? 'ms' : 'ft');
  const unitStep = $derived(unit === '1' ? 0.01 : 0.1);

  let distEdits = $state({}); // key "L:idx" or "D:idx" -> display value
  const distRows = $derived([
    ...[...(dist.doc?.querySelectorAll(':scope > List > Speaker') ?? [])].map((n) => ({
      key: 'L:' + n.getAttribute('index'), idx: n.getAttribute('index'), name: DIST_NAMES[n.getAttribute('index')], raw: Number(n.textContent),
      edit: n.getAttribute('display') === '3', dolby: false,
    })),
    ...[...(dist.doc?.querySelectorAll('DolbySpeakerSetup > Speaker') ?? [])].map((n) => ({
      key: 'D:' + n.getAttribute('index'), idx: n.getAttribute('index'), name: DOLBY_SETUP[n.getAttribute('index')] + ' → ceiling', raw: Number(n.textContent),
      edit: n.getAttribute('display') === '3', dolby: true,
    })),
  ]);
  const distDirty = $derived(Object.keys(distEdits).length > 0);
  // Speaker distances: 0-18 m / 0-60 ft. Dolby speaker-to-ceiling: 0.90-3.30 m / 3.0-11.0 ft (manual p.193).
  const distRange = (r) => (r.dolby ? (unit === '1' ? [0.9, 3.3] : [3, 11]) : (unit === '1' ? [0, 18] : [0, 60]));
  function setDist(r, value) {
    const [lo, hi] = distRange(r);
    const v = Math.min(hi, Math.max(lo, value));
    if (v === fromRaw(r.raw)) delete distEdits[r.key]; else distEdits[r.key] = v;
  }
  const spreadOk = $derived.by(() => {
    const vals = distRows.filter((r) => !r.dolby).map((r) => (r.key in distEdits ? toRaw(distEdits[r.key]) : r.raw));
    return !vals.length || unit === '3' || Math.max(...vals) - Math.min(...vals) <= 600;
  });
  async function saveDist() {
    const main = distRows.filter((r) => !r.dolby && r.key in distEdits).map((r) => `<Speaker index="${r.idx}">${toRaw(distEdits[r.key])}</Speaker>`).join('');
    const dol = distRows.filter((r) => r.dolby && r.key in distEdits).map((r) => `<Speaker index="${r.idx}">${toRaw(distEdits[r.key])}</Speaker>`).join('');
    const xml = `<Distances>${main ? `<List>${main}</List>` : ''}${dol ? `<DolbySpeakerSetup>${dol}</DolbySpeakerSetup>` : ''}</Distances>`;
    if (await dist.write(xml)) distEdits = {};
  }

  // ---------- levels ----------
  let levelEdits = $state({}); // idx -> dB
  const levelRows = $derived([...(levels.doc?.querySelectorAll('List > Speaker') ?? [])].map((n) => ({
    idx: n.getAttribute('index'), name: LEVEL_NAMES[n.getAttribute('index')] ?? 'Ch ' + n.getAttribute('index'),
    db: Number(n.textContent) / 10, edit: n.getAttribute('display') === '3',
  })));
  const lv = (r) => (r.idx in levelEdits ? levelEdits[r.idx] : r.db);
  function setLevel(r, v) { if (v === r.db) delete levelEdits[r.idx]; else levelEdits[r.idx] = v; }
  async function saveLevels() {
    const xml = `<List>${Object.entries(levelEdits).map(([i, v]) => `<Speaker index="${i}">${Math.round(v * 10)}</Speaker>`).join('')}</List>`;
    if (await levels.write(xml)) levelEdits = {};
  }

  // ---------- crossovers ----------
  const xoValues = $derived([...(xo.doc?.querySelectorAll('SelectableValue Item') ?? [])].map((i) => i.textContent.trim()));
  const xoSel = $derived(txt(xo.doc, 'Selection'));
  const xoRows = $derived([...(xo.doc?.querySelectorAll(':scope > List > Speaker') ?? [])].map((n) => ({
    idx: n.getAttribute('index'), name: XO_NAMES[n.getAttribute('index')], hz: n.textContent.trim(), edit: n.getAttribute('display') === '3',
  })));
  const hz = (v) => (v === '0' ? 'Full band' : v + ' Hz');

  // ---------- speaker config ----------
  const kinds = $derived([...(config.doc?.querySelectorAll(':scope > Speaker') ?? [])].map((n) => ({
    idx: n.getAttribute('index'), name: KIND_NAMES[n.getAttribute('index')], value: txt(n, 'Value'),
    opts: [...n.querySelectorAll('List')].map((l) => l.textContent.trim()),
  })));
  let confirmCfg = $state(null);

  const fmt = (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}`;
</script>

<Panel id="speaker-setup" title="Speaker setup">
  <p class="muted small" style="margin:-6px 0 6px">Levels and distances apply when you press Save; everything else applies right away.</p>

  {#if sp?.list.length}
    <div class="setting">
      <div><div class="label">Speaker preset</div><div class="hint">{sp.busy ? sp.busy.step + '…'
        : sp.active ? `Edits below save to ${presetName(sp.active)}` : 'Edits below aren’t saved in a preset'}</div></div>
      <PresetPicker />
    </div>
  {/if}

  <details open use:remember={'speaker-setup.levels'}>
    <summary>Levels</summary>
    {#if levels.doc}
      <div class="rows">
        {#each levelRows as r (r.idx)}
          <div class="lvl" class:changed={r.idx in levelEdits}>
            <Slider label={r.name} min={-12} max={12} step={0.5} center disabled={!r.edit} value={lv(r)}
              format={(v) => fmt(v) + ' dB'} onchange={(v) => setLevel(r, v)} />
          </div>
        {/each}
      </div>
      <div class="actions">
        <button class="btn" disabled={!Object.keys(levelEdits).length} onclick={() => (levelEdits = {})}>Revert</button>
        <button class="btn primary" disabled={!Object.keys(levelEdits).length || levels.saving} onclick={saveLevels}><Icon name="save" size={18} />Save levels</button>
      </div>
    {/if}
  </details>

  <details open use:remember={'speaker-setup.distances'}>
    <summary>Distances <span class="faint">({unitLabel})</span></summary>
    {#if dist.doc}
      <div class="rows">
        {#each distRows as r (r.key)}
          <label class="r">
            <span>{r.name}</span>
            <input type="number" min={distRange(r)[0]} max={distRange(r)[1]} step={unitStep} disabled={!r.edit}
              value={r.key in distEdits ? distEdits[r.key] : fromRaw(r.raw)}
              onchange={(e) => setDist(r, Number(e.currentTarget.value))} />
          </label>
        {/each}
      </div>
      {#if unit !== '3'}
        <div class="row" style="margin-top:8px">
          <span class="small muted">Units</span>
          <Seg value={unit} disabled={dist.saving} onchange={(v) => dist.write(`<Unit>${v}</Unit>`)}
            options={[{ value: '2', label: 'Feet' }, { value: '1', label: 'Meters' }]} />
        </div>
      {/if}
      {#if !spreadOk}<p class="bad small">All speakers must be within {unit === '1' ? '6 m' : '20 ft'} of each other.</p>{/if}
      <div class="actions">
        <button class="btn" disabled={!distDirty} onclick={() => (distEdits = {})}>Revert</button>
        <button class="btn primary" disabled={!distDirty || !spreadOk || dist.saving} onclick={saveDist}><Icon name="save" size={18} />Save distances</button>
      </div>
    {/if}
  </details>

  <details use:remember={'speaker-setup.crossovers'}>
    <summary>Crossovers & bass</summary>
    {#if xo.doc}
      <div class="setting stack">
        <div class="label">Crossover setting</div>
        <Seg value={xoSel} disabled={xo.saving} onchange={(v) => xo.write(`<Selection>${v}</Selection>`, { delay: 1500 })}
          options={[{ value: '1', label: 'Same for all' }, { value: '2', label: 'Per speaker' }]} />
      </div>
      {#if xoSel === '1'}
        <label class="r"><span>All speakers</span>
          <select value={txt(xo.doc, 'All')} onchange={(e) => xo.write(`<All>${e.currentTarget.value}</All>`)}>
            {#each xoValues as v}<option value={v}>{hz(v)}</option>{/each}
          </select></label>
      {:else}
        {#each xoRows as r (r.idx)}
          <label class="r"><span>{r.name}</span>
            <select value={r.hz} disabled={!r.edit} onchange={(e) => xo.write(`<Speaker index="${r.idx}">${e.currentTarget.value}</Speaker>`)}>
              {#each xoValues as v}<option value={v}>{hz(v)}</option>{/each}
            </select></label>
        {/each}
      {/if}
    {/if}
    {#if bass.doc}
      <div class="setting stack">
        <div><div class="label">Subwoofer mode</div><div class="hint">{bassEditable('SubwooferMode')
          ? 'LFE + Main sends all bass to the sub'
          : 'Needs a subwoofer in the speaker config'}</div></div>
        <Seg value={txt(bass.doc, 'SubwooferMode')} disabled={bass.saving || !bassEditable('SubwooferMode')} onchange={setSubwooferMode}
          options={[{ value: '1', label: 'LFE' }, { value: '2', label: 'LFE + Main' }]} />
      </div>
      <label class="r"><span>LPF for LFE</span>
        <select value={txt(bass.doc, 'LPFforLFE')} disabled={bass.saving || !bassEditable('LPFforLFE')}
          onchange={(e) => bass.write(`<LPFforLFE>${e.currentTarget.value}</LPFforLFE>`)}>
          {#each [...bass.doc.querySelectorAll('SelectableValue LPFforLFE Item')].map((i) => i.textContent.trim()) as v}<option value={v}>{v} Hz</option>{/each}
        </select></label>
    {/if}
  </details>

  <details use:remember={'speaker-setup.config'}>
    <summary>Speaker configuration <span class="faint">(advanced)</span></summary>
    <p class="warn small"><Icon name="info" size={16} />Adding a speaker requires re-running Audyssey.</p>
    {#if amp.doc && ampMode}
      <label class="r amp"><span>Amp assign</span>
        {#if ampSettable}
          <select value={ampMode} disabled={amp.saving}
            onchange={(e) => { confirmAmp = e.currentTarget.value; e.currentTarget.value = ampMode; }}>
            {#each Object.entries(AMP_MODES) as [v, name]}<option value={v}>{name}</option>{/each}
          </select>
        {:else}<span class="muted">{AMP_MODES[ampMode] ?? 'Mode ' + ampMode}</span>{/if}
      </label>
    {/if}
    {#each kinds as k (k.idx)}
      <label class="r"><span>{k.name}</span>
        <select value={k.value} disabled={k.opts.length < 2 || config.saving}
          onchange={(e) => { confirmCfg = { k, value: e.currentTarget.value }; e.currentTarget.value = k.value; }}>
          {#each k.opts as o}<option value={o}>{SIZE[o] ?? o}</option>{/each}
        </select></label>
    {/each}
  </details>
</Panel>

{#if confirmAmp}
  <div class="modal" role="dialog" aria-modal="true">
    <div class="card">
      <h3>Set Amp Assign to “{AMP_MODES[confirmAmp]}”?</h3>
      <p class="warn"><Icon name="info" size={18} />Rewire your speakers to match first.</p>
      <p class="muted">This changes which speaker terminals the amps drive. With the wrong wiring, speakers can get the wrong signal and be damaged. The available channels change too, so re-run Audyssey afterward. The previous setting is backed up.</p>
      <div class="row" style="justify-content:flex-end">
        <button class="btn" onclick={() => (confirmAmp = null)}>Cancel</button>
        <button class="btn primary" onclick={() => { setAmp(confirmAmp); confirmAmp = null; }}>Change</button>
      </div>
    </div>
  </div>
{/if}

{#if confirmCfg}
  <div class="modal" role="dialog" aria-modal="true">
    <div class="card">
      <h3>Change {confirmCfg.k.name} to “{SIZE[confirmCfg.value]}”?</h3>
      <p class="muted">{confirmCfg.k.value === '1' ? 'Audyssey will be unavailable until you re-run it. ' : ''}The previous setup is backed up.</p>
      <div class="row" style="justify-content:flex-end">
        <button class="btn" onclick={() => (confirmCfg = null)}>Cancel</button>
        <button class="btn primary" onclick={() => { setConfig(confirmCfg.k.idx, confirmCfg.value); confirmCfg = null; }}>Change</button>
      </div>
    </div>
  </div>
{/if}

<style>
  details { border-top: 1px solid var(--line); padding: 12px 0 4px; }
  summary { cursor: pointer; font-weight: 650; padding-bottom: 8px; }
  .rows { display: grid; gap: 2px; }
  .r { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 5px 0; }
  .r input, .r select { width: 130px; flex: none; }
  .r.amp { border-bottom: 1px solid var(--line); padding-bottom: 10px; margin-bottom: 5px; }
  .lvl { padding: 4px 0 2px 10px; border-left: 3px solid transparent; }
  .lvl.changed { border-left-color: var(--accent); }
  .actions { display: flex; justify-content: flex-end; gap: 8px; margin: 10px 0 6px; }
  .warn { display: flex; gap: 8px; align-items: center; color: var(--accent); margin: 0 0 8px; }
  .bad { color: var(--bad); }
</style>
