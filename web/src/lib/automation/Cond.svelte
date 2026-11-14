<script>
  // A condition (Scratch's hexagon blocks): a comparison, a channel check, all of / any of, or not. Recursive.
  // An empty slot offers the condition kinds to put in it.
  import { getContext } from 'svelte';
  import Cond from './Cond.svelte';
  import PropSelect from './PropSelect.svelte';
  import ValueInput from './ValueInput.svelte';
  import ChannelPicker from './ChannelPicker.svelte';
  import { OPS, OP_LABELS, argKind, newCond, fitToProp, fitValue, condMissing } from './model.js';

  let { cond, set, adder = false } = $props(); // set(newCond | null) replaces this condition; adder: the "+" that adds one more to a list
  const ed = getContext('editor');
  const def = $derived(cond?.type === 'cmp' ? ed.catalog.find((p) => p.id === cond.prop) : null);
  let picking = $state(false);

  const KINDS = [['cmp', 'compare'], ['channels', 'channels'], ['all', 'all of'], ['any', 'any of'], ['not', 'not']];
  function add(kind) { picking = false; set(newCond(kind, ed.catalog)); ed.commit(); }
</script>

{#if !cond}
  {#if picking}
    <span class="slot picking">
      {#each KINDS as [k, label] (k)}<button class="kind" onclick={() => add(k)}>{label}</button>{/each}
      <button class="kind x" aria-label="Cancel" onclick={() => (picking = false)}>×</button>
    </span>
  {:else}
    <button class="slot" class:missing={!adder} onclick={() => (picking = true)}>{adder ? '+ add' : '+ condition'}</button>
  {/if}
{:else}
  <span class="hex" class:missing={condMissing(cond, ed.catalog)}>
    {#if cond.type === 'cmp'}
      <PropSelect catalog={ed.catalog} value={cond.prop} onchange={(id) => { cond.prop = id; fitToProp(cond, ed.catalog.find((p) => p.id === id), 'cmp'); ed.commit(); }} />
      {#if def?.param}
        <select class="f" aria-label={def.param.label} value={cond.param} onchange={(e) => { cond.param = e.currentTarget.value; ed.commit(); }}>
          {#each def.param.options as o (o.value)}<option value={o.value}>{o.value}</option>{/each}
        </select>
      {/if}
      {#if def}
        <select class="f op" aria-label="Comparison" value={cond.op} onchange={(e) => { cond.op = e.currentTarget.value; fitValue(cond, def); ed.commit(); }}>
          {#each OPS[def.type] as op (op)}<option value={op}>{OP_LABELS[op]}</option>{/each}
        </select>
        {#if argKind(cond.op) === 'one'}
          <ValueInput {def} value={cond.value} onchange={(v) => { cond.value = v; ed.commit(); }} />
        {:else if argKind(cond.op) === 'pair'}
          <ValueInput {def} value={cond.value?.[0]} onchange={(v) => { cond.value = [v, cond.value?.[1]]; ed.commit(); }} />
          <span class="w">and</span>
          <ValueInput {def} value={cond.value?.[1]} onchange={(v) => { cond.value = [cond.value?.[0], v]; ed.commit(); }} />
        {:else if argKind(cond.op) === 'list'}
          <ValueInput {def} multiple value={cond.value} onchange={(v) => { cond.value = v; ed.commit(); }} />
        {/if}
      {/if}
    {:else if cond.type === 'channels'}
      <select class="f" aria-label="Which channels" value={cond.of} onchange={(e) => { cond.of = e.currentTarget.value; ed.commit(); }}>
        <option value="input">input channels</option>
        <option value="speakers">active speakers</option>
      </select>
      <ChannelPicker {cond} onchange={() => ed.commit()} />
    {:else if cond.type === 'all' || cond.type === 'any'}
      <select class="f" aria-label="All or any" value={cond.type} onchange={(e) => { cond.type = e.currentTarget.value; ed.commit(); }}>
        <option value="all">all of</option>
        <option value="any">any of</option>
      </select>
      <span class="items">
        {#each cond.items as item, i (i)}
          <span class="item"><Cond cond={item} set={(c) => { if (c) cond.items[i] = c; else cond.items.splice(i, 1); }} /></span>
        {/each}
        <Cond cond={null} adder set={(c) => cond.items.push(c)} />
      </span>
    {:else if cond.type === 'not'}
      <span class="w">not</span>
      <Cond cond={cond.item} set={(c) => (cond.item = c)} />
    {/if}
    <button class="x" aria-label="Remove condition" title="Remove" onclick={() => { set(null); ed.commit(); }}>×</button>
  </span>
{/if}

<style>
  /* Scratch's boolean blocks are hexagons: pointed ends. */
  .hex, .slot {
    display: inline-flex; align-items: center; flex-wrap: wrap; gap: 6px; padding: 5px 18px; min-height: 34px; max-width: 100%; min-width: 0;
    background: var(--b-check); color: var(--b-ink);
    clip-path: polygon(12px 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 12px 100%, 0 50%);
  }
  .hex .hex { background: color-mix(in srgb, var(--b-check) 75%, white); }
  .slot { background: color-mix(in srgb, var(--b-ink) 18%, transparent); color: inherit; border: 0; font: inherit; cursor: pointer; }
  .slot.missing, .hex.missing { outline: 2px dashed var(--bad); outline-offset: -2px; }
  .picking { gap: 4px; }
  .kind { border: 0; border-radius: 999px; padding: 4px 10px; background: var(--b-check); color: var(--b-ink); font: inherit; font-size: 12.5px; cursor: pointer; }
  .kind.x { background: transparent; color: inherit; }
  .items { display: inline-flex; flex-direction: column; gap: 4px; align-items: flex-start; }
  .w { font-weight: 600; }
  .x { border: 0; background: none; color: inherit; opacity: 0.6; cursor: pointer; font-size: 16px; padding: 0 2px; }
  .x:hover { opacity: 1; }
</style>
