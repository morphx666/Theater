<script>
  import Section from './Section.svelte';

  const TABS = [['inputs', 'Inputs'], ['audio', 'Audio & Volume'], ['general', 'General'], ['app', 'App & Info']];
  let tab = $state('inputs');
</script>

<div class="seg tabs" role="tablist">
  {#each TABS as [id, label]}
    <button role="tab" class:on={tab === id} aria-selected={tab === id} onclick={() => (tab = id)}>{label}</button>
  {/each}
</div>

{#key tab}
  <Section section="setup" {tab} />
{/key}

<style>
  .tabs { margin-bottom: 16px; max-width: 640px; }
</style>
