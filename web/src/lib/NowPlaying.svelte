<script>
  import { avr, heos } from './avr.svelte.js';
  import Icon from './Icon.svelte';

  const np = $derived(avr.nowPlaying ?? {});
  const playing = $derived(np.state === 'play');
  const pct = $derived(avr.progress?.duration ? Math.min(100, (avr.progress.position / avr.progress.duration) * 100) : null);
  const t = (ms) => {
    if (ms == null) return '';
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };
</script>

<div class="np">
  <div class="art" style:background-image={np.image ? `url("${np.image}")` : null}>
    {#if !np.image}<Icon name="cloud" size={34} />{/if}
  </div>
  <div class="meta">
    <div class="song">{np.song || np.station || 'Nothing playing'}</div>
    <div class="muted">{[np.artist, np.album].filter(Boolean).join(' — ')}</div>
    {#if pct !== null}
      <div class="bar"><div style:width="{pct}%"></div></div>
      <div class="row between faint small mono"><span>{t(avr.progress.position)}</span><span>{t(avr.progress.duration)}</span></div>
    {/if}
    <div class="row transport">
      <button class="btn icon ghost" aria-label="Previous" onclick={() => heos('previous')}><Icon name="prev" /></button>
      <button class="btn icon primary play" aria-label={playing ? 'Pause' : 'Play'} onclick={() => heos(playing ? 'pause' : 'play')}>
        <Icon name={playing ? 'pause' : 'play'} />
      </button>
      <button class="btn icon ghost" aria-label="Next" onclick={() => heos('next')}><Icon name="next" /></button>
    </div>
  </div>
</div>

<style>
  .np { display: flex; gap: 16px; align-items: center; }
  .art {
    width: 112px; height: 112px; flex: none; border-radius: 14px; background: var(--card-2) center/cover;
    display: grid; place-items: center; color: var(--faint); box-shadow: var(--shadow);
  }
  .meta { min-width: 0; flex: 1; display: grid; gap: 4px; }
  .song { font-weight: 700; font-size: 17px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .bar { height: 4px; background: var(--line); border-radius: 9px; overflow: hidden; margin-top: 6px; }
  .bar div { height: 100%; background: var(--accent); transition: width 1s linear; }
  .transport { gap: 6px; margin-top: 4px; }
  .play { border-radius: 50%; }
</style>
