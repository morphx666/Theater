<script>
  // Signal flow for the Status panel: input channels -> active speakers (laid out like the receiver's
  // on-screen info bar), and the HDMI video signal in -> out.
  import { avr } from './avr.svelte.js';
  import Icon from './Icon.svelte';

  const st = $derived(avr.state);
  const map = $derived(st.audioMap ?? null);
  const vi = $derived(st.videoInfo ?? null);
  const inDetail = $derived([st.decoder, st.sampleRate && `${st.sampleRate}Hz`].filter(Boolean));

  // "5.1.2" from the speakers the current mode is driving.
  const layout = $derived.by(() => {
    const on = (map?.output ?? []).flat().filter((c) => c?.on).map((c) => c.ch);
    const subs = on.filter((c) => c.startsWith('SW')).length;
    const heights = on.filter((c) => /^(FH|TF|TM|TR|FD|SD|BD|SH|TS)/.test(c)).length;
    const beds = on.length - subs - heights;
    return on.length ? `${beds}.${subs}${heights ? '.' + heights : ''}` : null;
  });

  const depth = (d) => d?.replace(/^(\d+)\s*bits?$/i, '$1-bit') ?? null;
  const video = $derived(vi ? [
    ['Resolution', vi.in.res, vi.out.res],
    ['HDR', vi.in.hdr ?? 'SDR', vi.out.hdr ?? 'SDR'],
    ['Color', vi.in.color, vi.out.color],
    ['Depth', depth(vi.in.depth), depth(vi.out.depth)],
  ].filter(([, a, b]) => a || b) : []);
</script>

{#snippet grid(rows, label)}
  <div class="grid" role="img" aria-label="{label}: {rows.flat().filter((c) => c?.on).map((c) => c.ch).join(', ') || 'none'}">
    {#each rows as row, r (r)}
      {#each row as c, i (i)}
        {#if c}<span class="cell" class:on={c.on}>{c.ch}</span>{:else}<span></span>{/if}
      {/each}
    {/each}
  </div>
{/snippet}

<div class="sig">
  <div class="block">
    <div class="head"><Icon name="vol" size={14} />Audio</div>
    {#if map}
      <div class="flow">
        <div class="side">
          <span class="k">Input</span>
          {@render grid(map.input, 'Input channels')}
          {#if inDetail.length}<span class="d">{#each inDetail as t, i (i)}{#if i}{' · '}{/if}<span class="nw">{t}</span>{/each}</span>{/if}
        </div>
        <span class="arrow" aria-hidden="true"><Icon name="right" size={16} /></span>
        <div class="side">
          <span class="k">Speakers</span>
          {@render grid(map.output, 'Active speakers')}
          {#if layout}<span class="d">{layout}</span>{/if}
        </div>
      </div>
    {:else}
      <p class="none">Reading channels…</p>
    {/if}
  </div>

  <div class="block">
    <div class="head"><Icon name="tv" size={14} />Video</div>
    {#if video.length}
      <div class="vid">
        <span></span><span class="k">Input</span><span></span><span class="k">Output</span>
        {#each video as [label, a, b] (label)}
          <span class="lbl">{label}</span>
          <span class="v">{a ?? '—'}</span>
          <span class="to" class:conv={a !== b} aria-hidden="true"><Icon name="right" size={13} /></span>
          <span class="v" class:conv={a !== b} title={a !== b ? 'Converted by the receiver' : ''}>{b ?? '—'}</span>
        {/each}
      </div>
    {:else}
      <p class="none">No video</p>
    {/if}
  </div>
</div>

<style>
  .sig { display: grid; gap: 14px; container-type: inline-size; }
  .block { display: grid; gap: 8px; min-width: 0; }
  .head { display: flex; align-items: center; gap: 6px; color: var(--muted); font-size: 11px; font-weight: 650;
    letter-spacing: 0.08em; text-transform: uppercase; }
  .none { margin: 0; color: var(--faint); font-size: 12.5px; }
  .k { color: var(--faint); font-size: 10.5px; font-weight: 650; letter-spacing: 0.06em; text-transform: uppercase; }

  .flow { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: start; gap: 8px; }
  .side { display: grid; gap: 6px; min-width: 0; }
  .nw { white-space: nowrap; }
  .side .d { color: var(--muted); font-size: 12px; line-height: 1.3; overflow-wrap: anywhere; }
  .arrow { display: grid; place-items: center; color: var(--accent); align-self: center; }
  @container (max-width: 270px) {
    .flow { grid-template-columns: minmax(0, 1fr); }
    .arrow { padding: 0; transform: rotate(90deg); }
  }

  .grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 3px; max-width: 240px; }
  .cell { display: block; text-align: center; font-size: 9.5px; font-weight: 650; line-height: 1; letter-spacing: -0.01em;
    padding: 5px 0; border: 1px solid var(--line); border-radius: 4px; color: var(--faint);
    overflow: hidden; white-space: nowrap; text-overflow: clip; }
  .cell.on { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }

  .vid { display: grid; grid-template-columns: auto auto auto minmax(0, 1fr); align-items: center;
    column-gap: 12px; row-gap: 5px; font-size: 12.5px; }
  .lbl { color: var(--muted); }
  .v { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .to { display: grid; place-items: center; color: var(--faint); }
  .to.conv, .v.conv { color: var(--accent); }
</style>
