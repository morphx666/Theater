<script>
  // Home-only panel (added via Home › Customize › Add panels): switch between speaker presets.
  // Add, rename and delete them in Speakers › Speaker preset manager.
  import { avr } from '../lib/avr.svelte.js';
  import { applyPreset } from '../lib/speakerPresets.svelte.js';
  import Panel from '../lib/Panel.svelte';
  import Icon from '../lib/Icon.svelte';

  const sp = $derived(avr.speakerPresets);
  const on = $derived(avr.state?.zoneMain === true);

  function sub(p) {
    if (sp.busy?.id === p.id) return sp.busy.step + '…';
    if (sp.incomplete === p.id) return 'Not fully applied. Tap to retry';
    if (p.id === sp.active) return p.layout ? `${p.layout} speakers` : 'In use';
    return 'Tap to switch';
  }
</script>

<Panel id="speaker-presets" title="Speaker presets" needsPower>
  {#if sp?.supported === false}
    <p class="muted small">This receiver doesn't have speaker presets.</p>
  {:else if !sp?.list.length}
    <p class="muted small">Reading speaker presets…</p>
  {:else}
    <div class="presets">
      {#each sp.list as p (p.id)}
        {@const active = p.id === sp.active}
        <button class="tile preset" class:on={active} class:busy={sp.busy?.id === p.id} disabled={!!sp.busy || !on}
          aria-pressed={active} onclick={() => { if (!active || sp.incomplete === p.id) applyPreset(p.id); }}>
          <span class="top"><Icon name="speaker" size={20} />{#if active}<span class="badge">Active</span>{/if}</span>
          <span class="name">{p.name}</span>
          <span class="sub" class:bad={sp.incomplete === p.id}>{sub(p)}</span>
        </button>
      {/each}
    </div>
    {#if !sp.active}<p class="faint small">The receiver's current settings aren't saved in a preset.</p>{/if}
  {/if}
</Panel>

<style>
  .presets { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; }
  .preset { min-height: 104px; gap: 6px; }
  .top { display: flex; justify-content: space-between; align-items: center; width: 100%; }
  .badge { font-size: 11px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: var(--accent); }
  .name { font-size: 17px !important; overflow-wrap: anywhere; }
  .sub { font-size: 12.5px !important; font-weight: 500 !important; color: var(--muted) !important; }
  .sub.bad { color: var(--bad) !important; }
  .busy { animation: pulse 1s ease-in-out infinite; }
  @keyframes pulse { 50% { opacity: 0.6; } }
  p { margin: 10px 0 0; }
</style>
