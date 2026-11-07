<script>
  import Section from './Section.svelte';
  import { ui } from '../lib/layout.svelte.js';

  const TABS = [['inputs', 'Inputs'], ['audio', 'Audio & Volume'], ['network', 'Network'], ['general', 'General'], ['app', 'App & Info']];
  const tab = $derived(TABS.some(([id]) => id === ui.setupTab) ? ui.setupTab : 'inputs');
</script>

<div class="seg tabs" role="tablist">
  {#each TABS as [id, label]}
    <button role="tab" class:on={tab === id} aria-selected={tab === id} onclick={() => (ui.setupTab = id)}>{label}</button>
  {/each}
</div>

{#key tab}
  <Section section="setup" {tab} />
{/key}

<style>
  .tabs { margin-bottom: 16px; max-width: 640px; }
</style>
