<script>
  // Live telnet traffic + a (guarded) command box for power users.
  import { onRaw, send } from '../lib/avr.svelte.js';
  import Icon from '../lib/Icon.svelte';
  import Panel from '../lib/Panel.svelte';
  import { loadOpen, saveOpen } from '../lib/remember.js';

  let open = $state(loadOpen('console', false));
  $effect(() => saveOpen('console', open));
  let lines = $state([]);
  let cmd = $state('');
  let box = $state();

  $effect(() => {
    if (!open) return;
    lines = [];
    const off = onRaw((l) => {
      lines.push(l);
      if (lines.length > 300) lines.splice(0, lines.length - 300);
      queueMicrotask(() => box && (box.scrollTop = box.scrollHeight));
    });
    return off;
  });

  function submit(e) {
    e.preventDefault();
    if (!cmd.trim()) return;
    send(cmd.trim());
    lines.push('» ' + cmd.trim().toUpperCase());
    cmd = '';
  }
</script>

<Panel id="console" title="Console">
  {#snippet actions()}
    <button class="switch" class:on={open} aria-label="Show console" onclick={() => (open = !open)}></button>
  {/snippet}
  {#if open}
    <div class="log mono" bind:this={box}>
      {#each lines as l, i (i)}<div class:me={l.startsWith('»')}>{l}</div>{/each}
      {#if !lines.length}<div class="faint">Waiting for traffic…</div>{/if}
    </div>
    <form class="row" onsubmit={submit}>
      <input type="text" class="mono" placeholder="e.g. PSDYNEQ ? or MSQUICK1" bind:value={cmd} autocapitalize="characters" autocomplete="off" spellcheck="false" />
      <button class="btn primary" type="submit"><Icon name="terminal" size={18} />Send</button>
    </form>
    <p class="faint small">Commands pass through the same safety filter as the rest of the app (no reset/firmware/lock, volume capped).</p>
  {:else}
    <p class="muted small">Watch the raw telnet protocol live and send commands by hand.</p>
  {/if}
</Panel>

<style>
  .log { height: 240px; overflow: auto; background: var(--bg); border: 1px solid var(--line); border-radius: 10px; padding: 10px; font-size: 12.5px; margin-bottom: 10px; }
  .log .me { color: var(--accent); }
  p { margin: 8px 0 0; }
</style>
