<script>
  // A regular page: every panel of one section (optionally one Setup tab) in a customizable board.
  import { PANEL_LIST } from '../panels/index.js';
  import PanelBoard from '../lib/PanelBoard.svelte';

  let { section, tab = null } = $props();
  const ids = $derived(PANEL_LIST.filter((p) => p.section === section && (!tab || p.tab === tab)).map((p) => p.id));
  const page = $derived(tab ? `${section}-${tab}` : section);
</script>

{#key page}
  <PanelBoard {page} {ids} />
{/key}
