<script>
  import { avr, send, toast } from '../lib/avr.svelte.js';
  import Icon from '../lib/Icon.svelte';
  import Panel from '../lib/Panel.svelte';

  const st = $derived(avr.state);
  const on = $derived(st?.zoneMain === true);

  let pressTimer;
  function pressStart(n) {
    pressTimer = setTimeout(() => { pressTimer = null; confirmSave = n; }, 700);
  }
  function pressEnd(n) {
    if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; send('MSQUICK' + n); }
  }
  let confirmSave = $state(null);
  function doSave() {
    send(`MSQUICK${confirmSave} MEMORY`);
    toast(`Saved current settings to Quick Select ${confirmSave}`);
    confirmSave = null;
  }
</script>

<Panel id="quick-select" title="Quick Select">
  {#snippet actions()}<span class="faint small">long-press to save</span>{/snippet}
  <div class="quick">
    {#each [1, 2, 3, 4] as n}
      <button class="tile q" class:on={st.quick === n} disabled={!on}
        onpointerdown={() => pressStart(n)} onpointerup={() => pressEnd(n)}
        onpointerleave={() => pressTimer && (clearTimeout(pressTimer), (pressTimer = null))}
        onkeydown={(e) => e.key === 'Enter' && (e.shiftKey ? (confirmSave = n) : send('MSQUICK' + n))}
        oncontextmenu={(e) => e.preventDefault()}>
        <span class="num">{n}</span>
        <span>{st.quickNames[n - 1] || `Quick ${n}`}</span>
      </button>
    {/each}
  </div>
</Panel>

{#if confirmSave}
  <div class="modal" role="dialog" aria-modal="true">
    <div class="card">
      <h3>Save Quick Select {confirmSave}?</h3>
      <p class="muted">Replaces “{st.quickNames[confirmSave - 1] || 'empty'}” with the current input, sound mode and audio settings
        (and the volume, if enabled).</p>
      <p class="muted small">Recalling it stays within your volume cap ({avr.cap} dB).</p>
      <div class="row" style="justify-content:flex-end">
        <button class="btn" onclick={() => (confirmSave = null)}>Cancel</button>
        <button class="btn primary" onclick={doSave}><Icon name="save" size={18} />Save</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .quick { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
  @media (max-width: 480px) { .quick { grid-template-columns: repeat(2, 1fr); } }
  .q { min-height: 74px; -webkit-touch-callout: none; }
  .q .num { font-size: 12px; color: var(--accent); font-weight: 700; }
</style>
