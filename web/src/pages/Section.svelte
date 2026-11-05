<script>
  // A plain page: every panel of one section (optionally one Setup tab), in registry order.
  import { PANEL_LIST } from '../panels/index.js';

  let { section, tab = null } = $props();
  const list = $derived(PANEL_LIST.filter((p) => p.section === section && (!tab || p.tab === tab)));
</script>

<div class="panels">
  {#each list as p (p.id)}
    <p.comp />
  {/each}
</div>
