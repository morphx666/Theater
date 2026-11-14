<script>
  import { avr, send, api, toast } from '../lib/avr.svelte.js';
  import Panel from '../lib/Panel.svelte';

  // Sound modes as button groups: tapping a group picks its usual mode, the arrow lists the modes in it.
  // The lists come from the server (server/sound-modes.ts), which learns what this receiver actually offers for
  // the signal playing: the owner's manual lists modes this unit doesn't offer.
  const st = $derived(avr.state);
  const sm = $derived(avr.soundModes);
  const on = $derived(st?.zoneMain === true);
  const azs = $derived(st?.allZoneStereo === true); // only Stereo and Multi Ch Stereo then (manual p.115)
  const busy = $derived(!!sm?.busy);
  const dts = $derived(sm?.family === 'dts');

  const GROUPS = [
    // Hints from the owner's manual (NA edition, pp.117-122).
    { id: 'surround', label: 'Surround', hint: 'The surround mode for the signal playing', tap: () => (dts ? 'MSDTS SURROUND' : 'MSDOLBY DIGITAL') },
    { id: 'stereo', label: 'Stereo', hint: 'Stereo, or stereo through all speakers', tap: () => 'MSSTEREO', stereo: true },
    { id: 'direct', label: 'Direct', hint: 'Unprocessed; Pure Direct also turns off the display', tap: () => 'MSDIRECT' },
  ];
  const modes = (g) => (sm?.available ?? []).filter((m) => m.group === g);
  // Headings in the Surround list (the server sorts it: the mode that plays the source as it is first).
  const KINDS = { source: 'As the source', upmix: 'Upmixed', effect: 'Effects' };
  const current = $derived((sm?.available ?? []).find((m) => m.mode === st?.surround) ?? null);

  // One menu for the three groups, tied to the open group's button with CSS anchor positioning (the browser keeps
  // it there while the page scrolls, and opens it upward when there's no room below).
  const uid = $props.id();
  let openGroup = $state(null);
  let menu = $state();

  function openMenu(id) {
    openGroup = id;
    menu.style.positionAnchor = `--sound-mode-${uid}-${id}`;
    menu.showPopover?.();
  }
  function closed() { openGroup = null; learnArmed = false; }
  function closeMenu() { menu?.hidePopover?.(); closed(); }

  // "Learn modes": steps through the remote's three buttons once for the signal playing. Offered until this
  // signal's modes are learned (and again after a firmware update). Tap twice: the audio drops a few times.
  let learnArmed = $state(false);
  async function learn() {
    if (!learnArmed) { learnArmed = true; return; }
    closeMenu();
    toast('Learning the sound modes for this signal…');
    try {
      const r = await api('/api/sound-mode', { method: 'POST', body: { action: 'learn' } });
      toast(`Learned ${r.modes.length} surround mode${r.modes.length === 1 ? '' : 's'}`);
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  async function pick(mode) {
    closeMenu();
    if (mode === st?.surround) return;
    try {
      await api('/api/sound-mode', { method: 'POST', body: { mode } });
    } catch (e) {
      toast(e.message === 'not available for this signal' ? 'Not available for this signal' : e.message, 'error');
    }
  }
</script>

<Panel id="sound-mode" title="Sound mode">
  {#snippet actions()}<span class="pill">{current?.label ?? st.surround ?? '—'}</span>{/snippet}
  <div class="groups">
    {#each GROUPS as g (g.id)}
      {@const list = modes(g.id)}
      {@const active = current?.group === g.id}
      {@const disabled = !on || busy || (azs && !g.stereo)}
      <div class="grp btn" class:on={active} class:disabled style:anchor-name="--sound-mode-{uid}-{g.id}"
        title={azs && !g.stereo ? 'Only stereo modes during All Zone Stereo' : g.hint}>
        <button class="main" {disabled} onclick={() => send(g.tap())}>
          <span class="name">{g.label}</span>
          <span class="sub">{active ? current.label : list.length === 1 ? list[0].label : `${list.length} modes`}</span>
        </button>
        <button class="arrow" {disabled} aria-label="{g.label} modes" aria-haspopup="menu" aria-expanded={openGroup === g.id}
          onclick={() => (openGroup === g.id ? closeMenu() : openMenu(g.id))}>
          <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
        </button>
      </div>
    {/each}
    <button class="btn auto" disabled={!on || busy || azs} title="Matches the input format" onclick={() => send('MSAUTO')}>Auto</button>
  </div>
  <div class="remote">
    {#each [['MSMOVIE', 'Movie'], ['MSMUSIC', 'Music'], ['MSGAME', 'Game']] as [cmd, label] (cmd)}
      <button class="btn small" disabled={!on || busy || azs} title="Press again for the next mode" onclick={() => send(cmd)}>{label}</button>
    {/each}
  </div>
</Panel>

<div class="menu" popover="auto" role="menu" bind:this={menu} ontoggle={(e) => { if (e.newState === 'closed') closed(); }}>
  {#if openGroup}
    {@const list = modes(openGroup)}
    {#each list as m, i (m.mode)}
      {#if m.kind && m.kind !== list[i - 1]?.kind && new Set(list.map((x) => x.kind)).size > 1}
        <div class="head">{KINDS[m.kind]}</div>
      {/if}
      <button role="menuitemradio" aria-checked={m.mode === st?.surround} class:sel={m.mode === st?.surround} onclick={() => pick(m.mode)}>
        <span class="check">{m.mode === st?.surround ? '✓' : ''}</span>{m.label}
      </button>
    {:else}
      <div class="empty faint small">Nothing learned for this signal yet</div>
    {/each}
    {#if openGroup === 'surround' && sm?.canLearn}
      <div class="sep"></div>
      <button class="learn" class:armed={learnArmed} onclick={learn}>
        <span class="check"></span>{learnArmed ? 'Tap again (audio drops a few times)' : `Learn available modes for '${sm.signalName ?? 'this signal'}'`}
      </button>
    {/if}
  {/if}
</div>

<style>
  .groups { display: grid; grid-template-columns: repeat(auto-fill, minmax(124px, 1fr)); gap: 8px; }
  /* A group looks like one button: the main part picks the usual mode, the arrow opens the list. */
  .grp { padding: 0; gap: 0; align-items: stretch; overflow: hidden; }
  .grp.disabled { opacity: 0.4; }
  .grp button { appearance: none; background: none; border: 0; color: inherit; cursor: pointer; font: inherit; }
  .grp button:disabled { cursor: not-allowed; }
  .main { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: flex-start; justify-content: center; padding: 6px 4px 6px 12px; text-align: left; }
  .name { font-weight: 600; }
  .sub { font-size: 11.5px; opacity: 0.75; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
  .arrow { flex: none; width: 30px; display: grid; place-items: center; border-left: 1px solid color-mix(in srgb, currentColor 18%, transparent) !important; }
  .grp:active { transform: none; }
  .main:active, .arrow:active { transform: scale(0.94); }
  .auto { min-height: 52px; }
  .remote { display: flex; justify-content: center; gap: 6px; margin-top: 10px; flex-wrap: wrap; }

  /* Under its group's button (above when there's more room there), as wide as it at least; long lists scroll. */
  .menu {
    position: fixed; inset: auto; margin: 6px 0; padding: 4px; overflow-y: auto;
    position-area: block-end span-inline-end; position-try-fallbacks: flip-block, flip-inline, flip-block flip-inline;
    position-try-order: most-height; max-height: min(100%, 420px); min-width: max(anchor-size(width), 160px);
    border: 1px solid var(--line); border-radius: 12px; background: var(--card); color: var(--text); box-shadow: var(--shadow);
  }
  .menu button {
    display: flex; align-items: center; gap: 8px; width: 100%; padding: 10px 12px; border: 0; border-radius: 8px;
    background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; white-space: nowrap;
  }
  .menu button:hover { background: var(--card-2); }
  .menu button.sel { color: var(--accent); font-weight: 600; }
  .check { width: 14px; flex: none; }
  .empty { padding: 10px 12px; }
  .sep { height: 1px; background: var(--line); margin: 4px 6px; }
  .head { padding: 8px 12px 2px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
  .head:not(:first-child) { margin-top: 4px; border-top: 1px solid var(--line); padding-top: 10px; }
  .menu button.learn { color: var(--muted); font-size: 13px; }
  .menu button.learn.armed { color: var(--warn, var(--accent)); }
</style>
