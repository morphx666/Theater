<script>
  import { avr, send, fmtDb } from '../lib/avr.svelte.js';
  import Panel from '../lib/Panel.svelte';
  import Slider from '../lib/Slider.svelte';

  const st = $derived(avr.state);
  const ps = $derived(st.ps ?? {});
  const pureMode = $derived(/DIRECT/.test(st.surround ?? ''));
  const toneLocked = $derived(ps.DYNEQ === 'ON' || pureMode);
  const off = $derived(toneLocked || ps['TONE CTRL'] !== 'ON');
</script>

<Panel id="tone" title="Tone" needsPower>
  {#if ps['TONE CTRL'] !== undefined}
    <div class="setting">
      <div><div class="label">Tone control</div>
        <div class="hint">{toneLocked ? (pureMode ? 'Not available in Direct / Pure Direct' : 'Turn off Dynamic EQ to use tone controls') : 'Bass & treble adjustments'}</div></div>
      <button class="switch" class:on={ps['TONE CTRL'] === 'ON'} disabled={toneLocked} aria-label="Tone control"
        onclick={() => send('PSTONE CTRL ' + (ps['TONE CTRL'] === 'ON' ? 'OFF' : 'ON'))}></button>
    </div>
    <div class="setting stack">
      <Slider label="Bass" min={-6} max={6} step={1} center value={Number(ps.BAS ?? 50) - 50} format={(v) => fmtDb(v, 0) + ' dB'}
        disabled={off} onchange={(v) => send('PSBAS ' + (50 + v))} />
      <Slider label="Treble" min={-6} max={6} step={1} center value={Number(ps.TRE ?? 50) - 50} format={(v) => fmtDb(v, 0) + ' dB'}
        disabled={off} onchange={(v) => send('PSTRE ' + (50 + v))} />
    </div>
  {:else}
    <p class="faint small">Not available for the current input.</p>
  {/if}
</Panel>
