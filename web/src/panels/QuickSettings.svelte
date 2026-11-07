<script>
  import { avr, send } from '../lib/avr.svelte.js';
  import Icon from '../lib/Icon.svelte';
  import Panel from '../lib/Panel.svelte';
  import Seg from '../lib/Seg.svelte';
  import PresetPicker from '../lib/PresetPicker.svelte';

  const st = $derived(avr.state);
  const on = $derived(st.zoneMain === true);
  // The receiver accepts 10-120 minutes in 10-minute steps (manual p.132); these are the common picks.
  const SLEEP = [0, 10, 20, 30, 60, 90, 120];
  const sleepOpts = SLEEP.map((m) => ({ value: m, label: m ? `${m}m` : 'Off' }));
  // Bluetooth headphones can't be used while a Bluetooth source plays in any zone (p.79).
  const btSourceInUse = $derived(st.source === 'BT' || st.zone2?.source === 'BT');
</script>

<Panel id="quick-settings" title="Quick settings">
    <div class="setting stack">
      <div><div class="label"><Icon name="moon" size={16} /> Sleep timer</div>
        <div class="hint">{st.sleep ? `Main zone turns off in ${st.sleep} minutes` : 'Main zone only'}</div></div>
      <Seg value={SLEEP.includes(st.sleep) ? st.sleep : -1} disabled={!on} options={sleepOpts}
        onchange={(v) => send(v ? 'SLP' + String(v).padStart(3, '0') : 'SLPOFF')} />
    </div>
    <div class="setting stack">
      <div class="label"><Icon name="sun" size={16} /> Display dimmer</div>
      <Seg value={st.dimmer} onchange={(v) => send('DIM ' + v)} options={[
        { value: 'BRI', label: 'Bright' }, { value: 'DIM', label: 'Dim' }, { value: 'DAR', label: 'Dark' }, { value: 'OFF', label: 'Off' }]} />
    </div>
    <div class="setting stack">
      <div><div class="label"><Icon name="leaf" size={16} /> ECO mode</div><div class="hint">Use Off if loud passages distort</div></div>
      <Seg value={st.eco} onchange={(v) => send('ECO' + v)} options={[
        { value: 'ON', label: 'On' }, { value: 'AUTO', label: 'Auto' }, { value: 'OFF', label: 'Off' }]} />
    </div>
    <div class="setting stack">
      <div><div class="label">Auto standby</div><div class="hint">After this long without audio or video</div></div>
      <Seg value={st.autoStandby} onchange={(v) => send('STBY' + v)} options={[
        { value: '15M', label: '15 min' }, { value: '30M', label: '30 min' }, { value: '60M', label: '60 min' }, { value: 'OFF', label: 'Off' }]} />
    </div>
    {#if avr.speakerPresets?.list.length}
      <div class="setting">
        <div><div class="label">Speaker preset</div><div class="hint">{avr.speakerPresets.busy ? avr.speakerPresets.busy.step + '…' : 'Saved speaker setups'}</div></div>
        <PresetPicker />
      </div>
    {/if}
    {#if st.btTx}
      <div class="setting stack">
        <div class="row between">
          <div><div class="label">Bluetooth transmitter</div><div class="hint">{btSourceInUse
            ? 'Unavailable while a Bluetooth source plays'
            : 'Set the volume on the headphones'}</div></div>
          <button class="switch" class:on={st.btTx === 'ON'} disabled={btSourceInUse} aria-label="Bluetooth transmitter"
            onclick={() => send('BTTX ' + (st.btTx === 'ON' ? 'OFF' : 'ON'))}></button>
        </div>
        {#if st.btTx === 'ON' && st.btOutput}
          <Seg value={st.btOutput} onchange={(v) => send('BTTX ' + v)}
            options={[{ value: 'SP', label: 'Bluetooth + speakers' }, { value: 'BT', label: 'Bluetooth only' }]} />
          {#if st.btOutput === 'BT'}<div class="hint">Audio settings are unavailable while connected</div>{/if}
        {/if}
      </div>
    {/if}
</Panel>

<style>
  .label { display: flex; align-items: center; gap: 6px; }
</style>
