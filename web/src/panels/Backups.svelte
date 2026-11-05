<script>
  import { avr, api, toast } from '../lib/avr.svelte.js';
  import Icon from '../lib/Icon.svelte';
  import Panel from '../lib/Panel.svelte';
  import Seg from '../lib/Seg.svelte';
  import Slider from '../lib/Slider.svelte';

  let backups = $state(null);
  async function loadBackups() {
    try { backups = await api('/api/setup/backups'); } catch (e) { toast(e.message, 'error'); }
  }
</script>

<Panel id="backups" title="Setup backups">
  {#snippet actions()}<button class="btn small" onclick={loadBackups}><Icon name="reset" size={16} />Refresh</button>{/snippet}
      <p class="muted small">Before every setup change, the previous value is saved on the server (in <span class="mono">data/backups</span>).</p>
      {#if backups === null}
        <button class="btn" onclick={loadBackups}>Show backups</button>
      {:else if !backups.length}
        <p class="faint">No changes made yet.</p>
      {:else}
        <ul class="backups">
          {#each backups.slice(0, 50) as b}
            <li><a href="/api/setup/backups/{b}" target="_blank" class="mono small">{b}</a></li>
          {/each}
        </ul>
      {/if}
</Panel>

<style>
  .backups { list-style: none; padding: 0; margin: 0; display: grid; gap: 4px; max-height: 260px; overflow: auto; }
  .backups a { color: var(--blue); }
</style>
