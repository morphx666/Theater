<script>
  // Home: the panels the user pinned, in a customizable board (order, columns, widths) + "Add panels".
  import { setContext } from 'svelte';
  import { PANELS, PANEL_LIST, SECTION_LABELS } from '../panels/index.js';
  import { homeIds, setPinned, ui, DEFAULT_HOME } from '../lib/layout.svelte.js';
  import Icon from '../lib/Icon.svelte';
  import PanelBoard from '../lib/PanelBoard.svelte';

  setContext('home', true); // panels hide their own pin buttons here
  // Panels show a link next to their title to the page they live on (with the Setup tab, if any).
  setContext('panelLink', (id) => {
    const p = PANELS[id];
    if (!p || p.section === 'home') return null;
    return { href: `#${p.section}${p.section === 'setup' && p.tab ? '/' + p.tab : ''}`, label: SECTION_LABELS[p.section] };
  });

  const pinned = $derived(homeIds().filter((id) => PANELS[id]));
  let adding = $state(false);

  let filter = $state('');
  const norm = (t) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  // Every panel, grouped by page. Panels already on Home stay listed (as "ghost" rows) so the list never shifts.
  const groups = $derived.by(() => {
    const q = norm(filter.trim());
    return Object.entries(SECTION_LABELS)
      .map(([sec, label]) => ({
        label,
        panels: PANEL_LIST.filter((p) => p.section === sec && (!q || norm(`${p.title} ${label}`).includes(q))),
      }))
      .filter((g) => g.panels.length);
  });
  const firstAddable = $derived(groups.flatMap((g) => g.panels).find((p) => !pinned.includes(p.id)));
  const allPinned = $derived(PANEL_LIST.every((p) => pinned.includes(p.id)));
  function focusOnMount(el) { requestAnimationFrame(() => el.focus()); }
  function openAdd() { filter = ''; adding = true; }
  const add = (id) => setPinned([...pinned, id]);
  const remove = (id) => setPinned(pinned.filter((x) => x !== id));
</script>

<PanelBoard page="home" ids={pinned} pinned defaultOrder={DEFAULT_HOME} onremove={remove}>
  {#snippet extra()}
    <button class="btn small" onclick={openAdd}><Icon name="plus" size={16} />Add panels</button>
  {/snippet}
  {#snippet empty()}
    <div class="card empty">
      Nothing pinned to Home yet.
      <div style="margin-top:12px"><button class="btn primary" onclick={() => { ui.editing = true; openAdd(); }}><Icon name="plus" size={18} />Add panels</button></div>
    </div>
  {/snippet}
</PanelBoard>

{#if adding}
  <div class="modal" role="dialog" aria-modal="true" aria-label="Add panels to Home">
    <div class="card sheet">
      <div class="row between"><h3>Add to Home</h3>
        <button class="btn icon ghost" aria-label="Close" onclick={() => (adding = false)}><Icon name="x" /></button></div>
      <input type="text" class="filter" placeholder="Filter panels…" bind:value={filter} use:focusOnMount aria-label="Filter panels"
        onkeydown={(e) => {
          if (e.key === 'Enter' && firstAddable) add(firstAddable.id);
          if (e.key === 'Escape') { if (filter) filter = ''; else adding = false; }
        }} />
      {#if allPinned}
        <p class="muted small">Every panel is already on Home.</p>
      {/if}
      <div class="list">
        {#each groups as g (g.label)}
          <div class="group">
            <h2>{g.label}</h2>
            {#each g.panels as p (p.id)}
              {#if pinned.includes(p.id)}
                <div class="addrow ghost" aria-disabled="true"><span>{p.title}</span><span class="on"><Icon name="check" size={16} />On Home</span></div>
              {:else}
                <button class="addrow" onclick={() => add(p.id)}><span>{p.title}</span><Icon name="plus" size={18} /></button>
              {/if}
            {/each}
          </div>
        {:else}
          <p class="muted">No panels match “{filter}”.</p>
        {/each}
      </div>
      <p class="faint small">Tip: you can also tap the <Icon name="pin" size={13} /> pin on any panel in the other pages.</p>
    </div>
  </div>
{/if}

<style>
  .sheet { width: min(460px, 100%); height: min(80dvh, 720px); display: flex; flex-direction: column; gap: 10px; }
  .filter { flex: none; }
  .list { flex: 1; overflow: auto; display: grid; gap: 6px; align-content: start; padding-right: 2px; }
  .group { display: grid; gap: 4px; }
  .group h2 { margin: 8px 0 4px; }
  .addrow {
    display: flex; justify-content: space-between; align-items: center; padding: 11px 12px; border-radius: 10px;
    border: 1px solid var(--line); background: var(--card-2); cursor: pointer; text-align: left;
  }
  .addrow:hover { border-color: var(--accent); color: var(--accent); }
  .addrow.ghost { background: transparent; border-style: dashed; color: var(--faint); cursor: default; }
  .addrow.ghost:hover { border-color: var(--line); color: var(--faint); }
  .ghost .on { display: inline-flex; align-items: center; gap: 4px; font-size: 12.5px; color: var(--good); }
</style>
