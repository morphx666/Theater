<script>
  // Compact speaker preset switcher (Quick settings, Speaker setup).
  import { avr } from './avr.svelte.js';
  import { applyPreset } from './speakerPresets.svelte.js';

  let { label = 'Speaker preset' } = $props();
  const sp = $derived(avr.speakerPresets);
  let picked = $state(null); // shown while switching, until the server reports the new active preset

  async function pick(id) {
    picked = id;
    await applyPreset(id);
    picked = null;
  }
</script>

{#if sp?.list.length}
  <select aria-label={label} value={picked ?? sp.active ?? ''} disabled={!!sp.busy || avr.state?.zoneMain !== true}
    onchange={(e) => pick(e.currentTarget.value)}>
    {#if !sp.active}<option value="" disabled>Not saved</option>{/if}
    {#each sp.list as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
  </select>
{/if}

<style>
  select { width: 180px; max-width: 50vw; flex: none; }
</style>
