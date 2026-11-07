<script>
  import { avr } from '../lib/avr.svelte.js';
  import Icon from '../lib/Icon.svelte';
  import Panel from '../lib/Panel.svelte';
  import NowPlaying from '../lib/NowPlaying.svelte';
  import SignalView from '../lib/SignalView.svelte';
  import { loadOpen, saveOpen } from '../lib/remember.js';

  const st = $derived(avr.state);
  const on = $derived(st?.zoneMain === true);
  const current = $derived(st.inputs[st.source]?.name ?? st.source);

  // Summary chips or the signal flow view; remembered per device.
  let signal = $state(loadOpen('status.signal', false));
  function toggleView() { signal = !signal; saveOpen('status.signal', signal); }

  // Speaker layout like "5.1.2" from active channel levels
  const layout = $derived.by(() => {
    const ch = Object.keys(st.channels ?? {});
    const subs = ch.filter((c) => c.startsWith('SW')).length;
    const heights = ch.filter((c) => /^(FH|TF|TM|TR|FD|SD|BD|SH|TS)/.test(c)).length;
    const beds = ch.length - subs - heights;
    return ch.length ? `${beds}.${subs}${heights ? '.' + heights : ''}` : null;
  });

  // HDMI video signal: "4K24", or "1080p60 → 4K60" when the receiver converts it.
  const vi = $derived(st?.videoInfo ?? null);
  const depth = (d) => d?.replace(/^(\d+)\s*bits?$/i, '$1-bit') ?? null;
  function io(key, fmt = (x) => x, none = null) {
    const a = fmt(vi.in[key]) ?? none, b = fmt(vi.out[key]) ?? none;
    if (!a || a === b) return b;
    if (!b) return a;
    return `${a} → ${b}`;
  }
  const video = $derived(vi && [
    { text: io('res'), title: 'Resolution (input → output)' },
    { text: io('hdr', (x) => x, 'SDR'), title: 'Dynamic range (input → output)' },
    { text: io('color'), title: 'Color space (input → output)' },
    { text: io('depth', depth), title: 'Pixel depth (input → output)' },
  ].filter((c) => c.text));
</script>

<Panel id="status" hero>
  <div class="np-wrap">
    <div>
      <div class="top">
        <div class="src" title={on ? current : ''}>{on ? current : 'Standby'}</div>
        {#if on}
          <button class="view" class:on={signal} onclick={toggleView} aria-pressed={signal}
            title={signal ? 'Show summary' : 'Show signal flow'} aria-label="Signal flow view"><Icon name="flow" size={16} /></button>
        {/if}
      </div>
      {#if on && signal}
        <div class="chips">
          <div class="line"><span class="pill accent mode" title={st.soundModeText ?? ''}><Icon name="wave" size={14} /><span class="txt">{st.soundModeText ?? '—'}</span></span></div>
        </div>
        <div class="flowview"><SignalView /></div>
      {:else if on}
        <!-- Fixed two-line layout so the panel never changes height with the text length -->
        <div class="chips">
          <div class="line"><span class="pill accent mode" title={st.soundModeText ?? ''}><Icon name="wave" size={14} /><span class="txt">{st.soundModeText ?? '—'}</span></span></div>
          <div class="line">
            <span class="lead" title="Audio"><Icon name="vol" size={14} /></span>
            <span class="pill" title={st.audioFormat ? `Channels in the source: ${st.audioFormat} (front/surround/LFE)` : ''}>{st.decoder || '—'}</span>
            {#if st.sampleRate}<span class="pill">{st.sampleRate}Hz</span>{/if}
            {#if layout}<span class="pill"><Icon name="speaker" size={14} />{layout}</span>{/if}
          </div>
          <div class="line">
            <span class="lead" title="Video"><Icon name="tv" size={14} /></span>
            {#if video?.length}
              {#each video as c (c.title)}
                <span class="pill" title={c.title}>{c.text}</span>
              {/each}
            {:else}
              <span class="pill faint-pill">No video</span>
            {/if}
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
  .top { display: flex; align-items: center; gap: 8px; padding-right: 36px; }
  .src { font-size: 30px; font-weight: 750; letter-spacing: -0.02em; flex: 1; min-width: 0;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .view { width: 30px; height: 30px; border-radius: 50%; border: 1px solid transparent; background: none; color: var(--faint);
    display: grid; place-items: center; cursor: pointer; flex: none; transition: color 0.15s, background 0.15s; }
  .view:hover { color: var(--text); background: var(--card-2); }
  .view.on { color: var(--accent); }
  .flowview { margin-top: 14px; }
  .chips { margin-top: 10px; display: grid; gap: 6px; }
  .line { display: flex; gap: 6px; min-width: 0; overflow: hidden; }
  .line .pill { flex: none; }
  .mode { max-width: 100%; min-width: 0; flex: 0 1 auto !important; }
  .lead { flex: none; display: grid; place-items: center; margin-right: -2px; color: var(--muted); }
  .faint-pill { opacity: 0.55; }
  .mode .txt { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
</style>
