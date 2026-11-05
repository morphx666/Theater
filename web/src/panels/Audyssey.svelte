<script>
  import { avr, send } from '../lib/avr.svelte.js';
  import Panel from '../lib/Panel.svelte';
  import Seg from '../lib/Seg.svelte';

  const ps = $derived(avr.state.ps ?? {});
  const has = (k) => ps[k] !== undefined;
  const dynEqOn = $derived(ps.DYNEQ === 'ON');
</script>

<Panel id="audyssey" title="Audyssey" needsPower>
  {#if has('MULTEQ')}
    <div class="setting stack">
      <div><div class="label">MultEQ room correction</div><div class="hint">Uses your Audyssey calibration</div></div>
      <Seg value={ps.MULTEQ} onchange={(v) => send('PSMULTEQ:' + v)} options={[
        { value: 'AUDYSSEY', label: 'Reference' }, { value: 'BYP.LR', label: 'L/R Bypass' },
        { value: 'FLAT', label: 'Flat' }, { value: 'OFF', label: 'Off' }]} />
    </div>
  {/if}
  {#if has('DYNEQ')}
    <div class="setting">
      <div><div class="label">Dynamic EQ</div><div class="hint">Keeps bass and surround full at low volume</div></div>
      <button class="switch" class:on={dynEqOn} aria-label="Dynamic EQ" onclick={() => send('PSDYNEQ ' + (dynEqOn ? 'OFF' : 'ON'))}></button>
    </div>
  {/if}
  {#if has('REFLEV')}
    <div class="setting stack">
      <div><div class="label">Reference level offset</div><div class="hint">Higher = less bass/surround boost (for loud mixes)</div></div>
      <Seg value={ps.REFLEV} disabled={!dynEqOn} onchange={(v) => send('PSREFLEV ' + v)} options={[
        { value: '0', label: '0 dB' }, { value: '5', label: '5 dB' }, { value: '10', label: '10 dB' }, { value: '15', label: '15 dB' }]} />
    </div>
  {/if}
  {#if has('DYNVOL')}
    <div class="setting stack">
      <div><div class="label">Dynamic Volume</div><div class="hint">Evens out loud ads and quiet dialog — great for late nights</div></div>
      <Seg value={ps.DYNVOL} onchange={(v) => send('PSDYNVOL ' + v)} options={[
        { value: 'OFF', label: 'Off' }, { value: 'LIT', label: 'Light' }, { value: 'MED', label: 'Medium' }, { value: 'HEV', label: 'Heavy' }]} />
    </div>
  {/if}
</Panel>
