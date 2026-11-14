<script>
  // The editor's dropdown: a pill on the block, and a popup list in the app's own style (like the Sound mode
  // dropdown) instead of the browser's native menu. Long lists get a search box; grouped options get headings.
  // Values can be any JSON value (true / false, numbers, strings); `multiple` picks a list.
  //   options: [{ value, label, group? }]
  let { value, options, onchange, label, multiple = false, placeholder = '…', search = options.length > 10 } = $props();

  const key = (v) => JSON.stringify(v);
  const chosen = $derived(multiple ? new Set((value ?? []).map(key)) : new Set([key(value)]));
  const text = $derived(
    multiple ? (options.filter((o) => chosen.has(key(o.value))).map((o) => o.label).join(', ') || placeholder)
    : (options.find((o) => key(o.value) === key(value))?.label ?? placeholder),
  );

  let anchor = $state(), menu = $state(), input = $state();
  let open = $state(false), q = $state(''), active = $state(0);
  const shown = $derived(options.filter((o) => !q.trim() || `${o.label} ${o.group ?? ''}`.toLowerCase().includes(q.trim().toLowerCase())));

  // The list is tied to the pill with CSS anchor positioning: the browser keeps it there while the editor scrolls.
  const uid = $props.id();
  const anchorName = `--pick-${uid}`;
  function show() {
    open = true; q = '';
    active = Math.max(0, options.findIndex((o) => chosen.has(key(o.value))));
    queueMicrotask(() => {
      menu.showPopover?.();
      (search ? input : menu.querySelector('.opt.on') ?? menu.querySelector('.opt'))?.focus();
      menu.querySelector('.opt.on')?.scrollIntoView({ block: 'nearest' });
    });
  }
  function closed() { open = false; }
  function hide() { menu?.hidePopover?.(); closed(); anchor?.focus(); }

  function choose(o) {
    if (!multiple) { onchange(o.value); hide(); return; }
    const next = options.filter((x) => (x === o ? !chosen.has(key(o.value)) : chosen.has(key(x.value)))).map((x) => x.value);
    onchange(next);
  }
  function onKey(e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      active = Math.max(0, Math.min(shown.length - 1, active + (e.key === 'ArrowDown' ? 1 : -1)));
      menu.querySelectorAll('.opt')[active]?.focus();
      if (search) input?.focus(); // keep typing in the search box
    } else if (e.key === 'Enter' && shown[active]) { e.preventDefault(); choose(shown[active]); }
  }
</script>

<button class="pick" class:open bind:this={anchor} style:anchor-name={anchorName} type="button" aria-label={label} aria-haspopup="listbox" aria-expanded={open}
  title={text} onclick={() => (open ? hide() : show())}>
  <span class="txt">{text}</span>
  <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
</button>

<div class="list" popover="auto" bind:this={menu} style:position-anchor={anchorName} role="listbox" aria-label={label} aria-multiselectable={multiple}
  tabindex="-1" onkeydown={onKey} ontoggle={(e) => { if (e.newState === 'closed') closed(); }}>
  {#if open}
    {#if search}
      <input class="q" type="search" placeholder="Search" aria-label="Search {label}" bind:this={input} bind:value={q} oninput={() => (active = 0)} />
    {/if}
    {#each shown as o, i (key(o.value))}
      {#if o.group && o.group !== shown[i - 1]?.group}<div class="head">{o.group}</div>{/if}
      <button class="opt" class:on={chosen.has(key(o.value))} class:act={i === active} role="option" aria-selected={chosen.has(key(o.value))}
        onclick={() => choose(o)} onmouseenter={() => (active = i)}>
        <span class="check">{chosen.has(key(o.value)) ? '✓' : ''}</span>{o.label}
      </button>
    {:else}
      <div class="none">No match</div>
    {/each}
  {/if}
</div>

<style>
  /* On the block: a light pill, like the other fields there. */
  .pick {
    display: inline-flex; align-items: center; gap: 6px; max-width: 100%; min-height: 26px; padding: 3px 8px 3px 9px;
    border: 0; border-radius: 6px; background: color-mix(in srgb, white 92%, transparent); color: #141821;
    font: 13px var(--font); cursor: pointer; text-align: left;
  }
  .pick:hover, .pick.open { background: #fff; }
  .txt { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pick svg { flex: none; opacity: 0.6; }

  /* The list: the app's menu style (see the Sound mode panel). */
  .list {
    position: fixed; inset: auto; margin: 6px 0; padding: 4px; overflow-y: auto; max-width: min(360px, calc(100vw - 16px));
    position-area: block-end span-inline-end; position-try-fallbacks: flip-block, flip-inline, flip-block flip-inline;
    position-try-order: most-height; max-height: min(100%, 340px); min-width: max(anchor-size(width), 160px);
    border: 1px solid var(--line); border-radius: 12px; background: var(--card); color: var(--text); box-shadow: var(--shadow);
  }
  .q { margin: 2px 2px 6px; width: calc(100% - 4px); min-height: 34px; padding: 6px 10px; }
  .head { padding: 8px 10px 4px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
  .opt {
    display: flex; align-items: center; gap: 8px; width: 100%; padding: 8px 10px; border: 0; border-radius: 8px;
    background: none; color: inherit; font: 13.5px var(--font); text-align: left; cursor: pointer; white-space: nowrap;
  }
  .opt.act, .opt:focus-visible { background: var(--card-2); outline: none; }
  .opt.on { color: var(--accent); font-weight: 600; }
  .check { width: 14px; flex: none; }
  .none { padding: 10px 12px; color: var(--muted); font-size: 13px; }
</style>
