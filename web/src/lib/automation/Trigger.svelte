<script>
  // One line of the "when" hat: "Input changes [from …] [to …]" or "⟨condition⟩ becomes true".
  import { getContext } from 'svelte';
  import Cond from './Cond.svelte';
  import PropSelect from './PropSelect.svelte';
  import ValueInput from './ValueInput.svelte';
  import Pick from './Pick.svelte';
  import { newTrigger, fitToProp } from './model.js';

  let { trigger, index, removable } = $props();
  const ed = getContext('editor');
  const def = $derived(trigger.type === 'change' ? ed.catalog.find((p) => p.id === trigger.prop) : null);

  function kind(k) {
    if (k === trigger.type) return;
    ed.rule.when[index] = newTrigger(k, ed.catalog);
    ed.commit();
  }
  function setEnd(k, v) {
    if (v === undefined) delete trigger[k]; else trigger[k] = v;
    ed.commit();
  }
</script>

<div class="trig">
  {#if trigger.type === 'change'}
    <PropSelect catalog={ed.catalog} value={trigger.prop}
      onchange={(id) => { trigger.prop = id; fitToProp(trigger, ed.catalog.find((p) => p.id === id), 'change'); ed.commit(); }} />
    {#if def?.param}
      <Pick label={def.param.label} value={trigger.param} options={def.param.options.map((o) => ({ value: o.value, label: o.value }))}
        onchange={(v) => { trigger.param = v; ed.commit(); }} />
    {/if}
    <Pick label="Trigger kind" value="change" onchange={kind}
      options={[{ value: 'change', label: 'changes' }, { value: 'becomes', label: 'a condition becomes true…' }]} />
    {#if def && def.type !== 'set'}
      <span class="w">from</span><ValueInput {def} optional value={trigger.from} label="From" onchange={(v) => setEnd('from', v)} />
      <span class="w">to</span><ValueInput {def} optional value={trigger.to} label="To" onchange={(v) => setEnd('to', v)} />
    {/if}
  {:else}
    <Cond cond={trigger.cond} set={(c) => (trigger.cond = c)} />
    <Pick label="Trigger kind" value="becomes" onchange={kind}
      options={[{ value: 'becomes', label: 'becomes true' }, { value: 'change', label: 'a property changes…' }]} />
  {/if}
  {#if removable}
    <button class="x" aria-label="Remove this trigger" title="Remove" onclick={() => { ed.rule.when.splice(index, 1); ed.commit(); }}>×</button>
  {/if}
</div>

<style>
  .trig { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }
  .w { font-weight: 600; }
  .x { border: 0; background: none; color: inherit; opacity: 0.6; cursor: pointer; font-size: 16px; margin-left: auto; }
</style>
