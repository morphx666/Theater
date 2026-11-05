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
      <div class="src" title={on ? current : ''}>{on ? current : 'Standby'}</div>
      {#if on}
        <!-- Fixed two-line layout so the panel never changes height with the text length -->
        <div class="chips">
          <div class="line"><span class="pill accent mode" title={st.soundModeText ?? ''}><Icon name="wave" size={14} /><span class="txt">{st.soundModeText ?? '—'}</span></span></div>
          <div class="line">
            <span class="pill">{st.decoder || '—'}</span>
            {#if st.sampleRate}<span class="pill">{st.sampleRate}Hz</span>{/if}
            {#if layout}<span class="pill"><Icon name="speaker" size={14} />{layout}</span>{/if}
          </div>
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
  .src { font-size: 30px; font-weight: 750; letter-spacing: -0.02em; padding-right: 36px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .chips { margin-top: 10px; display: grid; gap: 6px; }
  .line { display: flex; gap: 6px; min-width: 0; overflow: hidden; }
  .line .pill { flex: none; }
  .mode { max-width: 100%; min-width: 0; flex: 0 1 auto !important; }
  .mode .txt { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
</style>
