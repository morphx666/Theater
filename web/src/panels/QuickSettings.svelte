<script>
  import { avr, send } from '../lib/avr.svelte.js';
  import Icon from '../lib/Icon.svelte';
  import Panel from '../lib/Panel.svelte';
  import Seg from '../lib/Seg.svelte';

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
        <div class="hint">{st.sleep ? `Main zone turns off in ${st.sleep} minutes` : 'Main zone only; cancelled if the receiver goes to standby'}</div></div>
      <Seg value={SLEEP.includes(st.sleep) ? st.sleep : -1} disabled={!on} options={sleepOpts}
        onchange={(v) => send(v ? 'SLP' + String(v).padStart(3, '0') : 'SLPOFF')} />
    </div>
    <div class="setting stack">
      <div class="label"><Icon name="sun" size={16} /> Display dimmer</div>
      <Seg value={st.dimmer} onchange={(v) => send('DIM ' + v)} options={[
        { value: 'BRI', label: 'Bright' }, { value: 'DIM', label: 'Dim' }, { value: 'DAR', label: 'Dark' }, { value: 'OFF', label: 'Off' }]} />
    </div>
    <div class="setting stack">
      <div><div class="label"><Icon name="leaf" size={16} /> ECO mode</div><div class="hint">On always limits amplifier power; Auto saves power depending on the volume. Use Off if loud passages distort.</div></div>
      <Seg value={st.eco} onchange={(v) => send('ECO' + v)} options={[
        { value: 'ON', label: 'On' }, { value: 'AUTO', label: 'Auto' }, { value: 'OFF', label: 'Off' }]} />
    </div>
    <div class="setting stack">
      <div><div class="label">Auto standby</div><div class="hint">Main zone goes to standby after this long without an audio or video signal</div></div>
      <Seg value={st.autoStandby} onchange={(v) => send('STBY' + v)} options={[
        { value: '15M', label: '15 min' }, { value: '30M', label: '30 min' }, { value: '60M', label: '60 min' }, { value: 'OFF', label: 'Off' }]} />
    </div>
    {#if st.speakerPreset}
      <div class="setting stack">
        <div><div class="label">Speaker preset</div><div class="hint">Each preset has its own speaker setup, Audyssey and Graphic EQ (including Amp Assign, so Zone 2 may change)</div></div>
        <Seg value={st.speakerPreset} onchange={(v) => send('SPPR ' + v)} options={[{ value: '1', label: 'Preset 1' }, { value: '2', label: 'Preset 2' }]} />
      </div>
    {/if}
    {#if st.btTx}
      <div class="setting stack">
        <div class="row between">
          <div><div class="label">Bluetooth transmitter</div><div class="hint">{btSourceInUse
            ? 'Not available while a Bluetooth source is playing in any zone'
            : 'Main-zone audio to Bluetooth headphones or a speaker. Set their volume on the headphones: they may be loud when they connect.'}</div></div>
          <button class="switch" class:on={st.btTx === 'ON'} disabled={btSourceInUse} aria-label="Bluetooth transmitter"
            onclick={() => send('BTTX ' + (st.btTx === 'ON' ? 'OFF' : 'ON'))}></button>
        </div>
        {#if st.btTx === 'ON' && st.btOutput}
          <Seg value={st.btOutput} onchange={(v) => send('BTTX ' + v)}
            options={[{ value: 'SP', label: 'Bluetooth + speakers' }, { value: 'BT', label: 'Bluetooth only' }]} />
          {#if st.btOutput === 'BT'}<div class="hint">With headphones connected, sound modes, audio settings and All Zone Stereo are unavailable.</div>{/if}
        {/if}
      </div>
    {/if}
</Panel>

<style>
  .label { display: flex; align-items: center; gap: 6px; }
</style>
