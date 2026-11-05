<script>
  import { avr, send, toast } from '../lib/avr.svelte.js';
  import Icon from '../lib/Icon.svelte';
  import Panel from '../lib/Panel.svelte';
  import Seg from '../lib/Seg.svelte';
  import { remember } from '../lib/remember.js';

  const st = $derived(avr.state);
  const on = $derived(st.zoneMain === true);

  // Receiver frequencies are 6 digits: below 050000 it's FM in 10 kHz steps (009510 = 95.10 MHz), otherwise AM.
  function fmtFreq(raw) {
    const n = Number(raw);
    if (!raw || !Number.isFinite(n)) return '—';
    return n < 50000 ? `${(n / 100).toFixed(2)} MHz` : `${Math.round(n / 100)} kHz`;
  }
  const freq = $derived(fmtFreq(st.tuner?.freq));
  const presets = $derived(Object.entries(st.tuner?.presets ?? {}).sort(([a], [b]) => a.localeCompare(b)));
  // Preset(s) already holding the current station
  const here = $derived(presets.filter(([, p]) => p.freq === st.tuner?.freq).map(([n]) => n));

  let open = $state(false); // presets list expanded
  let saving = $state(false); // picking a slot for the current station
  let confirm = $state(null); // slot waiting for the second tap

  function startSave() { saving = true; confirm = null; open = true; }
  function cancelSave() { saving = false; confirm = null; }
  function tapSlot(n, p) {
    if (!saving) { send('TPAN' + n); return; }
    if (p.freq === st.tuner.freq) { toast(`Preset ${Number(n)} already has ${freq}`); cancelSave(); return; }
    if (confirm !== n) { confirm = n; return; }
    send('TPANMEM' + n);
    toast(`Saved ${freq} to preset ${Number(n)}`);
    cancelSave();
  }
</script>

<Panel id="tuner" title="Tuner">
  <div class="tuner">
    <div class="freq mono">{freq}</div>
    <div class="faint small">{st.tuner?.band ?? ''}{here.length ? ` · preset ${here.map(Number).join(', ')}` : ''}</div>
  </div>
  <div class="row keys">
    <button class="btn grow" disabled={!on} onclick={() => send('TFANDOWN')}><Icon name="left" />Tune</button>
    <button class="btn grow" disabled={!on} onclick={() => send('TFANUP')}>Tune<Icon name="right" /></button>
  </div>
  <div class="row keys">
    <button class="btn grow" disabled={!on} onclick={() => send('TPANDOWN')}><Icon name="left" />Preset</button>
    <button class="btn grow" disabled={!on} onclick={() => send('TPANUP')}>Preset<Icon name="right" /></button>
  </div>
  <div class="row keys">
    <Seg value={st.tuner?.band} onchange={(v) => send('TMAN' + v)} disabled={!on}
      options={[{ value: 'FM', label: 'FM' }, { value: 'AM', label: 'AM' }]} />
    <button class="btn grow" disabled={!on} onclick={() => send('SITUNER')}><Icon name="radio" size={18} />Listen</button>
  </div>
  <div class="row keys">
    {#if saving}
      <button class="btn grow" onclick={cancelSave}><Icon name="x" size={18} />Cancel</button>
    {:else}
      <button class="btn grow" disabled={!on || !presets.length} onclick={startSave}><Icon name="save" size={18} />Save {freq} as preset…</button>
    {/if}
  </div>

  {#if presets.length}
    <details bind:open use:remember={'tuner.presets'}>
      <summary>Presets</summary>
      {#if saving}
        <p class="hint save-hint">Choose a slot for <b>{freq}</b>. Tap it again to replace what's there.</p>
      {/if}
      <div class="grid" class:saving>
        {#each presets as [n, p] (n)}
          {@const isHere = p.freq === st.tuner?.freq}
          <button class="slot" class:here={isHere} class:confirm={confirm === n} disabled={!on}
            onclick={() => tapSlot(n, p)} title={p.name ? `${p.name} · ${fmtFreq(p.freq)}` : fmtFreq(p.freq)}>
            <span class="num">{Number(n)}</span>
            {#if confirm === n}
              <span class="f">Replace?</span>
            {:else}
              <span class="f">{p.name || fmtFreq(p.freq).replace(/ (MHz|kHz)$/, '')}</span>
            {/if}
          </button>
        {/each}
      </div>
    </details>
  {/if}
</Panel>

<style>
  .keys { margin-top: 8px; }
  .tuner { text-align: center; padding: 8px 0 12px; }
  .freq { font-size: 34px; font-weight: 700; color: var(--accent); letter-spacing: -1px; }
  details { margin-top: 12px; }
  summary { cursor: pointer; font-weight: 600; padding: 4px 0; }
  .save-hint { margin: 6px 0 2px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(78px, 1fr)); gap: 6px; margin-top: 8px;
    max-height: 236px; overflow: auto; padding: 2px; }
  .slot { display: flex; flex-direction: column; align-items: flex-start; gap: 1px; padding: 6px 8px; border-radius: 9px;
    border: 1px solid var(--line); background: var(--card-2); cursor: pointer; text-align: left; min-width: 0; }
  .slot:hover:not(:disabled) { border-color: var(--accent); }
  .slot:disabled { opacity: 0.5; cursor: default; }
  .slot .num { font-size: 11px; color: var(--faint); }
  .slot .f { font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden;
    text-overflow: ellipsis; max-width: 100%; }
  .slot.here { border-color: var(--accent); color: var(--accent); }
  .saving .slot { border-style: dashed; }
  .slot.confirm { border-style: solid; border-color: var(--bad); color: var(--bad); background: transparent; }
</style>
