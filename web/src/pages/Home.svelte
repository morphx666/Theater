<script>
  // Customizable Home: shows the user's pinned panels in their chosen order.
  // "Customize" mode: drag the grip (mouse or touch) or use ↑/↓ to reorder, ✕ to unpin, "Add panels" to pin more.
  import { setContext } from 'svelte';
  import { PANELS, PANEL_LIST, SECTION_LABELS } from '../panels/index.js';
  import { homeIds, homeLanes, homeSpans, setHome, resetHome, ui, DEFAULT_HOME } from '../lib/layout.svelte.js';
  import Icon from '../lib/Icon.svelte';
  import { lanes } from '../lib/lanes.js';

  setContext('home', true);

  const saved = $derived(homeIds().filter((id) => PANELS[id]));
  const savedLanes = $derived(homeLanes());
  const savedSpans = $derived(homeSpans());
  let dragOrder = $state(null); // live order while dragging
  let dragLanes = $state(null); // live column choices while dragging
  let dragId = $state(null);
  const order = $derived(dragOrder ?? saved);
  const hints = $derived(dragLanes ?? savedLanes);
  let adding = $state(false);
  let lastMoved = $state(null); // drawn on top while panels animate
  let cols = $state(1); // current number of columns (reported by the layout engine)

  const available = $derived(
    Object.entries(SECTION_LABELS)
      .map(([sec, label]) => ({ label, panels: PANEL_LIST.filter((p) => p.section === sec && !saved.includes(p.id)) }))
      .filter((g) => g.panels.length),
  );
  const isDefault = $derived(JSON.stringify(saved) === JSON.stringify(DEFAULT_HOME) && !Object.keys(savedLanes).length && !Object.keys(savedSpans).length);

  function remove(id) { setHome(saved.filter((x) => x !== id)); }
  function add(id) { setHome([...saved, id]); }

  // ---- columns ----
  let grid = $state();
  /** Column each panel currently sits in, as laid out on screen. */
  function currentLanes() {
    const out = {};
    for (const el of grid?.querySelectorAll(':scope > [data-slot]') ?? []) out[el.dataset.slot] = Number(el.dataset.lane ?? 0);
    return out;
  }
  /** Panels that occupy a given column (wider panels occupy several), in order. */
  function columnOf(lanesMap, ord, lane) {
    return ord.filter((id) => {
      const st = lanesMap[id];
      return st !== undefined && lane >= st && lane < st + (spanMap[id] ?? 1);
    });
  }
  function colWidth() {
    const r = grid.getBoundingClientRect();
    return (r.width - 16 * (cols - 1)) / cols;
  }
  function colAt(x) {
    const r = grid.getBoundingClientRect();
    const w = (r.width - 16 * (cols - 1)) / cols;
    return Math.max(0, Math.min(cols - 1, Math.floor((x - r.left + 8) / (w + 16))));
  }
  let laneMap = $state({}); // panel -> start column, as currently laid out (drives the arrow buttons)
  let spanMap = $state({}); // panel -> width in columns, as currently laid out
  function onLayout(e) {
    cols = e.detail?.cols ?? cols;
    const m = currentLanes();
    if (JSON.stringify(m) !== JSON.stringify(laneMap)) laneMap = m;
    const sp = {};
    for (const el of grid?.querySelectorAll(':scope > [data-slot]') ?? []) sp[el.dataset.slot] = Number(el.dataset.span ?? 1);
    if (JSON.stringify(sp) !== JSON.stringify(spanMap)) spanMap = sp;
    follow();
  }

  // ---- width: 1× → 2× → 3× (up to the number of columns on screen) ----
  function cycleSpan(id) {
    lastMoved = id;
    const cur = spanMap[id] ?? 1;
    const next = cur >= cols ? 1 : cur + 1;
    const l = currentLanes();
    l[id] = Math.min(l[id] ?? 0, cols - next); // keep it on screen
    setHome([...saved], l, { ...savedSpans, [id]: next });
  }

  // ---- buttons: ↑ ↓ within the column, ← → to the neighbouring column ----
  function nudge(id, dir) {
    lastMoved = id;
    const l = currentLanes();
    const ord = [...saved];
    if (dir === 'left' || dir === 'right') {
      l[id] = Math.max(0, Math.min(cols - (spanMap[id] ?? 1), l[id] + (dir === 'left' ? -1 : 1)));
      setHome(ord, l);
      return;
    }
    const col = columnOf(l, ord, l[id]);
    const k = col.indexOf(id);
    const other = col[k + (dir === 'up' ? -1 : 1)];
    if (!other) return;
    // swap the two panels' positions in the overall order
    const a = ord.indexOf(id), b = ord.indexOf(other);
    [ord[a], ord[b]] = [ord[b], ord[a]];
    setHome(ord, l);
  }
  function canNudge(id, dir) {
    if (laneMap[id] === undefined) return false;
    const lane = laneMap[id];
    if (dir === 'left') return lane > 0;
    if (dir === 'right') return lane + (spanMap[id] ?? 1) < cols;
    const col = columnOf(laneMap, order, lane);
    const k = col.indexOf(id);
    return dir === 'up' ? k > 0 : k >= 0 && k < col.length - 1;
  }

  // ---- pointer drag (mouse and touch) ----
  // Auto-scroll while dragging near the top/bottom edge of the window.
  let scrollSpeed = 0, scrollRaf = 0, lastPt = null;
  function autoScroll() {
    if (!dragId || !scrollSpeed) { scrollRaf = 0; return; }
    window.scrollBy(0, scrollSpeed);
    if (lastPt) dragMove(lastPt);
    scrollRaf = requestAnimationFrame(autoScroll);
  }

  let dragEl = null;          // the slot element being dragged (follows the pointer)
  let grab = { x: 0, y: 0 };  // where inside the panel it was grabbed

  // Keep the lifted panel under the pointer, wherever the layout has settled it.
  function follow() {
    if (!dragEl || !lastPt) return;
    const g = grid.getBoundingClientRect();
    const tx = lastPt.clientX - grab.x - (g.left + dragEl.offsetLeft);
    const ty = lastPt.clientY - grab.y - (g.top + dragEl.offsetTop);
    dragEl.style.transform = `translate(${tx}px, ${ty}px) scale(1.02)`;
  }
  function followLoop() {
    if (!dragId) return;
    follow();
    requestAnimationFrame(followLoop);
  }

  function dragStart(e, id) {
    e.preventDefault();
    dragEl = e.currentTarget.closest('[data-slot]');
    const r = dragEl.getBoundingClientRect();
    grab = { x: e.clientX - r.left, y: e.clientY - r.top };
    lastPt = { clientX: e.clientX, clientY: e.clientY };
    dragId = id;
    lastMoved = id;
    dragOrder = [...saved];
    dragLanes = currentLanes(); // freeze every panel in its current column; only the dragged one moves
    currentLanesSaved = { ...dragLanes };
    document.body.classList.add('grabbing');
    window.addEventListener('pointermove', dragMove);
    window.addEventListener('pointerup', dragEnd, { once: true });
    window.addEventListener('pointercancel', dragEnd, { once: true });
    requestAnimationFrame(followLoop);
  }

  // Where the dragged panel should go: the column under the pointer, and within that column
  // before/after the panel under the pointer (by its upper/lower half), or at the end if below them all.
  // Uses settled layout boxes (offsetTop ignores running animations), so it can't oscillate.
  function dragMove(e) {
    if (!dragId) return;
    lastPt = { clientX: e.clientX, clientY: e.clientY };
    follow();
    const edge = 90;
    scrollSpeed = e.clientY < edge ? -Math.ceil((edge - e.clientY) / 6) : e.clientY > innerHeight - edge ? Math.ceil((e.clientY - innerHeight + edge) / 6) : 0;
    if (scrollSpeed && !scrollRaf) scrollRaf = requestAnimationFrame(autoScroll);
    if (cols < 1) return;

    // Start column = the column nearest the lifted card's left edge (for 1-wide panels: under the card).
    const span = Math.min(cols, spanMap[dragId] ?? 1);
    const r = grid.getBoundingClientRect();
    const cardLeft = e.clientX - grab.x - r.left;
    const lane = Math.max(0, Math.min(cols - span, Math.round(cardLeft / (colWidth() + 16))));
    const py = e.clientY - r.top;
    // Panels in any of the columns this one would cover, top to bottom.
    const covered = new Set();
    for (let c = lane; c < lane + span; c++) for (const id of columnOf(dragLanes, dragOrder, c)) if (id !== dragId) covered.add(id);
    const others = [...covered]
      .map((id) => ({ id, el: grid.querySelector(`[data-slot="${id}"]`) }))
      .sort((a, b) => a.el.offsetTop - b.el.offsetTop);
    let before = null; // insert before this panel; null = after all of them
    for (const { id, el } of others) {
      if (py < el.offsetTop + el.offsetHeight / 2) { before = id; break; }
    }
    const o = dragOrder.filter((x) => x !== dragId);
    let ins;
    if (before) ins = o.indexOf(before);
    else if (others.length) ins = Math.max(...others.map((x) => o.indexOf(x.id))) + 1;
    else ins = o.length;
    o.splice(ins, 0, dragId);
    const laneChanged = dragLanes[dragId] !== lane;
    if (!laneChanged && o.join() === dragOrder.join()) return;
    dragOrder = o;
    if (laneChanged) dragLanes = { ...dragLanes, [dragId]: lane };
  }

  function dragEnd() {
    scrollSpeed = 0;
    window.removeEventListener('pointermove', dragMove);
    window.removeEventListener('pointerup', dragEnd);
    window.removeEventListener('pointercancel', dragEnd);
    document.body.classList.remove('grabbing');
    if (!dragId) return;
    // Glide the lifted panel down into its slot.
    if (dragEl) {
      const from = dragEl.style.transform;
      dragEl.style.transform = '';
      if (from && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        dragEl.style.zIndex = '50';
        const el = dragEl;
        const a = el.animate([{ transform: from }, { transform: 'none' }], { duration: 220, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
        a.onfinish = a.oncancel = () => { el.style.zIndex = ''; };
      }
      dragEl = null;
    }
    const finalOrder = dragOrder, finalLanes = dragLanes;
    dragId = null;
    dragOrder = null;
    dragLanes = null;
    if (JSON.stringify(finalOrder) !== JSON.stringify(saved) || JSON.stringify(finalLanes) !== JSON.stringify(currentLanesSaved)) {
      setHome(finalOrder, finalLanes);
    }
  }
  let currentLanesSaved = null; // snapshot at drag start, to detect "no change"
</script>

<div class="bar">
  {#if ui.editing}
    <span class="muted small grow">Drag <Icon name="grip" size={14} /> anywhere — or use the arrows · ✕ to unpin</span>
    <button class="btn small" onclick={() => (adding = true)}><Icon name="plus" size={16} />Add panels</button>
    <button class="btn small" disabled={isDefault} onclick={resetHome}><Icon name="reset" size={16} />Reset</button>
    <button class="btn small primary" onclick={() => { ui.editing = false; adding = false; }}><Icon name="check" size={16} />Done</button>
  {:else}
    <span class="grow"></span>
    <button class="btn small ghost" onclick={() => (ui.editing = true)}><Icon name="edit" size={15} />Customize</button>
  {/if}
</div>

{#if !order.length}
  <div class="card empty">
    Nothing pinned to Home yet.
    <div style="margin-top:12px"><button class="btn primary" onclick={() => { ui.editing = true; adding = true; }}><Icon name="plus" size={18} />Add panels</button></div>
  </div>
{/if}

<div class="panels" class:editing={ui.editing} use:lanes={{ animate: ui.editing, hints, spans: savedSpans }} bind:this={grid} onlaneslayout={onLayout}>
  {#each order as id, i (id)}
    {@const p = PANELS[id]}
    <div class="slot" class:wide={p.wide} class:dragging={dragId === id} class:active={lastMoved === id} data-slot={id}>
      {#if ui.editing}
        <div class="edit">
          <button class="grip" aria-label="Drag to reorder {p.title}" title="Drag to reorder · {p.title} ({SECTION_LABELS[p.section]})"
            onpointerdown={(e) => dragStart(e, id)}>
            <Icon name="grip" size={18} stroke={3} />
          </button>
            {#if cols > 1 && !p.wide}
              <button class="btn icon sm ghost" aria-label="Move {p.title} to the left column" disabled={!canNudge(id, 'left')} onclick={() => nudge(id, 'left')}><Icon name="left" size={16} /></button>
            {/if}
            <button class="btn icon sm ghost" aria-label="Move {p.title} up" disabled={!canNudge(id, 'up')} onclick={() => nudge(id, 'up')}><Icon name="up" size={16} /></button>
            <button class="btn icon sm ghost" aria-label="Move {p.title} down" disabled={!canNudge(id, 'down')} onclick={() => nudge(id, 'down')}><Icon name="down" size={16} /></button>
            {#if cols > 1 && !p.wide}
              <button class="btn icon sm ghost" aria-label="Move {p.title} to the right column" disabled={!canNudge(id, 'right')} onclick={() => nudge(id, 'right')}><Icon name="right" size={16} /></button>
            {/if}
          {#if cols > 1}
            <button class="btn sm ghost width" aria-label="Width of {p.title}: {spanMap[id] ?? 1} column(s). Click to change"
              title="Width: {spanMap[id] ?? 1}× (click to change)" onclick={() => cycleSpan(id)}>
              <Icon name="width" size={15} />{spanMap[id] ?? 1}×
            </button>
          {/if}
          <button class="btn icon sm ghost danger" aria-label="Unpin {p.title}" onclick={() => remove(id)}><Icon name="x" size={16} /></button>
        </div>
      {/if}
      <div class="content" inert={ui.editing}>
        <p.comp />
      </div>
    </div>
  {/each}
</div>

{#if adding}
  <div class="modal" role="dialog" aria-modal="true" aria-label="Add panels to Home">
    <div class="card sheet">
      <div class="row between"><h3>Add to Home</h3>
        <button class="btn icon ghost" aria-label="Close" onclick={() => (adding = false)}><Icon name="x" /></button></div>
      {#if !available.length}
        <p class="muted">Every panel is already on Home.</p>
      {/if}
      {#each available as g (g.label)}
        <div class="group">
          <h2>{g.label}</h2>
          {#each g.panels as p (p.id)}
            <button class="addrow" onclick={() => add(p.id)}>
              <span>{p.title}</span><Icon name="plus" size={18} />
            </button>
          {/each}
        </div>
      {/each}
      <p class="faint small">Tip: you can also tap the <Icon name="pin" size={13} /> pin on any panel in the other pages.</p>
    </div>
  </div>
{/if}

<style>
  .bar { display: flex; align-items: center; gap: 8px; margin: -4px 0 12px; flex-wrap: wrap; }
  .bar .muted { display: inline-flex; align-items: center; gap: 4px; }
  .panels { position: relative; } /* offsetParent for slotAt() */
  .panels.editing { margin-top: 26px; }
  .slot { min-width: 0; position: relative; }
  .slot.wide { grid-column: 1 / -1; }
  .editing .slot { outline: 2px dashed color-mix(in srgb, var(--accent) 45%, transparent); outline-offset: 4px; border-radius: var(--radius); background: var(--bg); }
  .slot.dragging { z-index: 50; box-shadow: 0 28px 60px -18px rgb(0 0 0 / 0.75); outline-style: solid !important; }
  :global(body.grabbing), :global(body.grabbing *) { cursor: grabbing !important; user-select: none; }
  .editing .content { pointer-events: none; user-select: none; }
  /* Floating toolbar over the panel's header: adds no height, so the layout while editing is exactly
     the layout you get after "Done" (a masonry layout depends on panel heights). */
  .edit {
    /* docked on the panel's top edge (over the dashed outline), clear of the panel's own title */
    position: absolute; top: -17px; right: 12px; z-index: 3; display: flex; align-items: center; gap: 1px; padding: 2px;
    background: color-mix(in srgb, var(--card-2) 92%, transparent); backdrop-filter: blur(8px);
    border: 1px solid var(--line); border-radius: 12px; box-shadow: var(--shadow);
  }
  .grip {
    width: 30px; height: 30px; border-radius: 8px; border: 0; background: none; color: var(--muted);
    cursor: grab; display: grid; place-items: center; touch-action: none; flex: none;
  }
  .grip:active { cursor: grabbing; color: var(--accent); }
  .sm { width: 30px; min-height: 30px; height: 30px; border-radius: 8px; }
  .width { width: auto; padding: 0 7px; gap: 4px; font-size: 12.5px; font-weight: 650; font-variant-numeric: tabular-nums; }
  .sheet { width: min(460px, 100%); max-height: 80dvh; overflow: auto; }
  .group { display: grid; gap: 4px; }
  .group h2 { margin: 8px 0 4px; }
  .addrow {
    display: flex; justify-content: space-between; align-items: center; padding: 11px 12px; border-radius: 10px;
    border: 1px solid var(--line); background: var(--card-2); cursor: pointer; text-align: left;
  }
  .addrow:hover { border-color: var(--accent); color: var(--accent); }
</style>
