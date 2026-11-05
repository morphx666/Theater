<script>
  import { avr, send } from '../lib/avr.svelte.js';
  import Icon from '../lib/Icon.svelte';
  import Panel from '../lib/Panel.svelte';
  import Seg from '../lib/Seg.svelte';

  const st = $derived(avr.state);
  const on = $derived(st.zoneMain === true);
  const freq = $derived.by(() => {
    const f = st.tuner?.freq;
    if (!f) return '—';
    const n = Number(f);
    return st.tuner.band === 'AM' ? `${n} kHz` : `${(n / 100).toFixed(2)} MHz`;
  });
</script>

<Panel id="tuner" title="Tuner">
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
</Panel>

<style>
  .keys { margin-top: 8px; }
  .tuner { text-align: center; padding: 8px 0 12px; }
  .freq { font-size: 34px; font-weight: 700; color: var(--accent); letter-spacing: -1px; }
</style>
