<script>
  // Wiring warning shown before a speaker preset changes Amp Assign (mounted once, in App.svelte).
  import { presetUi, applyPreset, AMP_MODES } from './speakerPresets.svelte.js';
  import Icon from './Icon.svelte';

  const c = $derived(presetUi.confirm);
  const mode = (v) => AMP_MODES[v] ?? `mode ${v}`;
  function go() {
    const id = c.id;
    presetUi.confirm = null;
    applyPreset(id, true);
  }
</script>

{#if c}
  <div class="modal" role="dialog" aria-modal="true">
    <div class="card">
      <h3>Switch to “{c.name}”?</h3>
      <p>It changes Amp Assign from {mode(c.from)} to {mode(c.to)}.</p>
      <p class="warn"><Icon name="info" size={18} />Rewire your speakers to match first.</p>
      <p class="muted">With the wrong wiring, speakers can get the wrong signal and be damaged.</p>
      <div class="row" style="justify-content:flex-end">
        <button class="btn" onclick={() => (presetUi.confirm = null)}>Cancel</button>
        <button class="btn primary" onclick={go}>Switch</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .warn { display: flex; gap: 8px; align-items: center; color: var(--accent); }
</style>
