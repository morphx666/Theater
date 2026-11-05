<script>
  import { avr, send } from '../lib/avr.svelte.js';
  import Panel from '../lib/Panel.svelte';
  import { useAvailability, state, REASON } from '../lib/availability.svelte.js';
  import Seg from '../lib/Seg.svelte';
  import Slider from '../lib/Slider.svelte';

  const ps = $derived(avr.state.ps ?? {});
  const has = (k) => ps[k] !== undefined;
  const toggle = (k, cmd) => send(`${cmd} ${ps[k] === 'ON' ? 'OFF' : 'ON'}`);
  useAvailability();
  const off = (k) => state(k) !== 'on';
  const hint = (k, text) => (off(k) ? REASON[state(k)] : text);
</script>

<Panel id="processing" title="Processing" needsPower>
  {#if has('DRC')}
    <div class="setting stack">
      <div><div class="label">Dynamic compression</div><div class="hint">{hint('DRC', 'For Dolby / DTS content')}</div></div>
      <Seg value={ps.DRC} disabled={off('DRC')} onchange={(v) => send('PSDRC ' + v)} options={[
        { value: 'AUTO', label: 'Auto' }, { value: 'LOW', label: 'Low' }, { value: 'MID', label: 'Mid' }, { value: 'HI', label: 'High' }, { value: 'OFF', label: 'Off' }]} />
    </div>
  {/if}
  {#if has('RSTR')}
    <div class="setting stack">
      <div><div class="label">Compressed audio restorer</div><div class="hint">Restores detail to Bluetooth / streaming audio</div></div>
      <Seg value={ps.RSTR} onchange={(v) => send('PSRSTR ' + v)} options={[
        { value: 'OFF', label: 'Off' }, { value: 'LOW', label: 'Low' }, { value: 'MED', label: 'Medium' }, { value: 'HI', label: 'High' }]} />
    </div>
  {/if}
  {#if has('LOM')}
    <div class="setting">
      <div><div class="label">Loudness management</div><div class="hint">{hint('LOM', 'Dolby dialog normalization')}</div></div>
      <button class="switch" class:on={ps.LOM === 'ON'} disabled={off('LOM')} aria-label="Loudness management" onclick={() => toggle('LOM', 'PSLOM')}></button>
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
  {#if has('DEL')}
    <div class="setting stack">
      <Slider label="Audio delay (lip-sync)" min={0} max={200} step={1} value={Number(ps.DEL)} format={(v) => v + ' ms'}
        onchange={(v) => send('PSDEL ' + String(v).padStart(3, '0'))} />
    </div>
  {/if}
</Panel>
