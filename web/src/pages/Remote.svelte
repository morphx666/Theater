<script>
  import { avr, send } from '../lib/avr.svelte.js';
  import Icon from '../lib/Icon.svelte';
  import Seg from '../lib/Seg.svelte';
  import Console from '../lib/Console.svelte';

  const st = $derived(avr.state);
  const on = $derived(st.zoneMain === true);

  const freq = $derived.by(() => {
    const f = st.tuner?.freq;
    if (!f) return '—';
    const n = Number(f);
    return st.tuner.band === 'AM' ? `${n} kHz` : `${(n / 100).toFixed(2)} MHz`;
  });
  const sleepOpts = [0, 30, 60, 90, 120].map((m) => ({ value: m, label: m ? `${m}m` : 'Off' }));
</script>

<div class="cols">
  <section class="card">
    <h2>On-screen menu <span class="faint small" style="text-transform:none;letter-spacing:0">controls the TV menu</span></h2>
    <div class="pad">
      <button class="btn k up" aria-label="Up" onclick={() => send('MNCUP')}><Icon name="up" size={26} /></button>
      <button class="btn k left" aria-label="Left" onclick={() => send('MNCLT')}><Icon name="left" size={26} /></button>
      <button class="btn k ok primary" onclick={() => send('MNENT')}>OK</button>
      <button class="btn k right" aria-label="Right" onclick={() => send('MNCRT')}><Icon name="right" size={26} /></button>
      <button class="btn k down" aria-label="Down" onclick={() => send('MNCDN')}><Icon name="down" size={26} /></button>
    </div>
    <div class="row keys">
      <button class="btn grow" onclick={() => send('MNRTN')}><Icon name="back" size={18} />Back</button>
      <button class="btn grow" onclick={() => send('MNINF')}><Icon name="info" size={18} />Info</button>
      <button class="btn grow" onclick={() => send('MNOPT')}><Icon name="list" size={18} />Option</button>
    </div>
    <div class="row keys">
      <button class="btn grow" onclick={() => send('MNMEN ON')}><Icon name="menu" size={18} />Open setup menu</button>
      <button class="btn grow" onclick={() => send('MNMEN OFF')}>Close menu</button>
    </div>
  </section>

  <section class="card">
    <h2>Tuner</h2>
    <div class="tuner">
      <div class="freq mono">{freq}</div>
      <div class="faint small">{st.tuner?.band ?? ''} {st.tuner?.preset && st.tuner.preset !== 'OFF' ? '· preset ' + st.tuner.preset : ''}</div>
    </div>
    <div class="row keys">
      <button class="btn grow" disabled={!on} onclick={() => send('TFANDOWN')}><Icon name="left" />Tune</button>
      <button class="btn grow" disabled={!on} onclick={() => send('TFANUP')}>Tune<Icon name="right" /></button>
    </div>
    <div class="row keys">
      <button class="btn grow" disabled={!on} onclick={() => send('TPANDOWN')}><Icon name="left" />Preset</button>
      <button class="btn grow" disabled={!on} onclick={() => send('TPANUP')}>Preset<Icon name="right" /></button>
    </div>
    <div class="row keys">
      <Seg value={st.tuner?.band} onchange={(v) => send('TMAN' + v)} disabled={!on}
        options={[{ value: 'FM', label: 'FM' }, { value: 'AM', label: 'AM' }]} />
      <button class="btn grow" disabled={!on} onclick={() => send('SITUNER')}><Icon name="radio" size={18} />Listen</button>
    </div>
  </section>

  <section class="card">
    <h2>Quick settings</h2>
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
  </section>

  <Console />
</div>

<style>
  .cols { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); align-items: start; }
  .pad { display: grid; grid-template-columns: repeat(3, 72px); grid-template-rows: repeat(3, 72px); gap: 8px; justify-content: center; margin: 4px 0 16px; }
  .k { border-radius: 18px; padding: 0; }
  .up { grid-area: 1 / 2; } .left { grid-area: 2 / 1; } .ok { grid-area: 2 / 2; border-radius: 50%; font-weight: 700; font-size: 17px; }
  .right { grid-area: 2 / 3; } .down { grid-area: 3 / 2; }
  .keys { margin-top: 8px; }
  .tuner { text-align: center; padding: 8px 0 12px; }
  .freq { font-size: 34px; font-weight: 700; color: var(--accent); letter-spacing: -1px; }
  .label { display: flex; align-items: center; gap: 6px; }
</style>
