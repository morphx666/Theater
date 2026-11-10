<script>
  // Standard card wrapper used by every panel: title, optional header actions, pin-to-Home button,
  // and a standby placeholder for panels that need the main zone on.
  import { getContext } from 'svelte';
  import { avr } from './avr.svelte.js';
  import { isPinned, togglePin } from './layout.svelte.js';
  import Icon from './Icon.svelte';
  import { smoothSize } from './smoothSize.js';

  let { id, title = '', actions = null, children, needsPower = false, hero = false, class: cls = '' } = $props();

  const onHome = getContext('home') ?? false;
  const panelLink = getContext('panelLink');
  const link = $derived(panelLink?.(id) ?? null); // on Home: where this panel lives
  const off = $derived(needsPower && avr.state?.zoneMain !== true);
  const pinned = $derived(isPinned(id));
</script>

<section class="card panel {cls}" class:hero data-panel={id} use:smoothSize>
  <div class="sz">
    {#if title}
      <h2>
        <span class="t">{title}{#if link}<a class="go" href={link.href} title="Open {link.label}"
          aria-label="Open {title} in {link.label}"><Icon name="link" size={13} /></a>{/if}</span>
        <span class="acts">
          {#if actions && !off}{@render actions()}{/if}
          {#if !onHome}
            <button class="pin" class:on={pinned} title={pinned ? 'Unpin from Home' : 'Pin to Home'}
              aria-label={pinned ? `Unpin ${title} from Home` : `Pin ${title} to Home`} aria-pressed={pinned}
              onclick={() => togglePin(id, title)}><Icon name="pin" size={15} /></button>
          {/if}
        </span>
      </h2>
    {:else if !onHome}
      <button class="pin float" class:on={pinned} title={pinned ? 'Unpin from Home' : 'Pin to Home'} aria-pressed={pinned}
        aria-label={pinned ? 'Unpin from Home' : 'Pin to Home'} onclick={() => togglePin(id, 'Panel')}><Icon name="pin" size={15} /></button>
    {/if}
    {#if off}
      <p class="muted small standby">Main zone is in standby.</p>
    {:else}
      {@render children()}
    {/if}
  </div>
</section>

<style>
  .panel { position: relative; min-width: 0; }
  .sz { display: flow-root; } /* contains child margins, so its height is the content's full height */
  h2 .t { flex: 1; min-width: 0; }
  /* link to the panel's page: shown while hovering the title (always, faintly, on touch screens) */
  .go { display: inline-grid; place-items: center; width: 22px; height: 22px; margin: -4px 0 -4px 4px; vertical-align: middle;
    border-radius: 6px; color: var(--faint); opacity: 0; transition: opacity 0.15s, color 0.15s, background 0.15s; }
  h2:hover .go, .go:focus-visible { opacity: 1; }
  .go:hover { color: var(--accent); background: var(--card-2); }
  @media (hover: none) { .go { opacity: 0.6; } }
  .acts { display: inline-flex; align-items: center; gap: 8px; text-transform: none; letter-spacing: 0; font-weight: 500; }
  .pin {
    width: 30px; height: 30px; border-radius: 50%; border: 1px solid transparent; background: none; color: var(--faint);
    display: grid; place-items: center; cursor: pointer; flex: none; transition: color 0.15s, background 0.15s;
  }
  .pin:hover { color: var(--text); background: var(--card-2); }
  .pin.on { color: var(--accent); }
  .pin.float { position: absolute; top: 12px; right: 12px; z-index: 1; }
  .standby { margin: 0; }
  .hero { background: radial-gradient(120% 140% at 0% 0%, color-mix(in srgb, var(--accent) 16%, transparent), transparent 60%), var(--card); }
</style>
