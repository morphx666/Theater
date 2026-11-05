<script>
  // Home: the panels the user pinned, in a customizable board (order, columns, widths) + "Add panels".
  import { setContext } from 'svelte';
  import { PANELS, PANEL_LIST, SECTION_LABELS } from '../panels/index.js';
  import { homeIds, setPinned, ui, DEFAULT_HOME } from '../lib/layout.svelte.js';
  import Icon from '../lib/Icon.svelte';
  import PanelBoard from '../lib/PanelBoard.svelte';

  setContext('home', true); // panels hide their own pin buttons here

  const pinned = $derived(homeIds().filter((id) => PANELS[id]));
  let adding = $state(false);

  const available = $derived(
    Object.entries(SECTION_LABELS)
      .map(([sec, label]) => ({ label, panels: PANEL_LIST.filter((p) => p.section === sec && !pinned.includes(p.id)) }))
      .filter((g) => g.panels.length),
  );
  const add = (id) => setPinned([...pinned, id]);
  const remove = (id) => setPinned(pinned.filter((x) => x !== id));
</script>

<PanelBoard page="home" ids={pinned} pinned defaultOrder={DEFAULT_HOME} onremove={remove}>
  {#snippet extra()}
    <button class="btn small" onclick={() => (adding = true)}><Icon name="plus" size={16} />Add panels</button>
  {/snippet}
  {#snippet empty()}
    <div class="card empty">
      Nothing pinned to Home yet.
      <div style="margin-top:12px"><button class="btn primary" onclick={() => { ui.editing = true; adding = true; }}><Icon name="plus" size={18} />Add panels</button></div>
    </div>
  {/snippet}
</PanelBoard>

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
  .sheet { width: min(460px, 100%); max-height: 80dvh; overflow: auto; }
  .group { display: grid; gap: 4px; }
  .group h2 { margin: 8px 0 4px; }
  .addrow {
    display: flex; justify-content: space-between; align-items: center; padding: 11px 12px; border-radius: 10px;
    border: 1px solid var(--line); background: var(--card-2); cursor: pointer; text-align: left;
  }
  .addrow:hover { border-color: var(--accent); color: var(--accent); }
</style>
