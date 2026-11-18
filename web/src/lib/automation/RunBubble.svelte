<script>
  // A bubble at the bottom of the screen while a rule runs (and for a few seconds after it ends), unless that
  // rule's row is on screen in the Automation panel, which highlights it itself. Tap it to go to the rule.
  import { avr } from '../avr.svelte.js';
  import { ui } from '../layout.svelte.js';
  import Icon from '../Icon.svelte';
  import { onScreen, showRule } from './store.svelte.js';

  const END = { done: 'done', stopped: 'stopped', cancelled: 'cancelled', error: 'failed' };
  const run = $derived(avr.run);
  // Over the editor the panel's rows are covered, so the bubble shows there too (but doesn't navigate away).
  const show = $derived(run && (ui.rule || !onScreen[run.automation]));
  const going = $derived(run?.status === 'running');
  const failed = $derived(run?.status === 'error');
</script>

<div class="live" role="status">
{#if show}
  <button class="bubble" class:going class:failed disabled={!!ui.rule} title={ui.rule ? null : 'Show in Automation'}
    onclick={() => showRule(run.automation)}>
    {#if going}<span class="dot"></span>
    {:else}<Icon name={failed ? 'x' : 'check'} size={14} />{/if}
    <span class="name">{run.name}</span>
    <span class="what">{going ? 'running' : (END[run.status] ?? run.status)}</span>
  </button>
{/if}
</div>

<style>
  .live { display: flex; justify-content: center; }
  .live:empty { display: none; }
  .bubble {
    all: unset; box-sizing: border-box; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; max-width: 100%;
    padding: 8px 14px; border-radius: 99px; background: var(--card-2); box-shadow: var(--shadow);
    border: 1px solid color-mix(in srgb, var(--good) 50%, var(--line)); color: var(--good);
    animation: pop 0.2s; transition: border-color 0.3s, color 0.3s;
  }
  .bubble:disabled { cursor: default; }
  .bubble:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .bubble.going { border-color: var(--accent); color: var(--accent); animation: pop 0.2s, glow 1.6s ease-in-out 0.2s infinite; }
  .bubble.failed { border-color: var(--bad); color: var(--bad); }
  .name { color: var(--text); font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  .what { font-size: 12.5px; white-space: nowrap; }
  .dot { width: 8px; height: 8px; flex: none; border-radius: 50%; background: currentColor; animation: blink 1s ease-in-out infinite; }
  @keyframes blink { 50% { opacity: 0.25; } }
  @keyframes glow {
    0%, 100% { box-shadow: var(--shadow), 0 0 0 0 color-mix(in srgb, var(--accent) 35%, transparent); }
    50% { box-shadow: var(--shadow), 0 0 0 6px color-mix(in srgb, var(--accent) 0%, transparent); }
  }
  @keyframes pop { from { opacity: 0; transform: translateY(8px); } }
  @media (prefers-reduced-motion: reduce) {
    .bubble, .bubble.going, .dot { animation: none; }
  }
</style>
