<script>
  import { avr, toast } from './avr.svelte.js';
  import { useSetup } from './useSetup.svelte.js';
  import { getXml, txt } from './setup.js';
  import Seg from './Seg.svelte';
  import Slider from './Slider.svelte';
  import Icon from './Icon.svelte';

  const vol = useSetup('audio', 7);
  const z2 = useSetup('general', 4);
  const geq = useSetup('audio', 10, { reloadDelay: 2000 });

  // ---- Main zone volume settings ----
  const limit = $derived(txt(vol.doc, 'Limit'));
  const pon = $derived(txt(vol.doc, 'PowerOnLevel'));
  const mute = $derived(txt(vol.doc, 'MuteLevel'));
  const LIMITS = [{ value: '99', label: 'Off' }, { value: '60', label: '−20 dB' }, { value: '65', label: '−15 dB' },
    { value: '70', label: '−10 dB' }, { value: '75', label: '−5 dB' }, { value: '80', label: '0 dB' }];
  const ponMode = $derived(pon === '99' ? 'last' : pon === '0' ? 'mute' : 'fixed');
  const ponMax = $derived(Math.min(avr.cap, limit && limit !== '99' ? Number(limit) - 80 : 18));

  // ---- Zone 2 ----
  const z2node = (t) => z2.doc?.querySelector(t);
  const z2edit = (t) => z2node(t)?.getAttribute('display') === '3';

  // ---- Graphic EQ ----
  const BANDS = ['63Hz', '125Hz', '250Hz', '500Hz', '1kHz', '2kHz', '4kHz', '8kHz', '16kHz'];
  const LR_NAMES = ['Front L/R', 'Center', 'Surround L/R', 'Surround Back L/R', 'Front Wide L/R', 'Front Height L/R', 'Top Front L/R',
    'Top Middle L/R', 'Top Rear L/R', 'Surround Height L/R', 'Top Surround', 'Rear Height L/R', 'Front Dolby L/R', 'Surround Dolby L/R',
    'Back Dolby L/R', 'Surround Back', 'Center Height'];
  const EACH_NAMES = ['Front L', 'Front R', 'Center', 'Surround L', 'Surround R', 'Surround Back L', 'Surround Back R', 'Surround Back',
    'Front Wide L', 'Front Wide R', 'Front Height L', 'Front Height R', 'Top Front L', 'Top Front R', 'Top Middle L', 'Top Middle R',
    'Top Rear L', 'Top Rear R', 'Surround Height L', 'Surround Height R', 'Top Surround', 'Rear Height L', 'Front Dolby L', 'Front Dolby R',
    'Rear Height R', 'Surround Dolby L', 'Surround Dolby R', 'Back Dolby L', 'Back Dolby R', 'Center Height'];
  const geqOn = $derived(txt(geq.doc, ':scope > Enable') === '1');
  const selMode = $derived(txt(geq.doc, 'SpeakerSelection'));
  const channels = $derived.by(() => {
    const digits = txt(geq.doc, selMode === '2' ? 'SelectableSpeaker > Each' : 'SelectableSpeaker > LR') ?? '';
    const names = selMode === '2' ? EACH_NAMES : LR_NAMES;
    return [...digits].map((d, i) => ({ code: String(i), name: names[i] ?? `Ch ${i}`, ok: d === '3' })).filter((c) => c.ok);
  });
  const channel = $derived(txt(geq.doc, 'AdjustEQ > Channel') ?? '0');
  const isDolby = $derived(/Dolby/.test((selMode === '2' ? EACH_NAMES : LR_NAMES)[Number(channel)] ?? ''));
  let curve = $state(null); // local edits (dB)
  $effect(() => {
    if (geq.doc) curve = BANDS.map((b) => Number(txt(geq.doc, `AdjustEQ > Eq${b}`) ?? 0) / 10);
  });
  const dirty = $derived(curve && geq.doc && curve.some((v, i) => v !== Number(txt(geq.doc, `AdjustEQ > Eq${BANDS[i]}`) ?? 0) / 10));

  async function pickChannel(code) {
    try { geq.doc = await getXml('audio', 10, { opt1: code, opt2: '0' }); } catch (e) { toast(e.message, 'error'); }
  }
  async function saveCurve() {
    const bands = BANDS.map((b, i) => `<Eq${b}>${isDolby && i >= 5 ? 0 : Math.round(curve[i] * 10)}</Eq${b}>`).join('');
    const ok = await geq.write(`<GraphicEQ><AdjustEQ><Channel>${channel}</Channel>${bands}</AdjustEQ></GraphicEQ>`, { delay: 1000 });
    if (ok) pickChannel(channel);
  }
  function setBand(i, v) { curve[i] = v; }
</script>

<div class="cols">
  <section class="card">
    <h2>Volume — Main Zone</h2>
    {#if vol.error}<p class="err">{vol.error}</p>{/if}
    {#if vol.doc}
      <div class="setting stack">
        <div><div class="label">Volume limit</div>
          <div class="hint">The receiver itself will never go louder than this — from any remote, app or the knob.</div></div>
        <Seg value={LIMITS.some((l) => l.value === limit) ? limit : null} options={LIMITS} disabled={vol.saving}
          onchange={(v) => vol.write(`<Limit>${v}</Limit>`)} />
        {#if limit === '99'}<div class="warn small"><Icon name="info" size={16} />No limit set — the knob can reach +18 dB. A limit of −10 dB is a sensible safety net.</div>{/if}
      </div>
      <div class="setting stack">
        <div><div class="label">Power-on volume</div><div class="hint">Volume when the receiver turns on</div></div>
        <Seg value={ponMode} disabled={vol.saving}
          options={[{ value: 'last', label: 'Last used' }, { value: 'mute', label: 'Muted' }, { value: 'fixed', label: 'Fixed' }]}
          onchange={(v) => vol.write(`<PowerOnLevel>${v === 'last' ? 99 : v === 'mute' ? 0 : 40}</PowerOnLevel>`)} />
        {#if ponMode === 'fixed'}
          <Slider min={-79} max={ponMax} step={1} value={Number(pon) - 80} format={(v) => v + ' dB'}
            onchange={(v) => vol.write(`<PowerOnLevel>${v + 80}</PowerOnLevel>`, { quiet: true })} />
        {/if}
      </div>
      <div class="setting stack">
        <div><div class="label">Mute level</div><div class="hint">How much “mute” turns it down</div></div>
        <Seg value={mute} disabled={vol.saving} onchange={(v) => vol.write(`<MuteLevel>${v}</MuteLevel>`)}
          options={[{ value: '1', label: 'Full' }, { value: '3', label: '−40 dB' }, { value: '2', label: '−20 dB' }]} />
      </div>
    {/if}
  </section>

  <section class="card">
    <h2>Volume — Zone 2</h2>
    {#if z2.error}<p class="err">{z2.error}</p>{/if}
    {#if z2.doc}
      {#if z2edit('VolumeLimit')}
        <div class="setting stack">
          <div class="label">Volume limit</div>
          <Seg value={txt(z2.doc, 'VolumeLimit')} disabled={z2.saving} onchange={(v) => z2.write(`<VolumeLimit>${v}</VolumeLimit>`)}
            options={[{ value: '1', label: 'Off' }, { value: '2', label: '−20 dB' }, { value: '3', label: '−10 dB' }, { value: '4', label: '0 dB' }]} />
        </div>
      {/if}
      {#if z2edit('PowerOnVolume')}
        <div class="setting stack">
          <div class="label">Power-on volume</div>
          <Seg value={txt(z2.doc, 'PowerOnVolume') === '99' ? 'last' : txt(z2.doc, 'PowerOnVolume') === '0' ? 'mute' : 'fixed'} disabled={z2.saving}
            options={[{ value: 'last', label: 'Last used' }, { value: 'mute', label: 'Muted' }, { value: 'fixed', label: 'Fixed' }]}
            onchange={(v) => z2.write(`<PowerOnVolume>${v === 'last' ? 99 : v === 'mute' ? 0 : 40}</PowerOnVolume>`)} />
        </div>
      {/if}
      {#if z2edit('VolumeLevel')}
        <div class="setting">
          <div><div class="label">Variable volume</div><div class="hint">Off = fixed line-level output (for an external amp)</div></div>
          <span class="pill">{txt(z2.doc, 'VolumeLevel') === '99' ? 'Variable' : 'Fixed ' + (Number(txt(z2.doc, 'VolumeLevel')) - 80) + ' dB'}</span>
        </div>
      {/if}
    {/if}
  </section>

  <section class="card wide">
    <h2>Graphic EQ
      {#if geq.doc}<button class="switch" class:on={geqOn} aria-label="Graphic EQ" disabled={geq.saving}
        onclick={() => geq.write(`<GraphicEQ><Enable>${geqOn ? 2 : 1}</Enable></GraphicEQ>`)}></button>{/if}
    </h2>
    {#if geq.error}<p class="err">{geq.error}</p>{/if}
    {#if geq.doc}
      <p class="muted small" style="margin:-6px 0 12px">Manual per-speaker EQ (used when Audyssey MultEQ is off).</p>
      <div class="row wrap" style="gap:12px;margin-bottom:12px">
        <Seg value={selMode} disabled={geq.saving || !geqOn} onchange={(v) => geq.write(`<GraphicEQ><SpeakerSelection>${v}</SpeakerSelection></GraphicEQ>`)}
          options={[{ value: '1', label: 'All' }, { value: '3', label: 'L/R pairs' }, { value: '2', label: 'Each' }]} />
        {#if selMode !== '1'}
          <select style="max-width:240px" value={channel} disabled={!geqOn} onchange={(e) => pickChannel(e.currentTarget.value)}>
            {#each channels as c}<option value={c.code}>{c.name}</option>{/each}
          </select>
        {/if}
      </div>
      {#if curve}
        <div class="eq" class:off={!geqOn}>
          {#each BANDS as b, i}
            {@const locked = !geqOn || (isDolby && i >= 5)}
            <div class="band">
              <span class="v mono">{curve[i] > 0 ? '+' : ''}{curve[i].toFixed(1)}</span>
              <input type="range" class="vert" min="-20" max="6" step="0.5" value={curve[i]} disabled={locked}
                aria-label="{b} gain" oninput={(e) => setBand(i, Number(e.currentTarget.value))} />
              <span class="f">{b.replace('Hz', '')}</span>
            </div>
          {/each}
        </div>
        {#if isDolby}<p class="faint small">Dolby (up-firing) speakers only use the 63 Hz–1 kHz bands.</p>{/if}
        <div class="row" style="justify-content:flex-end;margin-top:10px">
          <button class="btn" disabled={!dirty} onclick={() => pickChannel(channel)}>Revert</button>
          <button class="btn" disabled={!geqOn} onclick={() => (curve = BANDS.map(() => 0))}>Flatten</button>
          <button class="btn primary" disabled={!dirty || geq.saving} onclick={saveCurve}><Icon name="save" size={18} />Apply</button>
        </div>
      {/if}
    {/if}
  </section>
</div>

<style>
  .cols { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); align-items: start; }
  .wide { grid-column: 1 / -1; }
  .err { color: var(--bad); }
  .warn { display: flex; gap: 8px; align-items: center; color: var(--accent); }
  .eq { display: grid; grid-template-columns: repeat(9, 1fr); gap: 4px; padding: 8px 0; overflow-x: auto; }
  .eq.off { opacity: 0.5; }
  .band { display: flex; flex-direction: column; align-items: center; gap: 6px; min-width: 34px; }
  .v { font-size: 11.5px; color: var(--accent); }
  .f { font-size: 11.5px; color: var(--muted); }
  .vert { writing-mode: vertical-lr; direction: rtl; width: 32px; height: 170px; }
  .vert::-webkit-slider-runnable-track { width: 6px; height: auto; background: var(--line); }
  .vert::-webkit-slider-thumb { margin-top: 0; margin-left: -8px; }
</style>
