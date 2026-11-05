<script>
  import { avr, send, fmtDb, level2 } from '../lib/avr.svelte.js';
  import Panel from '../lib/Panel.svelte';
  import { useAvailability, state, REASON } from '../lib/availability.svelte.js';
  import Seg from '../lib/Seg.svelte';
  import Slider from '../lib/Slider.svelte';

  const ps = $derived(avr.state.ps ?? {});
  const has = (k) => ps[k] !== undefined;
  useAvailability();
  const off = (k) => state(k) !== 'on';
  const lvl = (raw) => (raw == null ? 0 : (raw.length === 3 ? Number(raw) / 10 : Number(raw)) - 50);
</script>

<Panel id="dialog-bass" title="Dialog & bass" needsPower>
  {#if has('DEH')}
    <div class="setting stack">
      <div><div class="label">Dialog Enhancer</div><div class="hint">Makes voices clearer</div></div>
      <Seg value={ps.DEH} onchange={(v) => send('PSDEH ' + v)} options={[
        { value: 'OFF', label: 'Off' }, { value: 'LOW', label: 'Low' }, { value: 'MED', label: 'Medium' }, { value: 'HIGH', label: 'High' }]} />
    </div>
  {/if}
  {#if has('SWL')}
    <div class="setting stack">
      <Slider label="Subwoofer level" min={-12} max={12} step={0.5} center value={lvl(ps.SWL)}
        format={(v) => fmtDb(v) + ' dB'} disabled={ps.SWR === 'OFF'} onchange={(v) => send('PSSWL ' + level2(v))} />
    </div>
  {/if}
  {#if has('SWR')}
    <div class="setting">
      <div class="label">Subwoofer</div>
      <button class="switch" class:on={ps.SWR === 'ON'} aria-label="Subwoofer on/off" onclick={() => send('PSSWR ' + (ps.SWR === 'ON' ? 'OFF' : 'ON'))}></button>
    </div>
  {/if}
  {#if has('LFE')}
    <div class="setting stack">
      <Slider label="LFE level" min={-10} max={0} step={1} value={-Number(ps.LFE)} format={(v) => fmtDb(v) + ' dB'}
        disabled={off('LFE')} onchange={(v) => send('PSLFE ' + String(-v).padStart(2, '0'))} />
      {#if off('LFE')}<div class="hint">{REASON[state('LFE')]}</div>{/if}
    </div>
  {/if}
  {#if has('CINEMA EQ')}
    <div class="setting">
      <div><div class="label">Cinema EQ</div><div class="hint">{off('CINEMA EQ') ? REASON[state('CINEMA EQ')] : 'Softens harsh treble in movie soundtracks'}</div></div>
      <button class="switch" class:on={ps['CINEMA EQ'] === 'ON'} disabled={off('CINEMA EQ')} aria-label="Cinema EQ" onclick={() => send('PSCINEMA EQ.' + (ps['CINEMA EQ'] === 'ON' ? 'OFF' : 'ON'))}></button>
    </div>
  {/if}
</Panel>
