<script>
  import { avr, send, api, toast } from '../lib/avr.svelte.js';
  import Icon from '../lib/Icon.svelte';
  import Panel from '../lib/Panel.svelte';
  import Seg from '../lib/Seg.svelte';
  import { remember } from '../lib/remember.js';

  const st = $derived(avr.state);
  const on = $derived(st.zoneMain === true);
  // The receiver ignores tuner commands unless Tuner is the active input, so everything but Listen waits for it.
  const active = $derived(on && st.source === 'TUNER');

  // Receiver frequencies are 6 digits: below 050000 it's FM in 10 kHz steps (009510 = 95.10 MHz), otherwise AM.
  function fmtFreq(raw) {
    const n = Number(raw);
    if (!raw || !Number.isFinite(n)) return '—';
    return n < 50000 ? `${(n / 100).toFixed(2)} MHz` : `${Math.round(n / 100)} kHz`;
  }
  const freq = $derived(fmtFreq(st.tuner?.freq));
  const skipped = $derived(new Set(st.tuner?.skipped ?? []));
  // "Deleted" presets are skipped on the receiver (it has no real delete); the app shows them as empty slots.
  const presets = $derived(Object.entries(st.tuner?.presets ?? {}).sort(([a], [b]) => a.localeCompare(b))
    .map(([n, p]) => ({ n, ...p, empty: skipped.has(n) })));
  const used = $derived(presets.filter((p) => !p.empty));
  // Preset(s) already holding the current station
  const here = $derived(used.filter((p) => p.freq === st.tuner?.freq).map((p) => p.n));

  let open = $state(false); // presets list expanded
  let mode = $state('listen'); // listen | save | manage
  let confirm = $state(null); // slot waiting for the second tap (save mode)
  let editing = $state(null); // preset being edited (manage mode)
  let nameDraft = $state('');
  let confirmDelete = $state(false);
  let confirmAll = $state(false);
  let busy = $state(false);

  $effect(() => { if (!active && mode !== 'listen') setMode('listen'); });
  function setMode(m) { mode = m; confirm = null; editing = null; confirmDelete = false; confirmAll = false; if (m !== 'listen') open = true; }

  function tapSlot(p) {
    if (mode === 'listen') { if (!p.empty) send('TPAN' + p.n); return; }
    if (mode === 'manage') {
      if (p.empty) return;
      editing = editing === p.n ? null : p.n;
      nameDraft = p.name; confirmDelete = false;
      return;
    }
    // save mode
    if (!p.empty && p.freq === st.tuner.freq) { toast(`Preset ${Number(p.n)} already has ${freq}`); setMode('listen'); return; }
    if (!p.empty && confirm !== p.n) { confirm = p.n; return; } // occupied: tap twice to replace
    send('TPANMEM' + p.n);
    toast(`Saved ${freq} to preset ${Number(p.n)}`);
    setMode('listen');
  }

  async function act(body, done) {
    busy = true;
    try { await api('/api/tuner/presets', { method: 'POST', body }); if (done) toast(done); }
    catch (e) { toast(e.message, 'error'); }
    finally { busy = false; }
  }
  const editP = $derived(presets.find((p) => p.n === editing));
  const nameOk = $derived(/^[\x20-\x7E]{0,8}$/.test(nameDraft) && !/[<>&]/.test(nameDraft));
  async function saveName() {
    if (!nameOk) return;
    await act({ action: 'rename', n: Number(editing), name: nameDraft }, nameDraft.trim() ? `Preset ${Number(editing)} renamed` : `Preset ${Number(editing)} name cleared`);
    editing = null;
  }
  async function del() {
    if (!confirmDelete) { confirmDelete = true; return; }
    const n = editing;
    editing = null; confirmDelete = false;
    await act({ action: 'delete', n: Number(n) }, `Preset ${Number(n)} deleted`);
  }
  async function delAll() {
    if (!confirmAll) { confirmAll = true; return; }
    confirmAll = false; editing = null;
    await act({ action: 'deleteAll' }, 'All presets deleted');
  }
</script>

<Panel id="tuner" title="Tuner">
  {#if on && !active}
    <p class="hint notice">The tuner only responds while it's the active input. Tap <b>Listen</b> to switch to it.</p>
  {/if}
  <div class="tuner" class:dim={!active}>
    <div class="freq mono">{freq}</div>
    <div class="faint small">{st.tuner?.band ?? ''}{here.length ? ` · preset ${here.map(Number).join(', ')}` : ''}</div>
  </div>
  <div class="row keys">
    <button class="btn grow" disabled={!active} onclick={() => send('TFANDOWN')}><Icon name="left" />Tune</button>
    <button class="btn grow" disabled={!active} onclick={() => send('TFANUP')}>Tune<Icon name="right" /></button>
  </div>
  <div class="row keys">
    <button class="btn grow" disabled={!active} onclick={() => send('TPANDOWN')}><Icon name="left" />Preset</button>
    <button class="btn grow" disabled={!active} onclick={() => send('TPANUP')}>Preset<Icon name="right" /></button>
  </div>
  <div class="row keys">
    <Seg value={st.tuner?.band} onchange={(v) => send('TMAN' + v)} disabled={!active}
      options={[{ value: 'FM', label: 'FM' }, { value: 'AM', label: 'AM' }]} />
    <button class="btn grow" class:primary={on && !active} disabled={!on || active} onclick={() => send('SITUNER')}><Icon name="radio" size={18} />{active ? 'Listening' : 'Listen'}</button>
  </div>
  <div class="row keys">
    {#if mode === 'save'}
      <button class="btn grow" onclick={() => setMode('listen')}><Icon name="x" size={18} />Cancel</button>
    {:else}
      <button class="btn grow" disabled={!active || !presets.length} onclick={() => setMode('save')}><Icon name="save" size={18} />Save {freq} as preset…</button>
    {/if}
  </div>

  {#if presets.length}
    <details bind:open use:remember={'tuner.presets'}>
      <summary>
        <span>Presets <span class="faint small">{used.length} of {presets.length}</span></span>
        {#if mode !== 'save'}
          <button class="btn small ghost manage" class:on={mode === 'manage'} disabled={!active}
            onclick={(e) => { e.preventDefault(); setMode(mode === 'manage' ? 'listen' : 'manage'); }}>
            <Icon name={mode === 'manage' ? 'check' : 'edit'} size={14} />{mode === 'manage' ? 'Done' : 'Manage'}
          </button>
        {/if}
      </summary>

      {#if mode === 'save'}
        <p class="hint note">Choose a slot for <b>{freq}</b>. Empty slots save right away; tap a used one twice to replace it.</p>
      {:else if mode === 'manage'}
        <p class="hint note">Tap a preset to rename or delete it.</p>
      {/if}

      <div class="grid" class:saving={mode === 'save'} class:managing={mode === 'manage'}>
        {#each presets as p (p.n)}
          <button class="slot" class:here={!p.empty && p.freq === st.tuner?.freq} class:empty={p.empty}
            class:confirm={confirm === p.n} class:sel={editing === p.n}
            disabled={!active || (p.empty && mode !== 'save') || busy}
            onclick={() => tapSlot(p)} title={p.empty ? 'Empty' : p.name ? `${p.name} · ${fmtFreq(p.freq)}` : fmtFreq(p.freq)}>
            <span class="num">{Number(p.n)}</span>
            {#if confirm === p.n}
              <span class="f">Replace?</span>
            {:else if p.empty}
              <span class="f">Empty</span>
            {:else}
              <span class="f">{p.name || fmtFreq(p.freq).replace(/ (MHz|kHz)$/, '')}</span>
            {/if}
          </button>
        {/each}
      </div>

      {#if mode === 'manage' && editP}
        <div class="editor">
          <div class="label">Preset {Number(editP.n)} · {fmtFreq(editP.freq)}</div>
          <div class="row">
            <input type="text" maxlength="8" placeholder="Name (up to 8)" bind:value={nameDraft} aria-label="Preset name"
              onkeydown={(e) => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') editing = null; }} />
            <button class="btn small" disabled={busy || !nameOk || nameDraft === editP.name} onclick={saveName}>Save name</button>
          </div>
          {#if !nameOk}<div class="hint bad">Letters, numbers and plain symbols only (no &lt; &gt; &amp;).</div>{/if}
          <div class="row">
            <button class="btn small danger" disabled={busy} onclick={del}><Icon name="x" size={14} />{confirmDelete ? 'Tap again to delete' : 'Delete preset'}</button>
            <button class="btn small ghost" onclick={() => (editing = null)}>Close</button>
          </div>
        </div>
      {/if}

      {#if mode === 'manage'}
        <div class="row all">
          <button class="btn small danger" disabled={busy || !used.length} onclick={delAll}>{confirmAll ? `Tap again to delete all ${used.length}` : 'Delete all presets…'}</button>
          {#if used.length < presets.length}
            <button class="btn small" disabled={busy} onclick={() => act({ action: 'restoreAll' }, 'Deleted presets restored')}>Restore all</button>
          {/if}
          {#if confirmAll}<button class="btn small ghost" onclick={() => (confirmAll = false)}>Cancel</button>{/if}
        </div>
        <p class="hint">The receiver can't truly erase a preset: deleting hides it from Preset ◀ ▶ (the receiver calls it "Preset Skip"),
          and saving a station into it brings it back. Restore all un-hides them with their old stations.</p>
      {/if}
    </details>
  {/if}
</Panel>

<style>
  .keys { margin-top: 8px; }
  .tuner { text-align: center; padding: 8px 0 12px; }
  .tuner.dim { opacity: 0.45; }
  .notice { margin: 0 0 6px; text-align: center; }
  .freq { font-size: 34px; font-weight: 700; color: var(--accent); letter-spacing: -1px; }
  details { margin-top: 12px; }
  summary { cursor: pointer; font-weight: 600; padding: 4px 0; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  summary::before { content: '▸'; margin-right: 6px; }
  details[open] summary::before { content: '▾'; }
  summary > span:first-of-type { flex: 1; }
  summary::-webkit-details-marker { display: none; }
  .manage.on { color: var(--accent); }
  .note { margin: 6px 0 2px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(78px, 1fr)); gap: 6px; margin-top: 8px;
    max-height: 236px; overflow: auto; padding: 2px; }
  .slot { display: flex; flex-direction: column; align-items: flex-start; gap: 1px; padding: 6px 8px; border-radius: 9px;
    border: 1px solid var(--line); background: var(--card-2); cursor: pointer; text-align: left; min-width: 0; }
  .slot:hover:not(:disabled) { border-color: var(--accent); }
  .slot:disabled { opacity: 0.5; cursor: default; }
  .slot .num { font-size: 11px; color: var(--faint); }
  .slot .f { font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden;
    text-overflow: ellipsis; max-width: 100%; }
  .slot.empty { background: transparent; border-style: dashed; }
  .slot.empty .f { color: var(--faint); font-weight: 500; }
  .slot.empty:disabled { opacity: 0.7; }
  .slot.here { border-color: var(--accent); color: var(--accent); }
  .saving .slot { border-style: dashed; }
  .saving .slot.empty { border-color: var(--good); }
  .slot.confirm, .slot.sel { border-style: solid; border-color: var(--bad); color: var(--bad); background: transparent; }
  .slot.sel { border-color: var(--accent); color: var(--accent); }
  .editor { margin-top: 10px; padding: 10px; border: 1px solid var(--line); border-radius: 10px; display: grid; gap: 8px; }
  .editor .row, .all { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .editor input { flex: 1; min-width: 0; }
  .all { margin-top: 10px; }
  .danger { color: var(--bad); }
  .bad { color: var(--bad); }
</style>
