<script>
  import { avr } from './avr.svelte.js';
  import { useSetup } from './useSetup.svelte.js';
  import { el, esc, txt } from './setup.js';
  import Icon from './Icon.svelte';
  import Slider from './Slider.svelte';

  const rename = useSetup('inputs', 3);
  const hide = useSetup('inputs', 4);
  const assign = useSetup('inputs', 2);
  const level = useSetup('inputs', 5);

  const HIDE_REASON = { 3: 'In use by Main Zone', 4: 'In use by Zone 2', 5: 'In use by Zone 3', 7: 'Select source', 8: 'Video select' };

  // One row per source, merged from the three pages.
  const rows = $derived.by(() => {
    if (!rename.doc) return [];
    return [...rename.doc.querySelectorAll(':scope > Source')].map((n) => {
      const idx = n.getAttribute('index');
      const h = hide.doc?.querySelector(`:scope > Source[index="${idx}"]`);
      const a = assign.doc?.querySelector(`:scope > Source[index="${idx}"]`);
      return {
        idx,
        def: txt(n, 'Default'),
        name: txt(n, 'Rename'),
        auto: txt(n, 'Auto'),
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
    await hide.write(`<Hide index="${r.idx}">${hidden ? 2 : 1}</Hide>`);
  }
  async function setAssign(r, col, value) {
    await assign.write(`<${col} index="${r.idx}">${value}</${col}>`, { delay: 600 });
  }

  const curName = $derived(avr.state.inputs?.[avr.state.source]?.name ?? avr.state.source);
  const srcLevelNode = $derived(level.doc?.querySelector('SourceLevel'));
</script>

<div class="grid">
  <section class="card">
    <h2>Inputs {#if rename.loading || hide.loading}<span class="faint small">loading…</span>{/if}</h2>
    {#if rename.error}<p class="err">{rename.error}</p>{/if}
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
                <input type="text" value={r.name} maxlength={maxLen} aria-label="Name for {r.def}"
                  onchange={(e) => saveName(r, e.currentTarget.value)}
                  onkeydown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
                {#if r.auto && r.auto !== r.name}
                  <button class="link small" onclick={() => saveName(r, r.auto)} title="Name reported by the device over HDMI">use “{r.auto}”</button>
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
      Assigning a connector that another input already uses moves it.</p>
  </section>

  {#if srcLevelNode && srcLevelNode.getAttribute('display') === '3'}
    <section class="card">
      <h2>Source level — {curName}</h2>
      <Slider label="Input level for the current source" min={-12} max={12} step={1} center value={Number(srcLevelNode.textContent)}
        format={(v) => (v > 0 ? '+' : '') + v + ' dB'} onchange={(v) => level.write(`<SourceLevel>${v}</SourceLevel>`, { quiet: true })} />
      <p class="faint small">Evens out loudness differences between inputs. Applies to whichever input is active.</p>
    </section>
  {/if}
</div>

<style>
  .table-wrap { overflow-x: auto; margin: 0 -4px; }
  table { width: 100%; border-collapse: collapse; min-width: 640px; }
  th { text-align: left; font-size: 12px; color: var(--muted); font-weight: 600; padding: 6px 6px; text-transform: uppercase; letter-spacing: 0.05em; }
  td { padding: 6px; border-top: 1px solid var(--line); vertical-align: middle; }
  tr.hidden td { opacity: 0.55; }
  td input[type='text'] { min-width: 140px; }
  select { min-width: 96px; }
  .link { background: none; border: 0; color: var(--blue); cursor: pointer; padding: 2px 0; display: block; }
  .err { color: var(--bad); }
  p { margin: 10px 0 0; }
</style>
