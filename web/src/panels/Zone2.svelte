<script>
  import { avr, send, vol2, SOURCE_ORDER } from '../lib/avr.svelte.js';
  import Icon from '../lib/Icon.svelte';
  import Panel from '../lib/Panel.svelte';
  import Slider from '../lib/Slider.svelte';
  import { useSetup } from '../lib/useSetup.svelte.js';
  import { txt } from '../lib/setup.js';

  const st = $derived(avr.state);
  const z = $derived(st.zone2);
  const on = $derived(z.power === true);
  // Zone 2 has its own Volume Limit (1 Off, 2 -20, 3 -10, 4 0 dB) and can have a fixed level (manual p.211).
  const z2setup = useSetup('general', 4);
  const Z2_LIMIT_DB = { 1: 18, 2: -20, 3: -10, 4: 0 };
  const maxDb = $derived(Math.min(avr.cap, Z2_LIMIT_DB[txt(z2setup.doc, 'VolumeLimit')] ?? 18));
  const fixedLevel = $derived.by(() => { const v = txt(z2setup.doc, 'VolumeLevel'); return v && v !== '99' ? Number(v) - 80 : null; });
  const canVolume = $derived(on && fixedLevel === null);
  // "SOURCE" follows the main zone.
  const sources = $derived([
    { code: 'SOURCE', name: 'Same as Main' },
    ...SOURCE_ORDER.filter((c) => st.inputs[c] && !st.inputs[c].hidden).map((c) => ({ code: c, name: st.inputs[c].name })),
  ]);
</script>

<Panel id="zone2" title="Zone 2">
  {#snippet actions()}
    <button class="power" class:on aria-label="Zone 2 power" onclick={() => send(on ? 'Z2OFF' : 'Z2ON')}><Icon name="power" /></button>
  {/snippet}
  <div class="setting stack">
    <Slider label="Volume" min={-80} max={maxDb} step={1} value={z.volume ?? -80}
      disabled={!canVolume} format={(v) => v + ' dB'} onchange={(v) => send('Z2' + vol2(v).slice(0, 2))} />
    <div class="row">
      <button class="btn icon" disabled={!canVolume} aria-label="Zone 2 volume down" onclick={() => send('Z2DOWN')}><Icon name="minus" /></button>
      <button class="btn grow" class:on={z.mute} disabled={!on} onclick={() => send(z.mute ? 'Z2MUOFF' : 'Z2MUON')}>
        <Icon name={z.mute ? 'mute' : 'vol'} />{z.mute ? 'Muted' : 'Mute'}
      </button>
      <button class="btn icon" disabled={!canVolume || (z.volume ?? -80) >= maxDb} aria-label="Zone 2 volume up" onclick={() => send('Z2UP')}><Icon name="plus" /></button>
    </div>
    {#if fixedLevel !== null}<p class="hint">Zone 2 is set to a fixed level ({fixedLevel} dB) in Setup, so its volume can't be changed here.</p>{/if}
  </div>
  <div class="setting stack">
    <div class="label">Source</div>
    <div class="srcs">
      {#each sources as s (s.code)}
        <button class="btn" class:on={z.source === s.code} disabled={!on} onclick={() => send('Z2' + s.code)}>{s.name}</button>
      {/each}
    </div>
    <p class="hint">With a specific input, Zone 2 plays only analog-connected devices. For HDMI or optical sources, choose “Same as Main”, which follows the main zone's input.</p>
  </div>
</Panel>

<style>
  .srcs { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 8px; }
  .hint { font-size: 12.5px; color: var(--muted); margin: 0; }
  .power { width: 34px; height: 34px; border-radius: 50%; border: 1px solid var(--line); background: var(--card-2); color: var(--faint); cursor: pointer; display: grid; place-items: center; }
  .power.on { color: var(--good); border-color: var(--good); box-shadow: 0 0 14px -4px var(--good); }
</style>
