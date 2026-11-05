<script>
  // Customizable Home: shows the user's pinned panels in their chosen order.
  // "Customize" mode: drag the grip (mouse or touch) or use ↑/↓ to reorder, ✕ to unpin, "Add panels" to pin more.
  import { setContext } from 'svelte';
  import { PANELS, PANEL_LIST, SECTION_LABELS } from '../panels/index.js';
  import { homeIds, setHome, resetHome, move, ui, DEFAULT_HOME } from '../lib/layout.svelte.js';
  import Icon from '../lib/Icon.svelte';
  import { lanes } from '../lib/lanes.js';

  setContext('home', true);

  const saved = $derived(homeIds().filter((id) => PANELS[id]));
  let dragOrder = $state(null); // live order while dragging
  let dragId = $state(null);
  const order = $derived(dragOrder ?? saved);
  let adding = $state(false);
  let lastMoved = $state(null); // drawn on top while panels animate

  function step(id, delta) { lastMoved = id; move(id, delta); }

  const available = $derived(
    Object.entries(SECTION_LABELS)
      .map(([sec, label]) => ({ label, panels: PANEL_LIST.filter((p) => p.section === sec && !saved.includes(p.id)) }))
      .filter((g) => g.panels.length),
  );
  const isDefault = $derived(JSON.stringify(saved) === JSON.stringify(DEFAULT_HOME));

  function remove(id) { setHome(saved.filter((x) => x !== id)); }
  function add(id) { setHome([...saved, id]); }

  // ---- pointer drag (works for mouse and touch) ----
  // Which slot is under the pointer, using each slot's settled layout box (offsetLeft/Top ignore the
  // transforms of running animations) — not where it happens to be mid-slide.
  let grid = $state();
  // Which slot is under the pointer, using each slot's settled layout box (offsetLeft/Top ignore the
  // transforms of running animations) — not where it happens to be mid-slide.
  function slotAt(x, y) {
    const r = grid.getBoundingClientRect();
    const px = x - r.left, py = y - r.top;
    for (const el of grid.querySelectorAll(':scope > [data-slot]')) {
      if (px >= el.offsetLeft && px <= el.offsetLeft + el.offsetWidth && py >= el.offsetTop && py <= el.offsetTop + el.offsetHeight) {
        return el.dataset.slot;
      }
    }
    return null;
  }

  // Auto-scroll while dragging near the top/bottom edge of the window.
  let scrollSpeed = 0, scrollRaf = 0, lastPt = null;
  function autoScroll() {
    if (!dragId || !scrollSpeed) { scrollRaf = 0; return; }
    window.scrollBy(0, scrollSpeed);
    if (lastPt) dragMove(lastPt);
    scrollRaf = requestAnimationFrame(autoScroll);
  }

  // ---- drag state ----
  let dragEl = null;          // the slot element being dragged (follows the pointer)
  let grab = { x: 0, y: 0 };  // where inside the panel it was grabbed
  let anchor = null;          // pointer position at drag start / last reorder
  let lockUntil = 0;          // brief pause after each reorder
  let prevOrder = null;       // order before the last reorder (to block immediate reversals)

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
    anchor = { x: e.clientX, y: e.clientY };
    lockUntil = 0;
    prevOrder = null;
    dragId = id;
    lastMoved = id;
    dragOrder = [...saved];
    document.body.classList.add('grabbing');
    window.addEventListener('pointermove', dragMove);
    window.addEventListener('pointerup', dragEnd, { once: true });
    window.addEventListener('pointercancel', dragEnd, { once: true });
    requestAnimationFrame(followLoop);
  }

  function dragMove(e) {
    if (!dragId) return;
    lastPt = { clientX: e.clientX, clientY: e.clientY };
    follow();
    const edge = 90;
    scrollSpeed = e.clientY < edge ? -Math.ceil((edge - e.clientY) / 6) : e.clientY > innerHeight - edge ? Math.ceil((e.clientY - innerHeight + edge) / 6) : 0;
    if (scrollSpeed && !scrollRaf) scrollRaf = requestAnimationFrame(autoScroll);

    const now = performance.now();
    if (now < lockUntil) return;
    const dx = e.clientX - anchor.x, dy = e.clientY - anchor.y;
    if (Math.hypot(dx, dy) < 24) return; // need some real movement since the last reorder
    const target = slotAt(e.clientX, e.clientY);
    if (!target || target === dragId) return;
    const from = dragOrder.indexOf(dragId), to = dragOrder.indexOf(target);
    // Mostly-vertical movement: only move the panel in the direction the pointer travels
    // (up = earlier, down = later). In a masonry layout, the panel that lands under the pointer after
    // a reorder is often the one just passed, which would otherwise bounce it straight back.
    if (Math.abs(dy) > Math.abs(dx) && (dy < 0) !== (to < from)) return;
    const o = dragOrder.filter((x) => x !== dragId);
    const ti = o.indexOf(target);
    o.splice(from < to ? ti + 1 : ti, 0, dragId);
    // Never immediately undo the previous reorder unless the pointer has clearly moved on.
    if (prevOrder && o.join() === prevOrder.join() && Math.hypot(dx, dy) < 120) return;
    prevOrder = dragOrder;
    dragOrder = o;
    anchor = { x: e.clientX, y: e.clientY };
    lockUntil = now + 180;
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
    const final = dragOrder;
    dragId = null;
    dragOrder = null;
    if (JSON.stringify(final) !== JSON.stringify(saved)) setHome(final);
  }
</script>

<div class="bar">
  {#if ui.editing}
    <span class="muted small grow">Drag <Icon name="grip" size={14} /> to reorder · ✕ to unpin</span>
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

<div class="panels" class:editing={ui.editing} use:lanes={{ animate: ui.editing }} bind:this={grid} onlaneslayout={follow}>
  {#each order as id, i (id)}
    {@const p = PANELS[id]}
    <div class="slot" class:wide={p.wide} class:dragging={dragId === id} class:active={lastMoved === id} data-slot={id}>
      {#if ui.editing}
        <div class="edit">
          <button class="grip" aria-label="Drag to reorder {p.title}" title="Drag to reorder"
            onpointerdown={(e) => dragStart(e, id)}>
            <Icon name="grip" size={18} stroke={3} />
          </button>
          <span class="name">{p.title}<span class="faint"> · {SECTION_LABELS[p.section]}</span></span>
          <button class="btn icon sm ghost" aria-label="Move {p.title} up" disabled={i === 0} onclick={() => step(id, -1)}><Icon name="up" size={16} /></button>
          <button class="btn icon sm ghost" aria-label="Move {p.title} down" disabled={i === order.length - 1} onclick={() => step(id, 1)}><Icon name="down" size={16} /></button>
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
  .slot { min-width: 0; position: relative; }
  .slot.wide { grid-column: 1 / -1; }
  .editing .slot { outline: 2px dashed color-mix(in srgb, var(--accent) 45%, transparent); outline-offset: 4px; border-radius: var(--radius); background: var(--bg); }
  .slot.dragging { z-index: 50; box-shadow: 0 28px 60px -18px rgb(0 0 0 / 0.75); outline-style: solid !important; }
  :global(body.grabbing), :global(body.grabbing *) { cursor: grabbing !important; user-select: none; }
  .editing .content { pointer-events: none; user-select: none; }
  .edit { display: flex; align-items: center; gap: 4px; margin-bottom: 8px; }
  .grip {
    width: 36px; height: 36px; border-radius: 10px; border: 1px solid var(--line); background: var(--card-2); color: var(--muted);
    cursor: grab; display: grid; place-items: center; touch-action: none; flex: none;
  }
  .grip:active { cursor: grabbing; color: var(--accent); }
  .name { flex: 1; min-width: 0; font-weight: 650; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-left: 6px; }
  .sm { width: 34px; min-height: 34px; height: 34px; }
  .sheet { width: min(460px, 100%); max-height: 80dvh; overflow: auto; }
  .group { display: grid; gap: 4px; }
  .group h2 { margin: 8px 0 4px; }
  .addrow {
    display: flex; justify-content: space-between; align-items: center; padding: 11px 12px; border-radius: 10px;
    border: 1px solid var(--line); background: var(--card-2); cursor: pointer; text-align: left;
  }
  .addrow:hover { border-color: var(--accent); color: var(--accent); }
</style>
