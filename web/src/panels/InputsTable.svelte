<script>
  import { useSetup } from '../lib/useSetup.svelte.js';
  import { el, esc, txt } from '../lib/setup.js';
  import Icon from '../lib/Icon.svelte';
  import Panel from '../lib/Panel.svelte';

  const rename = useSetup('inputs', 3);
  const hide = useSetup('inputs', 4);
  const assign = useSetup('inputs', 2);

  const HIDE_REASON = { 3: 'In use by Main Zone', 4: 'In use by Zone 2', 5: 'In use by Zone 3', 7: 'Select source', 8: 'Video select' };

  // Factory names (inputs type 3 <Default>), for sources missing from the rename page.
  const DEFAULT_NAME = { 1: 'CBL/SAT', 3: 'Blu-ray', 4: 'Game', 5: 'Media Player', 6: 'TV Audio', 7: 'AUX1', 8: 'AUX2', 10: 'Phono', 11: 'Tuner', 13: 'HEOS Music' };

  // One row per source, merged from the three pages. The hide page lists every source;
  // the rename and assign pages leave out hidden ones (and Tuner), so it drives the rows.
  const rows = $derived.by(() => {
    const base = hide.doc ?? rename.doc;
    if (!base) return [];
    return [...base.querySelectorAll(':scope > Source')].map((n) => {
      const idx = n.getAttribute('index');
      const h = hide.doc?.querySelector(`:scope > Source[index="${idx}"]`);
      const r = rename.doc?.querySelector(`:scope > Source[index="${idx}"]`);
      const a = assign.doc?.querySelector(`:scope > Source[index="${idx}"]`);
      return {
        idx,
        def: txt(r, 'Default') ?? DEFAULT_NAME[idx] ?? txt(h, 'Name'),
        name: txt(r, 'Rename') ?? txt(h, 'Name') ?? DEFAULT_NAME[idx],
        renamable: !!r,
        auto: txt(r, 'Auto'),
        hideVal: txt(h, 'Hide'),
        hideLocked: h?.getAttribute('display') === '2',
        a,
      };
    });
  });
  const maxLen = $derived(Number(txt(rename.doc, 'CharacterMax') ?? 16));
  const cols = $derived(
    ['HDMI', 'Digital', 'Analog', 'Video'].filter((c) => assign.doc && txt(assign.doc, `Contents > ${c}`) === '3'),
  );
  const options = (col) =>
    [...(assign.doc?.querySelectorAll(`SelectionList > ${col} > List > Item`) ?? [])].map((i) => ({
      value: i.getAttribute('index'), label: i.textContent.trim() === '-' ? '—' : `${col === 'HDMI' ? 'HDMI ' : ''}${i.textContent.trim()}`,
    }));

  const clean = (s) => s.replace(/[^\x20-\x7E]/g, '').slice(0, maxLen);
  async function saveName(r, value) {
    const v = clean(value.trim());
    if (v === r.name) return;
    await rename.write(el('Source', esc(v || ' '), { index: r.idx }));
  }
  async function setHidden(r, hidden) {
    // Showing or hiding adds or drops the source on the rename and assign pages.
    if (await hide.write(`<Hide index="${r.idx}">${hidden ? 2 : 1}</Hide>`)) await Promise.all([rename.reload(), assign.reload()]);
  }
  async function setAssign(r, col, value) {
    await assign.write(`<${col} index="${r.idx}">${value}</${col}>`, { delay: 600 });
  }
</script>

<Panel id="setup-inputs" title="Inputs" class="wide">
    {#snippet actions()}{#if rename.loading || hide.loading}<span class="faint small">loading…</span>{/if}{/snippet}
    {#if rename.error || hide.error}<p class="err">{rename.error || hide.error}</p>{/if}
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>Input</th><th>Name</th><th>Shown</th>{#each cols as c}<th>{c}</th>{/each}</tr>
        </thead>
        <tbody>
          {#each rows as r (r.idx)}
            <tr class:hidden={r.hideVal === '2'}>
              <td class="muted">{r.def}</td>
              <td>
                {#if !r.renamable}
                  <span class="muted" title={r.hideVal === '2' ? 'Show this input to rename it' : ''}>{r.name}</span>
                {:else}
                  <input type="text" value={r.name} maxlength={maxLen} aria-label="Name for {r.def}"
                    onchange={(e) => saveName(r, e.currentTarget.value)}
                    onkeydown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
                  {#if r.auto && r.auto !== r.name}
                    <div class="cec">
                      <span class="cec-label" title="The name a device on this input announced over HDMI-CEC. The receiver remembers it even after the device is unplugged, so it may be out of date.">Device name:</span>
                      <strong class="cec-name">{r.auto}</strong>
                      <button class="btn small" aria-label="Set the name of {r.def} to {r.auto}" disabled={rename.saving}
                        onclick={() => saveName(r, r.auto)}>Set</button>
                    </div>
                  {/if}
                {/if}
              </td>
              <td>
                {#if r.hideLocked}
                  <span class="faint small" title={HIDE_REASON[r.hideVal] ?? ''}>{HIDE_REASON[r.hideVal] ?? '—'}</span>
                {:else}
                  <button class="switch" class:on={r.hideVal === '1'} aria-label="Show {r.name}"
                    onclick={() => setHidden(r, r.hideVal === '1')}></button>
                {/if}
              </td>
              {#each cols as c}
                {@const node = r.a?.querySelector(`:scope > ${c}`)}
                <td>
                  {#if !node || node.getAttribute('display') === '1'}
                    <span class="faint">—</span>
                  {:else if node.getAttribute('display') === '2'}
                    <span class="faint small">{node.textContent === '2' ? 'fixed' : '—'}</span>
                  {:else}
                    <select value={node.textContent.trim()} aria-label="{c} for {r.name}" onchange={(e) => setAssign(r, c, e.currentTarget.value)}>
                      {#each options(c) as o}<option value={o.value}>{o.label}</option>{/each}
                    </select>
                  {/if}
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <p class="faint small">Changes are sent to the receiver immediately; the previous values are backed up first.
      The same connector can be assigned to more than one input.</p>
</Panel>


<style>
  .table-wrap { overflow-x: auto; margin: 0 -4px; }
  table { width: 100%; border-collapse: collapse; min-width: 640px; }
  th { text-align: left; font-size: 12px; color: var(--muted); font-weight: 600; padding: 6px 6px; text-transform: uppercase; letter-spacing: 0.05em; }
  td { padding: 6px; border-top: 1px solid var(--line); vertical-align: middle; }
  tr.hidden td { opacity: 0.55; }
  td input[type='text'] { min-width: 140px; }
  select { min-width: 96px; }
  .cec { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; padding-top: 6px; font-size: 13px; }
  .cec-label { color: var(--muted); cursor: help; }
  .cec-name { color: var(--text); font-weight: 600; }
  .cec .btn { min-height: 28px; padding: 2px 12px; }
  .err { color: var(--bad); }
  p { margin: 10px 0 0; }
</style>
