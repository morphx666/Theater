<script>
  import { avr, send } from '../lib/avr.svelte.js';
  import Icon from '../lib/Icon.svelte';
  import Panel from '../lib/Panel.svelte';
  import Seg from '../lib/Seg.svelte';

  const st = $derived(avr.state);
  const on = $derived(st.zoneMain === true);
  const sleepOpts = [0, 30, 60, 90, 120].map((m) => ({ value: m, label: m ? `${m}m` : 'Off' }));
</script>

<Panel id="quick-settings" title="Quick settings">
    <div class="setting stack">
      <div><div class="label"><Icon name="moon" size={16} /> Sleep timer</div>
        <div class="hint">{st.sleep ? `Turning off in ${st.sleep} minutes` : 'Off'}</div></div>
      <Seg value={[0, 30, 60, 90, 120].includes(st.sleep) ? st.sleep : -1} disabled={!on} options={sleepOpts}
        onchange={(v) => send(v ? 'SLP' + String(v).padStart(3, '0') : 'SLPOFF')} />
    </div>
    <div class="setting stack">
      <div class="label"><Icon name="sun" size={16} /> Display dimmer</div>
      <Seg value={st.dimmer} onchange={(v) => send('DIM ' + v)} options={[
        { value: 'BRI', label: 'Bright' }, { value: 'DIM', label: 'Dim' }, { value: 'DAR', label: 'Dark' }, { value: 'OFF', label: 'Off' }]} />
    </div>
    <div class="setting stack">
      <div><div class="label"><Icon name="leaf" size={16} /> ECO mode</div><div class="hint">Auto lowers power draw at low volume</div></div>
      <Seg value={st.eco} onchange={(v) => send('ECO' + v)} options={[
        { value: 'ON', label: 'On' }, { value: 'AUTO', label: 'Auto' }, { value: 'OFF', label: 'Off' }]} />
    </div>
    <div class="setting stack">
      <div><div class="label">Auto standby</div><div class="hint">Turn off after no input signal / operation</div></div>
      <Seg value={st.autoStandby} onchange={(v) => send('STBY' + v)} options={[
        { value: '15M', label: '15 min' }, { value: '30M', label: '30 min' }, { value: '60M', label: '60 min' }, { value: 'OFF', label: 'Off' }]} />
    </div>
    {#if st.speakerPreset}
      <div class="setting stack">
        <div><div class="label">Speaker preset</div><div class="hint">Switch between two saved speaker configurations</div></div>
        <Seg value={st.speakerPreset} onchange={(v) => send('SPPR ' + v)} options={[{ value: '1', label: 'Preset 1' }, { value: '2', label: 'Preset 2' }]} />
      </div>
    {/if}
    {#if st.btTx}
      <div class="setting">
        <div><div class="label">Bluetooth transmitter</div><div class="hint">Send audio to Bluetooth headphones</div></div>
        <button class="switch" class:on={st.btTx === 'ON'} aria-label="Bluetooth transmitter" onclick={() => send('BTTX ' + (st.btTx === 'ON' ? 'OFF' : 'ON'))}></button>
      </div>
    {/if}
</Panel>

<style>
  .label { display: flex; align-items: center; gap: 6px; }
</style>
