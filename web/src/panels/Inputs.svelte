<script>
  import { avr, send, SOURCE_ORDER, SOURCE_ICONS } from '../lib/avr.svelte.js';
  import Icon from '../lib/Icon.svelte';
  import Panel from '../lib/Panel.svelte';

  const st = $derived(avr.state);
  const on = $derived(st?.zoneMain === true);
  const inputs = $derived(
    SOURCE_ORDER.filter((c) => st.inputs[c] && !st.inputs[c].hidden).map((c) => ({ code: c, ...st.inputs[c] })),
  );
</script>

<Panel id="inputs" title="Input">
  <div class="inputs">
    {#each inputs as i (i.code)}
      <button class="tile" class:on={st.source === i.code} disabled={!on} onclick={() => send('SI' + i.code)}>
        <Icon name={SOURCE_ICONS[i.code] ?? 'plug'} size={22} />
        <span>{i.name}</span>
      </button>
    {/each}
  </div>
</Panel>

<style>
  .inputs { display: grid; grid-template-columns: repeat(auto-fill, minmax(118px, 1fr)); gap: 10px; }
  @media (max-width: 480px) { .inputs { grid-template-columns: repeat(3, 1fr); gap: 8px; } }
</style>
