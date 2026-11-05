<script>
  import { avr, api, toast } from '../lib/avr.svelte.js';
  import Icon from '../lib/Icon.svelte';
  import Panel from '../lib/Panel.svelte';
  import Seg from '../lib/Seg.svelte';
  import Slider from '../lib/Slider.svelte';

  const st = $derived(avr.state);
</script>

<Panel id="receiver-info" title="Receiver">
      <dl>
        <dt>Model</dt><dd>{st.model ?? '—'}</dd>
        {#each Object.entries(st.firmware ?? {}) as [k, v]}<dt>Firmware {k}</dt><dd class="mono">{v}</dd>{/each}
        <dt>Connection</dt>
        <dd>
          <span class="dot {avr.conn.telnet ? 'good' : 'bad'}"></span> telnet
          <span class="dot {avr.conn.heos ? 'good' : 'bad'}" style="margin-left:10px"></span> HEOS
          {#if !avr.conn.telnet}<span class="dot {avr.conn.http ? 'warn' : 'bad'}" style="margin-left:10px"></span> HTTP{/if}
        </dd>
        <dt>Volume limit</dt><dd>{st.volumeLimit === 'OFF' ? 'Off' : st.volumeLimit ? Number(st.volumeLimit) - 80 + ' dB' : '—'}</dd>
        <dt>Max volume</dt><dd>{st.volumeMax != null ? st.volumeMax + ' dB' : '—'}</dd>
      </dl>
</Panel>

<style>
  dl { display: grid; grid-template-columns: auto 1fr; gap: 8px 16px; margin: 0; }
  dt { color: var(--muted); }
  dd { margin: 0; display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
</style>
