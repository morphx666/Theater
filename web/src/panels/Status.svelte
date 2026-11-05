<script>
  import { avr } from '../lib/avr.svelte.js';
  import Icon from '../lib/Icon.svelte';
  import Panel from '../lib/Panel.svelte';
  import NowPlaying from '../lib/NowPlaying.svelte';

  const st = $derived(avr.state);
  const on = $derived(st?.zoneMain === true);
  const current = $derived(st.inputs[st.source]?.name ?? st.source);

  // Speaker layout like "5.1.2" from active channel levels
  const layout = $derived.by(() => {
    const ch = Object.keys(st.channels ?? {});
    const subs = ch.filter((c) => c.startsWith('SW')).length;
    const heights = ch.filter((c) => /^(FH|TF|TM|TR|FD|SD|BD|SH|TS)/.test(c)).length;
    const beds = ch.length - subs - heights;
    return ch.length ? `${beds}.${subs}${heights ? '.' + heights : ''}` : null;
  });
</script>

<Panel id="status" hero>
  <div class="np-wrap">
    <div>
      <div class="src">{on ? current : 'Standby'}</div>
      {#if on}
        <div class="row wrap chips">
          {#if st.soundModeText}<span class="pill accent"><Icon name="wave" size={14} />{st.soundModeText}</span>{/if}
          {#if st.decoder}<span class="pill">{st.decoder}</span>{/if}
          {#if st.sampleRate}<span class="pill">{st.sampleRate}Hz</span>{/if}
          {#if layout}<span class="pill"><Icon name="speaker" size={14} />{layout}</span>{/if}
        </div>
      {:else}
        <p class="muted">Turn it on with the power button above.</p>
      {/if}
    </div>
    {#if on && st.source === 'NET'}
      <NowPlaying />
    {/if}
  </div>
</Panel>

<style>
  .np-wrap { display: flex; flex-direction: column; gap: 16px; }
  .src { font-size: 30px; font-weight: 750; letter-spacing: -0.02em; padding-right: 36px; }
  .chips { margin-top: 10px; gap: 6px; }
</style>
