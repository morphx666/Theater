<script>
  import { avr, send, vol2, SOURCE_ORDER } from '../lib/avr.svelte.js';
  import Icon from '../lib/Icon.svelte';
  import Slider from '../lib/Slider.svelte';

  const st = $derived(avr.state);
  const z = $derived(st.zone2);
  const on = $derived(z.power === true);
  // Zone 2 on the X1700H takes analog/network sources; "SOURCE" follows the main zone.
  const sources = $derived([
    { code: 'SOURCE', name: 'Same as Main' },
    ...SOURCE_ORDER.filter((c) => st.inputs[c] && !st.inputs[c].hidden).map((c) => ({ code: c, name: st.inputs[c].name })),
  ]);
</script>

<div class="cols">
  <section class="card">
    <h2>Zone 2
      <button class="power" class:on aria-label="Zone 2 power" onclick={() => send(on ? 'Z2OFF' : 'Z2ON')}><Icon name="power" /></button>
    </h2>
    <div class="setting stack">
      <Slider label="Volume" min={-80} max={Math.min(avr.cap, 18)} step={1} value={z.volume ?? -80}
        disabled={!on} format={(v) => v + ' dB'} onchange={(v) => send('Z2' + vol2(v).slice(0, 2))} />
      <div class="row">
        <button class="btn icon" disabled={!on} aria-label="Zone 2 volume down" onclick={() => send('Z2DOWN')}><Icon name="minus" /></button>
        <button class="btn grow" class:on={z.mute} disabled={!on} onclick={() => send(z.mute ? 'Z2MUOFF' : 'Z2MUON')}>
          <Icon name={z.mute ? 'mute' : 'vol'} />{z.mute ? 'Muted' : 'Mute'}
        </button>
        <button class="btn icon" disabled={!on} aria-label="Zone 2 volume up" onclick={() => send('Z2UP')}><Icon name="plus" /></button>
      </div>
    </div>
    <div class="setting stack">
      <div class="label">Source</div>
      <div class="srcs">
        {#each sources as s (s.code)}
          <button class="btn" class:on={z.source === s.code} disabled={!on} onclick={() => send('Z2' + s.code)}>{s.name}</button>
        {/each}
      </div>
      <p class="hint">Zone 2 can't play HDMI/digital sources from a different input than the main zone — pick “Same as Main” for those.</p>
    </div>
  </section>

  <section class="card">
    <h2>All Zone Stereo</h2>
    <div class="setting">
      <div><div class="label">Play main-zone audio everywhere</div>
        <div class="hint">Plays the main zone's source in stereo across all zones — party mode.</div></div>
      <button class="switch" class:on={st.allZoneStereo} aria-label="All Zone Stereo"
        onclick={() => send('MNZST ' + (st.allZoneStereo ? 'OFF' : 'ON'))}></button>
    </div>
  </section>
</div>

<style>
  .cols { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); align-items: start; }
  .srcs { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 8px; }
  .hint { font-size: 12.5px; color: var(--muted); margin: 0; }
  .power { width: 40px; height: 40px; border-radius: 50%; border: 1px solid var(--line); background: var(--card-2); color: var(--faint); cursor: pointer; display: grid; place-items: center; }
  .power.on { color: var(--good); border-color: var(--good); box-shadow: 0 0 14px -4px var(--good); }
</style>
