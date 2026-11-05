<script>
  import Panel from '../lib/Panel.svelte';
  import VolumeDial from '../lib/VolumeDial.svelte';
  import { panelOption } from '../lib/layout.svelte.js';
</script>

<Panel id="volume" title="Volume">
  <VolumeDial locked={panelOption('volume', 'locked')} />
</Panel>
