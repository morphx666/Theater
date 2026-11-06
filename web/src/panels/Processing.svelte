<script>
  import { avr, send } from '../lib/avr.svelte.js';
  import Panel from '../lib/Panel.svelte';
  import { useAvailability, state as avail, REASON } from '../lib/availability.svelte.js';
  import Seg from '../lib/Seg.svelte';
  import Slider from '../lib/Slider.svelte';

  const ps = $derived(avr.state.ps ?? {});
  const has = (k) => ps[k] !== undefined;
  const toggle = (k, cmd) => send(`${cmd} ${ps[k] === 'ON' ? 'OFF' : 'ON'}`);
  useAvailability();
  const off = (k) => avail(k) !== 'on';
  const hint = (k, text) => (off(k) ? REASON[avail(k)] : text);
  // Dynamic Compression is only adjustable while Loudness Management is on (the receiver greys it out otherwise).
  const drcHint = $derived(!off('DRC') ? 'How much loud passages are reduced (Dolby / DTS content)'
    : has('LOM') && ps.LOM !== 'ON' ? 'Turn on Loudness management to adjust this' : REASON[avail('DRC')]);
</script>

{#snippet drc()}
  <div class="sub">
    <div class="label">Dynamic compression</div>
    <div class="hint">{drcHint}</div>
    <Seg value={ps.DRC} disabled={off('DRC')} onchange={(v) => send('PSDRC ' + v)} options={[
      { value: 'AUTO', label: 'Auto' }, { value: 'LOW', label: 'Low' }, { value: 'MID', label: 'Mid' }, { value: 'HI', label: 'High' }, { value: 'OFF', label: 'Off' }]} />
  </div>
{/snippet}

<Panel id="processing" title="Processing" needsPower>
  {#if has('LOM')}
    <div class="setting stack">
      <div class="row between">
        <div><div class="label">Loudness management</div><div class="hint">{hint('LOM', 'Dolby dialog normalization')}</div></div>
        <button class="switch" class:on={ps.LOM === 'ON'} disabled={off('LOM')} aria-label="Loudness management" onclick={() => toggle('LOM', 'PSLOM')}></button>
      </div>
      {#if has('DRC')}{@render drc()}{/if}
    </div>
  {:else if has('DRC')}
    <div class="setting stack">{@render drc()}</div>
  {/if}
  {#if has('RSTR')}
    <div class="setting stack">
      <div><div class="label">Compressed audio restorer</div><div class="hint">{hint('RSTR', 'Restores detail to Bluetooth / streaming audio')}</div></div>
      <Seg value={ps.RSTR} disabled={off('RSTR')} onchange={(v) => send('PSRSTR ' + v)} options={[
        { value: 'OFF', label: 'Off' }, { value: 'LOW', label: 'Low' }, { value: 'MED', label: 'Medium' }, { value: 'HI', label: 'High' }]} />
    </div>
  {/if}
  {#if has('NEURAL')}
    <div class="setting">
      <div><div class="label">DTS Neural:X</div><div class="hint">{hint('NEURAL', 'Upmix to height speakers for non-DTS content')}</div></div>
      <button class="switch" class:on={ps.NEURAL === 'ON'} disabled={off('NEURAL')} aria-label="Neural X" onclick={() => toggle('NEURAL', 'PSNEURAL')}></button>
    </div>
  {/if}
  {#if has('CES')}
    <div class="setting">
      <div><div class="label">Center spread</div><div class="hint">{hint('CES', 'Spreads the center channel to the fronts (Dolby Surround upmix)')}</div></div>
      <button class="switch" class:on={ps.CES === 'ON'} disabled={off('CES')} aria-label="Center spread" onclick={() => toggle('CES', 'PSCES')}></button>
    </div>
  {/if}
  {#if has('DELAY')}
    <!-- PSDELAY is the audio delay; PSDEL is a different parameter that this receiver ignores. -->
    <div class="setting stack">
      <Slider label="Audio delay (lip-sync)" min={0} max={200} step={1} value={Number(ps.DELAY)} format={(v) => v + ' ms'}
        onchange={(v) => send('PSDELAY ' + String(v).padStart(3, '0'))} />
    </div>
  {/if}
</Panel>

<style>
  .sub { margin-top: 12px; padding-left: 12px; border-left: 2px solid var(--line); display: flex; flex-direction: column; gap: 8px; }
  .sub .hint { margin-top: -6px; }
</style>
