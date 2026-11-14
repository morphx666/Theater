<script>
  // Full-screen automation editor (Scratch-style blocks): a "when" hat with its triggers, and the script under it.
  // Blocks come from the palette (tap: insert at the selected gap or at the end; drag: drop on a gap) and move by
  // their grip. Every change is a step for undo / redo. Saving sends the rule to the server, which validates it.
  import { onMount, onDestroy, setContext } from 'svelte';
  import { toast } from '../avr.svelte.js';
  import { ui } from '../layout.svelte.js';
  import Icon from '../Icon.svelte';
  import BlockList from './BlockList.svelte';
  import Trigger from './Trigger.svelte';
  import { auto, loadCatalog, loadRules, act, closeRule, followNames } from './store.svelte.js';
  import { blankRule, newBlock, newTrigger, listAt, moveBlock, insertBlock, problems, fmtMs } from './model.js';

  let { id } = $props();

  // ---------- state shared with the blocks (context) ----------
  const ed = $state({
    catalog: [], rule: null, cursor: null, drag: null,
    commit, setCursor, startDrag, duplicate, nudge, remove,
  });
  setContext('editor', ed);

  let loadError = $state('');
  let saveError = $state('');
  let saving = $state(false);
  let saved = $state(''); // JSON of the rule as last saved
  let hist = $state([]), pos = $state(0); // undo history (JSON snapshots)
  const json = () => JSON.stringify($state.snapshot(ed.rule));
  const dirty = $derived(ed.rule ? json() !== saved : false);
  const issues = $derived(ed.rule ? problems(ed.rule, ed.catalog) : []);
  let showIssues = $state(false);

  followNames();
  $effect(() => { if (ed.catalog && auto.catalog.length && ed.catalog !== auto.catalog) ed.catalog = auto.catalog; }); // fresher names

  onMount(async () => {
    document.body.style.overflow = 'hidden';
    try {
      ed.catalog = auto.catalog.length ? auto.catalog : await loadCatalog();
      if (id === 'new') ed.rule = blankRule(ed.catalog);
      else {
        const rules = auto.loaded ? auto.rules : await loadRules();
        const r = rules.find((x) => x.id === id);
        if (!r) throw new Error('This automation no longer exists');
        ed.rule = structuredClone($state.snapshot(r));
      }
      saved = id === 'new' ? '' : json();
      hist = [json()]; pos = 0;
    } catch (e) {
      loadError = e.message;
    }
  });
  onDestroy(() => { document.body.style.overflow = ''; });

  // ---------- edits ----------
  function commit() {
    const j = json();
    if (j === hist[pos]) return;
    hist = [...hist.slice(Math.max(0, pos - 99), pos + 1), j];
    pos = hist.length - 1;
    saveError = '';
  }
  function undo() { if (pos > 0) { pos--; ed.rule = JSON.parse(hist[pos]); ed.cursor = null; } }
  function redo() { if (pos < hist.length - 1) { pos++; ed.rule = JSON.parse(hist[pos]); ed.cursor = null; } }

  function setCursor(list, index) {
    const same = ed.cursor && JSON.stringify(ed.cursor.list) === JSON.stringify(list) && ed.cursor.index === index;
    ed.cursor = same ? null : { list, index };
  }
  function duplicate(list, index) {
    const l = listAt(ed.rule, list);
    l.splice(index + 1, 0, structuredClone($state.snapshot(l[index])));
    commit();
  }
  function nudge(list, index, dir) {
    const l = listAt(ed.rule, list);
    const j = index + dir;
    if (j < 0 || j >= l.length) return;
    [l[index], l[j]] = [l[j], l[index]];
    commit();
  }
  function remove(list, index) {
    listAt(ed.rule, list).splice(index, 1);
    ed.cursor = null;
    commit();
  }

  /** Palette tap: insert at the selected gap (then keep inserting after it), or at the end of the script. */
  function insert(make) {
    const at = ed.cursor ?? { list: ['script'], index: ed.rule.script.length };
    insertBlock(ed.rule, at.list, at.index, make());
    if (ed.cursor) ed.cursor = { list: at.list, index: at.index + 1 };
    commit();
    sheet = false;
  }

  // ---------- drag and drop (pointer events: mouse, pen and touch) ----------
  let scriptEl = $state();
  function gapAt(x, y) {
    let best = null, bd = Infinity;
    for (const el of scriptEl?.querySelectorAll('[data-gap]') ?? []) {
      const r = el.getBoundingClientRect();
      const d = Math.hypot(x - Math.max(r.left, Math.min(x, r.right)), y - (r.top + r.bottom) / 2);
      if (d < bd) { bd = d; best = el; }
    }
    return best && bd < 140 ? { list: JSON.parse(best.dataset.gap), index: Number(best.dataset.index) } : null;
  }
  function startDrag(e, payload, label, tap) {
    if (e.button !== undefined && e.button !== 0) return;
    const sx = e.clientX, sy = e.clientY;
    let started = false;
    const move = (ev) => {
      if (!started && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
      started = true;
      ev.preventDefault();
      // Scroll the script while dragging near its top or bottom edge.
      const r = scriptEl?.getBoundingClientRect();
      if (r && ev.clientY < r.top + 50) scriptEl.scrollBy(0, -14);
      else if (r && ev.clientY > r.bottom - 50) scriptEl.scrollBy(0, 14);
      ed.drag = { payload, label, x: ev.clientX, y: ev.clientY, over: gapAt(ev.clientX, ev.clientY) };
    };
    const end = (ev) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      const over = ed.drag?.over;
      ed.drag = null;
      if (!started) { if (ev.type === 'pointerup') tap?.(); return; }
      if (!over) return;
      if (payload.kind === 'move') {
        if (!moveBlock(ed.rule, payload.list, payload.index, over.list, over.index)) return toast("A block can't go inside itself");
      } else insertBlock(ed.rule, over.list, over.index, payload.make());
      commit();
      sheet = false;
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  }

  // ---------- palette ----------
  let sheet = $state(false); // phones: the palette is a bottom sheet
  const palette = $derived.by(() => {
    if (!ed.catalog.length) return [];
    const c = ed.catalog;
    const groups = new Map();
    for (const p of c.filter((x) => x.writable)) (groups.get(p.group) ?? groups.set(p.group, []).get(p.group)).push(p);
    return [
      { cat: 'control', title: 'Control', items: [
        { label: 'if … then', make: () => newBlock('if', c) },
        { label: 'wait', make: () => newBlock('wait', c) },
        { label: 'wait until …', make: () => newBlock('waitUntil', c) },
        { label: 'stop the rule', make: () => newBlock('stop', c) },
      ] },
      { cat: 'sound', title: 'Sound mode', items: [{ label: 'find sound mode containing …', make: () => newBlock('findMode', c) }] },
      ...[...groups].map(([g, props]) => ({ cat: 'action', title: `Set · ${g}`, items: props.map((p) => ({ label: VERB[p.id] ?? `set ${p.label}`, make: () => newBlock('set', c, p.id) })) })),
    ];
  });
  const VERB = {
    speakerPreset: 'apply speaker preset', 'heos.favorite': 'play HEOS favorite', 'heos.state': 'play / pause HEOS',
    'heos.skip': 'HEOS next / previous', quick: 'recall Quick Select', 'tuner.preset': 'tune to tuner preset',
  };
  let search = $state('');
  const shown = $derived(palette.map((g) => ({ ...g, items: g.items.filter((i) => i.label.toLowerCase().includes(search.trim().toLowerCase())) })).filter((g) => g.items.length));

  // ---------- header actions ----------
  let discardArmed = $state(false);
  function back() {
    if (dirty && !discardArmed) { discardArmed = true; setTimeout(() => (discardArmed = false), 4000); return; }
    closeRule();
  }
  async function save() {
    if (issues.length) { showIssues = true; return; }
    saving = true;
    try {
      const r = await act({ action: 'save', automation: $state.snapshot(ed.rule) });
      ed.rule.id = r.automation.id;
      saved = json();
      hist = [saved]; pos = 0;
      toast('Saved');
      if (id === 'new') ui.rule = r.automation.id; // the address now points at the saved rule
      loadRules().catch(() => {});
    } catch (e) {
      saveError = e.message;
    } finally {
      saving = false;
    }
  }
  let test = $state(null); // dry-run result
  async function runTest() {
    if (issues.length) { showIssues = true; return; }
    try { test = (await act({ action: 'test', automation: $state.snapshot(ed.rule) })).run; } catch (e) { saveError = e.message; }
  }
  const RESULT = { 'would-send': 'would send', skipped: 'skipped', true: 'true', false: 'false', met: 'met now', timeout: 'not met now', waited: 'waits', stop: 'stops' };

  function onKey(e) {
    if (e.key === 'Escape' && !ed.drag) { if (test) test = null; else back(); return; }
    if (e.target.closest('input, select, textarea')) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="editor" class:dragging={!!ed.drag} role="dialog" aria-modal="true" aria-label="Automation editor">
  <header>
    <button class="btn icon ghost" aria-label="Back" title={dirty ? 'Back (unsaved changes)' : 'Back'} onclick={back}><Icon name="back" /></button>
    {#if ed.rule}
      <input class="name" aria-label="Name" maxlength="40" value={ed.rule.name}
        oninput={(e) => (ed.rule.name = e.currentTarget.value)} onchange={commit} />
      <button class="switch" class:on={ed.rule.enabled} aria-label="On / off" title={ed.rule.enabled ? 'On' : 'Off'}
        onclick={() => { ed.rule.enabled = !ed.rule.enabled; commit(); }}></button>
      <span class="tools">
        <button class="btn icon ghost" aria-label="Undo" title="Undo" disabled={pos === 0} onclick={undo}><Icon name="reset" size={18} /></button>
        <button class="btn icon ghost redo" aria-label="Redo" title="Redo" disabled={pos >= hist.length - 1} onclick={redo}><Icon name="reset" size={18} /></button>
        <button class="btn" onclick={runTest} title="See what it would do now, without sending anything">Test</button>
        <button class="btn primary" disabled={saving || (!dirty && saved !== '')} onclick={save}>{saving ? 'Saving…' : 'Save'}</button>
      </span>
    {/if}
  </header>
  {#if discardArmed}<div class="bar warn">Unsaved changes. Tap back again to discard them.</div>{/if}
  {#if saveError}<div class="bar err">{saveError}</div>{/if}
  {#if showIssues && issues.length}<div class="bar err">{issues.join(' · ')}</div>{/if}

  {#if loadError}
    <p class="err pad">{loadError}</p>
  {:else if ed.rule}
    <div class="body">
      <aside class="palette" class:open={sheet}>
        <input class="search" type="search" placeholder="Find a block" aria-label="Find a block" bind:value={search} />
        <p class="faint small hint">Tap to add {ed.cursor ? 'at the marked spot' : 'at the end'}, or drag onto the script.</p>
        {#each shown as g (g.title)}
          <div class="pgroup">
            <div class="ptitle">{g.title}</div>
            {#each g.items as it (it.label)}
              <button class="pitem {g.cat}" onpointerdown={(e) => startDrag(e, { kind: 'new', make: it.make }, it.label, () => insert(it.make))}
                onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); insert(it.make); } }}>{it.label}</button>
            {/each}
          </div>
        {/each}
      </aside>

      <main class="script" bind:this={scriptEl}>
        <div class="hat">
          <div class="hattitle">when</div>
          {#each ed.rule.when as t, i (t)}
            {#if i}<div class="or">or when</div>{/if}
            <Trigger trigger={t} index={i} removable={ed.rule.when.length > 1} />
          {/each}
          {#if ed.rule.when.length < 8}
            <button class="add" onclick={() => { ed.rule.when.push(newTrigger('change', ed.catalog)); commit(); }}>+ or when…</button>
          {/if}
        </div>
        <div class="stackwrap">
          <BlockList list={ed.rule.script} path={['script']} />
          {#if !ed.rule.script.length}<p class="faint small empty">Add blocks from the palette: they run top to bottom when a trigger fires.</p>{/if}
        </div>
      </main>
    </div>
    <button class="btn primary fab" onclick={() => (sheet = !sheet)}>{sheet ? 'Close' : '+ Blocks'}</button>
  {/if}

  {#if ed.drag}
    <div class="dragghost" style="left: {ed.drag.x}px; top: {ed.drag.y}px">{ed.drag.label}</div>
  {/if}

  {#if test}
    <div class="test" role="dialog" aria-label="Test result">
      <div class="testhead"><strong>If it ran now</strong><span class="faint small">nothing was sent</span>
        <button class="btn icon ghost" aria-label="Close" onclick={() => (test = null)}><Icon name="x" size={16} /></button></div>
      {#each test.steps as s, i (i)}
        <div class="step {s.result}">
          <span class="what">{s.what}</span>
          <span class="res">{RESULT[s.result] ?? s.result}{s.cmds?.length ? `: ${s.cmds.join(', ')}` : ''}{s.note ? ` (${s.note})` : ''}</span>
        </div>
      {:else}
        <p class="faint small">No steps.</p>
      {/each}
      {#if test.status === 'stopped'}<p class="faint small">The rule stops here.</p>{/if}
    </div>
  {/if}
</div>

<style>
  .editor {
    position: fixed; inset: 0; z-index: 40; display: flex; flex-direction: column; background: var(--bg); color: var(--text);
    /* Block colors (Scratch-like categories), readable in both themes. */
    --b-event: #d99a0b; --b-control: #e07b39; --b-check: #2f9e63; --b-action: #3f74d6; --b-sound: #8b5fd6;
    --b-ink: #fff; --b-bg: color-mix(in srgb, var(--bg) 85%, transparent);
  }
  header {
    display: flex; align-items: center; gap: 10px; padding: calc(10px + env(safe-area-inset-top)) 14px 10px;
    border-bottom: 1px solid var(--line); background: var(--bg-2);
  }
  .name { flex: 1; width: auto; min-width: 80px; min-height: 0; font: 600 17px var(--font); background: transparent; border: 1px solid transparent; border-radius: 8px; padding: 6px 8px; color: inherit; }
  .name:hover, .name:focus { border-color: var(--line); background: var(--card); outline: none; }
  .tools { display: flex; align-items: center; gap: 6px; }
  .redo :global(svg) { transform: scaleX(-1); }
  .bar { padding: 8px 16px; font-size: 13px; border-bottom: 1px solid var(--line); }
  .bar.err { color: var(--bad); }
  .bar.warn { color: var(--b-event); }
  .pad { padding: 20px; }

  .body { flex: 1; display: grid; grid-template-columns: 240px 1fr; min-height: 0; }
  .palette { overflow-y: auto; padding: 12px; border-right: 1px solid var(--line); background: var(--bg-2); display: flex; flex-direction: column; gap: 10px; }
  .search { width: 100%; }
  .hint { margin: -4px 0 0; }
  .pgroup { display: flex; flex-direction: column; gap: 5px; }
  .ptitle { font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); margin: 4px 0 2px; }
  .pitem {
    text-align: left; border: 0; border-radius: 8px; padding: 7px 10px; font: 600 13px var(--font); color: var(--b-ink);
    background: var(--b-action); cursor: grab; touch-action: pan-y; box-shadow: inset 0 -2px 0 color-mix(in srgb, black 22%, transparent);
  }
  .pitem.control { background: var(--b-control); }
  .pitem.sound { background: var(--b-sound); }

  .script { overflow: auto; padding: 18px 18px 120px; }
  .hat {
    display: inline-flex; flex-direction: column; gap: 6px; min-width: min(100%, 420px); max-width: 100%;
    padding: 10px 12px 12px; border-radius: 18px 18px 10px 10px; background: var(--b-event); color: var(--b-ink);
    box-shadow: inset 0 -3px 0 color-mix(in srgb, black 22%, transparent);
  }
  .hattitle { font-weight: 700; font-size: 15px; }
  .or { font-weight: 600; font-size: 12.5px; opacity: 0.85; }
  .add { align-self: flex-start; border: 0; border-radius: 999px; padding: 4px 12px; background: color-mix(in srgb, black 18%, transparent); color: inherit; font: inherit; font-size: 12.5px; cursor: pointer; }
  .stackwrap { margin-left: 10px; max-width: 900px; }
  .empty { margin: 4px 0 0 6px; }

  /* Fields inside blocks */
  .editor :global(.f) {
    background: color-mix(in srgb, white 92%, transparent); color: #141821; border: 0; border-radius: 6px;
    padding: 3px 6px; font: 13px var(--font); min-height: 26px; width: auto; max-width: 100%;
    color-scheme: light; /* the fields are light: their open lists must use light colors too (the app is dark) */
  }
  .editor :global(select.f[multiple]) { min-height: 60px; }

  .dragghost {
    position: fixed; z-index: 50; pointer-events: none; transform: translate(10px, 10px); padding: 6px 10px; border-radius: 8px;
    background: var(--b-action); color: var(--b-ink); font: 600 13px var(--font); box-shadow: var(--shadow); opacity: 0.9;
  }
  .fab { display: none; }

  .test {
    position: absolute; right: 16px; bottom: 16px; z-index: 45; width: min(440px, calc(100% - 32px)); max-height: 60%; overflow: auto;
    background: var(--card); border: 1px solid var(--line); border-radius: 14px; box-shadow: var(--shadow); padding: 12px 14px;
  }
  .testhead { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
  .testhead .btn { margin-left: auto; }
  .step { display: flex; flex-direction: column; padding: 6px 0; border-top: 1px solid var(--line); font-size: 13px; }
  .step .res { color: var(--muted); }
  .step.would-send .res { color: var(--good); }
  .step.false .res, .step.timeout .res { color: var(--b-event); }

  @media (max-width: 760px) {
    header { flex-wrap: wrap; row-gap: 6px; }
    .tools { flex: 1 0 100%; justify-content: flex-end; }
    .body { grid-template-columns: 1fr; }
    .palette {
      position: fixed; left: 0; right: 0; bottom: 0; z-index: 44; max-height: 55dvh; border-right: 0; border-top: 1px solid var(--line);
      border-radius: 16px 16px 0 0; box-shadow: var(--shadow); transform: translateY(105%); transition: transform 0.2s;
      padding-bottom: calc(70px + env(safe-area-inset-bottom));
    }
    .palette.open { transform: none; }
    .fab { display: inline-flex; position: fixed; right: 16px; bottom: calc(16px + env(safe-area-inset-bottom)); z-index: 46; }
    .script { padding: 14px 12px 120px; }
  }
</style>
