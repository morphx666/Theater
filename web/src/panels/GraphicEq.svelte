<script>
  import { avr, toast } from '../lib/avr.svelte.js';
  import { useSetup } from '../lib/useSetup.svelte.js';
  import { getXml, txt } from '../lib/setup.js';
  import Seg from '../lib/Seg.svelte';
  import Slider from '../lib/Slider.svelte';
  import Icon from '../lib/Icon.svelte';
  import Panel from '../lib/Panel.svelte';

  const geq = useSetup('audio', 10, { reloadDelay: 2000 });

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

<Panel id="graphic-eq" title="Graphic EQ" class="wide">
    {#snippet actions()}
      {#if geq.doc}<button class="switch" class:on={geqOn} aria-label="Graphic EQ" disabled={geq.saving}
        onclick={() => geq.write(`<GraphicEQ><Enable>${geqOn ? 2 : 1}</Enable></GraphicEQ>`)}></button>{/if}
    {/snippet}
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
  </Panel>

<style>
  .err { color: var(--bad); }
  .eq { display: grid; grid-template-columns: repeat(9, 1fr); gap: 4px; padding: 8px 0; overflow-x: auto; }
  .eq.off { opacity: 0.5; }
  .band { display: flex; flex-direction: column; align-items: center; gap: 6px; min-width: 34px; }
  .v { font-size: 11.5px; color: var(--accent); }
  .f { font-size: 11.5px; color: var(--muted); }
  .vert { writing-mode: vertical-lr; direction: rtl; width: 32px; height: 170px; }
  .vert::-webkit-slider-runnable-track { width: 6px; height: auto; background: var(--line); }
  .vert::-webkit-slider-thumb { margin-top: 0; margin-left: -5px; }
</style>
