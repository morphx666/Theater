<script>
  // Home-only panel (added via Home › Customize › Add panels): switch between the two speaker presets.
  import { avr, send } from '../lib/avr.svelte.js';
  import Panel from '../lib/Panel.svelte';
  import Icon from '../lib/Icon.svelte';

  const st = $derived(avr.state);
  const current = $derived(st?.speakerPreset ?? null);
  let pending = $state(null); // preset requested, until the receiver confirms
  let timer;

  function pick(n) {
    if (n === current || pending) return;
    pending = n;
    send('SPPR ' + n);
    clearTimeout(timer);
    timer = setTimeout(() => (pending = null), 8000); // give up waiting after 8 s
  }
  $effect(() => { if (pending && current === pending) { pending = null; clearTimeout(timer); } });

  // Speakers in the active preset (from the receiver's speaker setup), e.g. "5.1.2"
  const layout = $derived.by(() => {
    const ch = st?.installed ?? [];
    if (!ch.length) return null;
    const subs = ch.filter((c) => c.startsWith('SW')).length;
    const heights = ch.filter((c) => /^(FH|TF|TM|TR|FD|SD|BD|RH|SH|TS|CH)/.test(c)).length;
    return `${ch.length - subs - heights}.${subs}${heights ? '.' + heights : ''}`;
  });
</script>

<Panel id="speaker-presets" title="Speaker presets">
  {#if current === '0' || current === null}
    <p class="muted small">This receiver isn't reporting speaker presets.</p>
  {:else}
    <div class="presets">
      {#each ['1', '2'] as n}
        {@const active = current === n}
        <button class="tile preset" class:on={active} class:busy={pending === n} disabled={!!pending && pending !== n}
          aria-pressed={active} onclick={() => pick(n)}>
          <span class="top"><Icon name="speaker" size={20} />{#if active}<span class="badge">Active</span>{/if}</span>
          <span class="name">Preset {n}</span>
          <span class="sub">{pending === n ? 'Switching…' : active && layout ? `${layout} speakers` : active ? 'In use' : 'Tap to switch'}</span>
        </button>
      {/each}
    </div>
    <p class="faint small">Each preset is a complete speaker setup: sizes, distances, levels, crossovers and Audyssey calibration.
      Switching takes a few seconds.</p>
  {/if}
</Panel>

<style>
  .presets { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .preset { min-height: 104px; gap: 6px; }
  .top { display: flex; justify-content: space-between; align-items: center; width: 100%; }
  .badge { font-size: 11px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: var(--accent); }
  .name { font-size: 17px !important; }
  .sub { font-size: 12.5px !important; font-weight: 500 !important; color: var(--muted) !important; }
  .busy { animation: pulse 1s ease-in-out infinite; }
  @keyframes pulse { 50% { opacity: 0.6; } }
  p { margin: 10px 0 0; }
</style>
