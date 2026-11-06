<script>
  import { avr, send } from '../lib/avr.svelte.js';
  import Panel from '../lib/Panel.svelte';
  import { useAvailability } from '../lib/availability.svelte.js';
  import { locked, hint } from '../lib/rules.js';
  import Seg from '../lib/Seg.svelte';
  import Slider from '../lib/Slider.svelte';

  const ps = $derived(avr.state.ps ?? {});
  const has = (k) => ps[k] !== undefined;
  const toggle = (k, cmd) => send(`${cmd} ${ps[k] === 'ON' ? 'OFF' : 'ON'}`);
  useAvailability();
  // Dynamic Compression needs Loudness Management on, and "Auto" isn't available with DTS (manual p.152).
  const dts = $derived(/DTS/i.test(avr.state.decoder ?? ''));
  const drcOptions = $derived([
    ...(dts ? [] : [{ value: 'AUTO', label: 'Auto' }]),
    { value: 'LOW', label: 'Low' }, { value: 'MID', label: 'Mid' }, { value: 'HI', label: 'High' }, { value: 'OFF', label: 'Off' }]);
</script>

{#snippet drc()}
  <div class="sub">
    <div class="label">Dynamic compression</div>
    <div class="hint">{hint('DRC', 'Reduces loud peaks')}</div>
    <Seg value={ps.DRC} disabled={locked('DRC')} onchange={(v) => send('PSDRC ' + v)} options={drcOptions} />
  </div>
{/snippet}

<Panel id="processing" title="Processing" needsPower>
  {#if has('LOM')}
    <div class="setting stack">
      <div class="row between">
        <div><div class="label">Loudness management</div><div class="hint">{hint('LOM', 'Affects Dolby sources only')}</div></div>
        <button class="switch" class:on={ps.LOM === 'ON'} disabled={locked('LOM')} aria-label="Loudness management" onclick={() => toggle('LOM', 'PSLOM')}></button>
      </div>
      {#if has('DRC')}{@render drc()}{/if}
    </div>
  {:else if has('DRC')}
    <div class="setting stack">{@render drc()}</div>
  {/if}
  {#if has('RSTR')}
    <div class="setting stack">
      <div><div class="label">Compressed audio restorer</div><div class="hint">{hint('RSTR', 'Improves compressed audio (MP3, AAC)')}</div></div>
      <Seg value={ps.RSTR} disabled={locked('RSTR')} onchange={(v) => send('PSRSTR ' + v)} options={[
        { value: 'OFF', label: 'Off' }, { value: 'LOW', label: 'Low' }, { value: 'MED', label: 'Medium' }, { value: 'HI', label: 'High' }]} />
    </div>
  {/if}
  {#if has('NEURAL')}
    <div class="setting">
      <div><div class="label">DTS Neural:X</div><div class="hint">{hint('NEURAL', 'Upmixes to your speaker layout')}</div></div>
      <button class="switch" class:on={ps.NEURAL === 'ON'} disabled={locked('NEURAL')} aria-label="Neural X" onclick={() => toggle('NEURAL', 'PSNEURAL')}></button>
    </div>
  {/if}
  {#if has('CES')}
    <div class="setting">
      <div><div class="label">Center spread</div><div class="hint">{hint('CES', 'Widens the center into the front speakers')}</div></div>
      <button class="switch" class:on={ps.CES === 'ON'} disabled={locked('CES')} aria-label="Center spread" onclick={() => toggle('CES', 'PSCES')}></button>
    </div>
  {/if}
  {#if has('DELAY')}
    <!-- PSDELAY is the audio delay; PSDEL is a different parameter that this receiver ignores. -->
    <div class="setting stack">
      <Slider label="Audio delay (lip-sync)" min={0} max={500} step={1} value={Number(ps.DELAY)} format={(v) => v + ' ms'}
        onchange={(v) => send('PSDELAY ' + String(v).padStart(3, '0'))} />
    </div>
  {/if}
</Panel>

<style>
  .sub { margin-top: 12px; padding-left: 12px; border-left: 2px solid var(--line); display: flex; flex-direction: column; gap: 8px; }
  .sub .hint { margin-top: -6px; }
</style>
