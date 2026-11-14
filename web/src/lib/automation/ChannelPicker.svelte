<script>
  // Channel picker for a "channels" condition: the receiver's speaker-layout grid as chips. Tap to cycle
  // don't care -> present -> absent. The layout comes from the receiver's own grid (the Status panel's signal
  // view) when it's known, otherwise a standard one.
  import { avr } from '../avr.svelte.js';

  let { cond, onchange } = $props();

  const DEFAULT = {
    input: [['FHL', 'LFE', null, null, 'FHR'], ['FWL', 'FL', 'C', 'FR', 'FWR'], ['SHL', 'SL', 'TS', 'SR', 'SHR'], [null, 'SBL', 'SB', 'SBR', null]],
    speakers: [['FDL', 'SW', null, 'SW2', 'FDR'], ['FHL', 'FL', 'C', 'FR', 'FHR'], ['SDL', 'SL', null, 'SR', 'SDR'], [null, 'SBL', 'SB', 'SBR', null]],
  };
  const grid = $derived.by(() => {
    const live = avr.state?.audioMap?.[cond.of === 'input' ? 'input' : 'output'];
    const rows = live?.length ? live.map((r) => r.map((c) => (c && c.ch !== 'EXT' ? c.ch : null))) : DEFAULT[cond.of];
    // Channels already marked but missing from this layout still get a chip.
    const shown = new Set(rows.flat().filter(Boolean));
    const extra = [...cond.present, ...cond.absent].filter((c) => !shown.has(c));
    return extra.length ? [...rows, extra] : rows;
  });
  const stateOf = (ch) => (cond.present.includes(ch) ? 'present' : cond.absent.includes(ch) ? 'absent' : 'any');

  function cycle(ch) {
    const s = stateOf(ch);
    cond.present = cond.present.filter((c) => c !== ch);
    cond.absent = cond.absent.filter((c) => c !== ch);
    if (s === 'any') cond.present.push(ch);
    else if (s === 'present') cond.absent.push(ch);
    onchange?.();
  }
</script>

<div class="picker" role="group" aria-label="Channels">
  {#each grid as row, r (r)}
    <div class="row">
      {#each row as ch, i (i)}
        {#if ch}
          {@const s = stateOf(ch)}
          <button class="chip {s}" title="{ch}: {s === 'any' ? "don't care" : s} (tap to change)" aria-label="{ch} {s}" onclick={() => cycle(ch)}>{ch}</button>
        {:else}
          <span class="chip empty"></span>
        {/if}
      {/each}
    </div>
  {/each}
</div>

<style>
  .picker { display: inline-flex; flex-direction: column; gap: 4px; padding: 6px; border-radius: 10px; background: color-mix(in srgb, black 18%, transparent); }
  .row { display: flex; gap: 4px; }
  .chip {
    width: 40px; height: 26px; border-radius: 7px; border: 1px solid color-mix(in srgb, currentColor 25%, transparent);
    background: transparent; color: inherit; font: 600 11px var(--mono); cursor: pointer; padding: 0; opacity: 0.55;
  }
  .chip.empty { border: 0; cursor: default; }
  @media (max-width: 760px) { .chip { width: 34px; } }
  .chip.present { opacity: 1; background: var(--good); border-color: var(--good); color: #04140c; }
  .chip.absent { opacity: 1; background: var(--bad); border-color: var(--bad); color: #fff; text-decoration: line-through; }
</style>
