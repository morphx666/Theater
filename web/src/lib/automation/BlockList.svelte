<script>
  // A stack of blocks with a drop gap between each (and before the first, after the last). Tap a gap to insert
  // the next palette block there; while dragging, the gaps open up.
  import { getContext } from 'svelte';
  import Block from './Block.svelte';

  let { list, path } = $props(); // path: keys from the rule to this list, e.g. ['script', 2, 'then']
  const ed = getContext('editor');
  const pkey = $derived(JSON.stringify(path));
  const isCursor = (i) => ed.cursor && JSON.stringify(ed.cursor.list) === pkey && ed.cursor.index === i;
  const isOver = (i) => ed.drag?.over && JSON.stringify(ed.drag.over.list) === pkey && ed.drag.over.index === i;
</script>

{#snippet gap(i)}
  <button class="gap" class:cursor={isCursor(i)} class:over={isOver(i)} data-gap={pkey} data-index={i}
    aria-label="Insert here" title="Insert the next block here" onclick={() => ed.setCursor(path, i)}></button>
{/snippet}

<div class="stack" class:empty={!list.length}>
  {@render gap(0)}
  {#each list as block, i (block)}
    <Block {block} {path} index={i} />
    {@render gap(i + 1)}
  {/each}
</div>

<style>
  .stack { display: flex; flex-direction: column; min-height: 8px; }
  .stack.empty { min-height: 30px; justify-content: center; }
  .gap {
    display: block; width: 100%; height: 8px; margin: 0; padding: 0; border: 0; background: transparent; cursor: pointer;
    border-radius: 6px; transition: height 0.12s, background 0.12s;
  }
  .gap:hover, .gap.cursor { background: color-mix(in srgb, var(--accent) 35%, transparent); }
  .gap.cursor { height: 10px; box-shadow: 0 0 0 2px var(--accent); }
  :global(.dragging) .gap { height: 22px; background: color-mix(in srgb, var(--accent) 12%, transparent); }
  :global(.dragging) .gap.over { height: 34px; background: color-mix(in srgb, var(--accent) 45%, transparent); box-shadow: 0 0 0 2px var(--accent); }
</style>
