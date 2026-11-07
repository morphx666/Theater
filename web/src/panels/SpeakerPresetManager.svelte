<script>
  // Add, rename and delete speaker presets, and pick the receiver slot each one takes its Audyssey calibration from.
  import { avr } from '../lib/avr.svelte.js';
  import { applyPreset, presetAction } from '../lib/speakerPresets.svelte.js';
  import Panel from '../lib/Panel.svelte';
  import Seg from '../lib/Seg.svelte';
  import Icon from '../lib/Icon.svelte';

  const sp = $derived(avr.speakerPresets);
  const list = $derived(sp?.list ?? []);
  const on = $derived(avr.state?.zoneMain === true);
  const busy = $derived(!!sp?.busy);
  const SLOTS = [{ value: '1', label: 'Slot 1' }, { value: '2', label: 'Slot 2' }];
  const nameOk = (s) => s.trim().length >= 1 && s.trim().length <= 24;

  // ---- edit one ----
  let editing = $state(null);
  let nameDraft = $state('');
  let confirmDelete = $state(false);
  const editP = $derived(list.find((p) => p.id === editing));
  function toggle(p) {
    editing = editing === p.id ? null : p.id;
    nameDraft = p.name;
    confirmDelete = false;
  }
  async function rename() {
    if (await presetAction({ action: 'rename', id: editing, name: nameDraft.trim() })) editing = null;
  }
  async function del() {
    if (!confirmDelete) { confirmDelete = true; return; }
    const id = editing;
    editing = null;
    confirmDelete = false;
    await presetAction({ action: 'delete', id });
  }

  // ---- new ----
  let creating = $state(false);
  let newName = $state('');
  let newFrom = $state('');
  let newSlot = $state('1');
  let saving = $state(false);
  const fromP = $derived(list.find((p) => p.id === newFrom));
  function startCreate() {
    creating = true;
    editing = null;
    newName = '';
    newFrom = sp?.active ?? '';
    newSlot = String(list.find((p) => p.id === newFrom)?.slot ?? 1);
  }
  async function create() {
    saving = true;
    const r = await presetAction({ action: 'create', name: newName.trim(), from: newFrom || undefined, slot: Number(newSlot) });
    saving = false;
    if (r) creating = false;
  }
</script>

<Panel id="speaker-preset-manager" title="Speaker preset manager">
  <p class="muted small intro">Tap a preset to rename or delete it. Each one uses the Audyssey calibration from receiver slot 1 or 2.</p>

  {#if sp?.supported === false}
    <p class="muted small">This receiver doesn't have speaker presets.</p>
  {:else}
    <div class="items">
      {#each list as p (p.id)}
        {@const active = p.id === sp.active}
        <div class="item" class:sel={editing === p.id}>
          <button class="head" onclick={() => toggle(p)} aria-expanded={editing === p.id}>
            <span class="nm">{p.name}</span>
            <span class="meta">Slot {p.slot}{p.layout ? ` · ${p.layout}` : ''}{p.captured ? '' : ' · not read yet'}</span>
            {#if sp.busy?.id === p.id}<span class="badge">{sp.busy.step}…</span>
            {:else if sp.incomplete === p.id}<span class="badge bad">Incomplete</span>
            {:else if active}<span class="badge">Active</span>{/if}
            <span class="ed" aria-hidden="true"><Icon name={editing === p.id ? 'x' : 'edit'} size={15} /></span>
          </button>
          {#if editing === p.id && editP}
            <div class="edit">
              <div class="row">
                <input type="text" maxlength="24" bind:value={nameDraft} aria-label="Preset name"
                  onkeydown={(e) => { if (e.key === 'Enter' && nameOk(nameDraft)) rename(); if (e.key === 'Escape') editing = null; }} />
                <button class="btn small" disabled={!nameOk(nameDraft) || nameDraft.trim() === p.name} onclick={rename}>Rename</button>
              </div>
              <div class="setting stack">
                <div><div class="label">Audyssey calibration</div><div class="hint">{active
                  ? 'Switch to another preset to change'
                  : !p.captured ? 'Switch to it once first' : 'Receiver slot this preset uses'}</div></div>
                <Seg value={String(p.slot)} options={SLOTS} disabled={active || !p.captured || busy}
                  onchange={(v) => presetAction({ action: 'slot', id: p.id, slot: Number(v) })} />
              </div>
              <div class="row acts">
                {#if !active || sp.incomplete === p.id}
                  <button class="btn small primary" disabled={busy || !on} onclick={() => applyPreset(p.id)}>{active ? 'Retry' : 'Switch to it'}</button>
                {/if}
                <button class="btn small danger" disabled={active || busy || list.length < 2} onclick={del}>
                  <Icon name="x" size={14} />{confirmDelete ? 'Tap again to delete' : 'Delete'}</button>
                <button class="btn small ghost" onclick={() => (editing = null)}>Close</button>
              </div>
            </div>
          {/if}
        </div>
      {/each}
    </div>

    {#if creating}
      <div class="new">
        <input type="text" maxlength="24" placeholder="Name" bind:value={newName} aria-label="New preset name"
          onkeydown={(e) => { if (e.key === 'Enter' && nameOk(newName)) create(); if (e.key === 'Escape') creating = false; }} />
        <label class="r"><span>Copy settings from</span>
          <select bind:value={newFrom} onchange={() => (newSlot = String(fromP?.slot ?? newSlot))}>
            {#if !sp.active}<option value="">Current receiver settings</option>{/if}
            {#each list.filter((p) => p.captured || p.id === sp.active) as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
          </select></label>
        <div class="r"><span>Audyssey calibration</span>
          <Seg value={newSlot} options={SLOTS} disabled={!newFrom} onchange={(v) => (newSlot = v)} /></div>
        <div class="row acts">
          <button class="btn small primary" disabled={!nameOk(newName) || saving || busy} onclick={create}><Icon name="plus" size={14} />Create</button>
          <button class="btn small ghost" onclick={() => (creating = false)}>Cancel</button>
        </div>
      </div>
    {:else}
      <button class="btn small add" disabled={busy || !list.length || !on} onclick={startCreate}><Icon name="plus" size={14} />New preset</button>
    {/if}
  {/if}
</Panel>

<style>
  .intro { margin: -6px 0 10px; }
  .items { display: grid; gap: 6px; }
  .item { border: 1px solid var(--line); border-radius: 12px; background: var(--card-2); }
  .item.sel { border-color: color-mix(in srgb, var(--accent) 50%, var(--line)); }
  .head {
    display: grid; grid-template-columns: 1fr auto auto; align-items: center; gap: 2px 10px; width: 100%; padding: 10px 12px;
    background: none; border: 0; color: inherit; font: inherit; text-align: left; cursor: pointer;
  }
  .nm { font-weight: 600; overflow-wrap: anywhere; }
  .meta { grid-row: 2; font-size: 12.5px; color: var(--muted); }
  .badge { grid-row: 1 / span 2; grid-column: 2; font-size: 11px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: var(--accent); }
  .badge.bad { color: var(--bad); }
  .ed { grid-row: 1 / span 2; grid-column: 3; display: grid; place-items: center; color: var(--faint); }
  .head:hover .ed, .item.sel .ed { color: var(--text); }
  .edit, .new { display: grid; gap: 10px; padding: 0 12px 12px; }
  .new { padding: 12px; margin-top: 10px; border: 1px solid var(--line); border-radius: 12px; }
  .edit .row input, .new > input { flex: 1; min-width: 0; }
  .acts { justify-content: flex-end; flex-wrap: wrap; gap: 8px; }
  .r { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
  .r select { width: 180px; }
  .add { margin-top: 10px; }
  .setting { padding: 4px 0 0; }
</style>
