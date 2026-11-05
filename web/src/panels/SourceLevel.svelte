<script>
  import { avr } from '../lib/avr.svelte.js';
  import { useSetup } from '../lib/useSetup.svelte.js';
  import Panel from '../lib/Panel.svelte';
  import Slider from '../lib/Slider.svelte';

  const level = useSetup('inputs', 5);
  const curName = $derived(avr.state.inputs?.[avr.state.source]?.name ?? avr.state.source);
  const node = $derived(level.doc?.querySelector('SourceLevel'));
  // The setting follows the active input, so re-read it whenever the input changes.
  let lastSrc = avr.state.source;
  $effect(() => { const s = avr.state.source; if (s !== lastSrc) { lastSrc = s; level.reload(); } });
</script>

<Panel id="source-level" title="Source level" needsPower>
  {#if level.error}<p class="err">{level.error}</p>{/if}
  {#if node && node.getAttribute('display') === '3'}
    <Slider label="Input level for {curName}" min={-12} max={12} step={1} center value={Number(node.textContent)}
      format={(v) => (v > 0 ? '+' : '') + v + ' dB'} onchange={(v) => level.write(`<SourceLevel>${v}</SourceLevel>`, { quiet: true })} />
    <p class="faint small">Evens out loudness differences between inputs. Applies to whichever input is active.</p>
  {:else if node}
    <p class="faint small">Not adjustable for the current input.</p>
  {/if}
</Panel>

<style>
  p { margin: 10px 0 0; }
</style>
