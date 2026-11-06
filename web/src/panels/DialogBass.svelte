<script>
  import { avr, send, fmtDb, level2 } from '../lib/avr.svelte.js';
  import Panel from '../lib/Panel.svelte';
  import { useAvailability, state as avail, REASON } from '../lib/availability.svelte.js';
  import Seg from '../lib/Seg.svelte';
  import Slider from '../lib/Slider.svelte';

  const ps = $derived(avr.state.ps ?? {});
  const has = (k) => ps[k] !== undefined;
  useAvailability();
  const off = (k) => avail(k) !== 'on';
  const lvl = (raw) => (raw == null ? 0 : (raw.length === 3 ? Number(raw) / 10 : Number(raw)) - 50);

  // For some signals the receiver reports LFE as adjustable but silently ignores changes (Denon's own web UI
  // behaves the same). Notice when a change doesn't stick, and say so instead of just snapping back.
  let lfeIgnored = $state(false);
  let lfeCheck;
  function setLfe(v) {
    const want = String(-v).padStart(2, '0');
    send('PSLFE ' + want);
    clearTimeout(lfeCheck);
    lfeCheck = setTimeout(() => { lfeIgnored = avr.state.ps?.LFE !== want; }, 2500);
  }
  // A new signal, sound mode or input may allow it again.
  const signalKey = $derived([avr.state.source, avr.state.surround, avr.state.decoder, avr.state.signal].join('|'));
  $effect(() => { signalKey; lfeIgnored = false; });
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
      <div><div class="label">Subwoofer</div>{#if off('SWR')}<div class="hint">{REASON[avail('SWR')]}</div>{/if}</div>
      <button class="switch" class:on={ps.SWR === 'ON'} disabled={off('SWR')} aria-label="Subwoofer on/off"
        onclick={() => send('PSSWR ' + (ps.SWR === 'ON' ? 'OFF' : 'ON'))}></button>
    </div>
  {/if}
  {#if has('LFE')}
    <div class="setting stack">
      <Slider label="LFE level" min={-10} max={0} step={1} value={-Number(ps.LFE)} format={(v) => fmtDb(v) + ' dB'}
        disabled={off('LFE')} onchange={setLfe} />
      {#if off('LFE')}<div class="hint">{REASON[avail('LFE')]}</div>
      {:else if lfeIgnored}<div class="hint">The receiver didn't apply this change. It doesn't allow adjusting LFE for the current signal.</div>{/if}
    </div>
  {/if}
  {#if has('CINEMA EQ')}
    <div class="setting">
      <div><div class="label">Cinema EQ</div><div class="hint">{off('CINEMA EQ') ? REASON[avail('CINEMA EQ')] : 'Softens harsh treble in movie soundtracks'}</div></div>
      <button class="switch" class:on={ps['CINEMA EQ'] === 'ON'} disabled={off('CINEMA EQ')} aria-label="Cinema EQ" onclick={() => send('PSCINEMA EQ.' + (ps['CINEMA EQ'] === 'ON' ? 'OFF' : 'ON'))}></button>
    </div>
  {/if}
</Panel>
