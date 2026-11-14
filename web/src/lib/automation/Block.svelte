<script>
  // One command block: set, find sound mode, if / else, wait, wait until, stop. Drag it by its grip; the ⋯
  // menu has duplicate, move up / down and delete (the keyboard-friendly alternative to dragging).
  import { getContext } from 'svelte';
  import BlockList from './BlockList.svelte';
  import Cond from './Cond.svelte';
  import PropSelect from './PropSelect.svelte';
  import ValueInput from './ValueInput.svelte';
  import Pick from './Pick.svelte';
  import Icon from '../Icon.svelte';
  import { CATEGORY, fitToProp, setRelative, changeDef, RELATIVE_MAX_DB } from './model.js';

  let { block, path, index } = $props();
  const ed = getContext('editor');
  const def = $derived(block.type === 'set' ? ed.catalog.find((p) => p.id === block.prop) : null);
  const here = $derived([...path, index]);
  let menu = $state(false);
  // "if" starts without its else part; the "else" chip adds it. An else that has steps always shows.
  let elseOn = $state(false);
  const hasElse = $derived(block.type === 'if' && (elseOn || block.else?.length > 0));
  function toggleElse() {
    if (hasElse) { elseOn = false; if (block.else.length) { block.else = []; ed.commit(); } } // undo brings the steps back
    else elseOn = true;
  }
  const sec = (ms) => Math.round(ms / 100) / 10;
  const toMs = (raw, max = 600) => Math.round(Math.min(max, Math.max(0, Number(raw) || 0)) * 10) * 100;
</script>

<div class="block {CATEGORY[block.type]}" class:c={block.type === 'if'}>
  <div class="row">
    <button class="grip" aria-label="Drag to move" title="Drag to move"
      onpointerdown={(e) => ed.startDrag(e, { kind: 'move', list: path, index }, block.type)}><Icon name="grip" size={14} /></button>

    {#if block.type === 'set'}
      <span class="w">{block.relative ? 'change' : 'set'}</span>
      <PropSelect catalog={ed.catalog} filter={(p) => p.writable} value={block.prop}
        onchange={(id) => { block.prop = id; fitToProp(block, ed.catalog.find((p) => p.id === id), 'set'); ed.commit(); }} />
      {#if def?.param}
        <Pick label={def.param.label} value={block.param} options={def.param.options.map((o) => ({ value: o.value, label: o.value }))}
          onchange={(v) => { block.param = v; ed.commit(); }} />
      {/if}
      {#if def?.relative}
        <!-- Volume: set it to a value, or change it by up to ±RELATIVE_MAX_DB from where it is when the rule runs. -->
        <Pick label="Set to, or change by" value={!!block.relative} onchange={(v) => { setRelative(block, def, v); ed.commit(); }}
          options={[{ value: false, label: 'to' }, { value: true, label: 'by' }]} />
        {#if block.relative}
          <ValueInput def={changeDef(def)} write label="Change in dB" value={block.value} onchange={(v) => { block.value = v || block.value; ed.commit(); }} />
          <span class="hint">max ±{RELATIVE_MAX_DB}</span>
        {:else}
          <ValueInput {def} write value={block.value} onchange={(v) => { block.value = v; ed.commit(); }} />
        {/if}
      {:else}
        <span class="w">to</span>
        <ValueInput {def} write value={block.value} onchange={(v) => { block.value = v; ed.commit(); }} />
      {/if}
      {#if def?.confirmAmp}
        <button class="chip" class:on={block.confirmAmp} aria-pressed={!!block.confirmAmp}
          title="Let this rule apply a preset that changes Amp Assign (check the speaker wiring first)"
          onclick={() => { if (block.confirmAmp) delete block.confirmAmp; else block.confirmAmp = true; ed.commit(); }}>{block.confirmAmp ? '✓ ' : ''}allow Amp Assign change</button>
      {/if}
      {#if def?.onlyLower && !block.relative}
        <button class="chip" class:on={block.onlyLower} aria-pressed={!!block.onlyLower} title="Skip when the volume is already at or below this"
          onclick={() => { if (block.onlyLower) delete block.onlyLower; else block.onlyLower = true; ed.commit(); }}>{block.onlyLower ? '✓ ' : ''}only lower</button>
      {/if}

    {:else if block.type === 'findMode'}
      <span class="w">find sound mode containing</span>
      <input class="f text" type="text" maxlength="40" aria-label="Text to find" value={block.text}
        class:missing={!block.text?.trim()} onchange={(e) => { block.text = e.currentTarget.value; ed.commit(); }} />
      <span class="w">if not found</span>
      <Pick label="If not found" value={block.onNotFound} onchange={(v) => { block.onNotFound = v; ed.commit(); }}
        options={[{ value: 'back', label: 'go back' }, { value: 'stay', label: 'stay' }, { value: 'stop', label: 'stop the rule' }]} />

    {:else if block.type === 'if'}
      <span class="w">if</span>
      <Cond cond={block.cond} before set={(c) => (block.cond = c)} />
      <span class="w">then</span>
      <button class="chip" class:on={hasElse} aria-pressed={hasElse} onclick={toggleElse}
        title={hasElse ? 'Remove the else part (and its steps)' : 'Add an else part: steps for when the condition is false'}>{hasElse ? '✓ ' : '+ '}else</button>

    {:else if block.type === 'wait'}
      <span class="w">wait</span>
      <span class="num"><input class="f" type="number" min="0" max="600" step="0.5" aria-label="Seconds" value={sec(block.ms)}
        onchange={(e) => { block.ms = toMs(e.currentTarget.value); ed.commit(); }} /> s</span>

    {:else if block.type === 'waitUntil'}
      <span class="w">wait until</span>
      <Cond cond={block.cond} set={(c) => (block.cond = c)} />
      <span class="w">up to</span>
      <span class="num"><input class="f" type="number" min="1" max="600" step="1" aria-label="Seconds at most" value={sec(block.timeoutMs)}
        onchange={(e) => { block.timeoutMs = Math.max(1000, toMs(e.currentTarget.value)); ed.commit(); }} /> s, then</span>
      <Pick label="After the time is up" value={block.onTimeout} onchange={(v) => { block.onTimeout = v; ed.commit(); }}
        options={[{ value: 'continue', label: 'carry on' }, { value: 'stop', label: 'stop the rule' }]} />

    {:else if block.type === 'stop'}
      <span class="w">stop the rule</span>
    {/if}

    <span class="more">
      <button class="dots" aria-label="Block menu" aria-expanded={menu} onclick={() => (menu = !menu)}>⋯</button>
      {#if menu}
        <span class="menu" role="menu">
          <button role="menuitem" onclick={() => { menu = false; ed.duplicate(path, index); }}>Duplicate</button>
          <button role="menuitem" onclick={() => { menu = false; ed.nudge(path, index, -1); }}>Move up</button>
          <button role="menuitem" onclick={() => { menu = false; ed.nudge(path, index, 1); }}>Move down</button>
          <button role="menuitem" class="del" onclick={() => { menu = false; ed.remove(path, index); }}>Delete</button>
        </span>
      {/if}
    </span>
  </div>

  {#if block.type === 'if'}
    <div class="inner"><BlockList list={block.then} path={[...here, 'then']} /></div>
    {#if hasElse}
      <div class="row mid"><span class="w">else</span></div>
      <div class="inner"><BlockList list={block.else} path={[...here, 'else']} /></div>
    {/if}
    <div class="foot"></div>
  {/if}
</div>

<style>
  .hint { font-size: 12px; opacity: 0.7; }
  .block {
    --bg: var(--b-action);
    background: var(--bg); color: var(--b-ink); border-radius: 10px; padding: 6px 8px;
    box-shadow: inset 0 -3px 0 color-mix(in srgb, black 22%, transparent);
  }
  .block.control { --bg: var(--b-control); }
  .block.sound { --bg: var(--b-sound); }
  .row { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }
  .w { font-weight: 600; }
  .grip {
    border: 0; background: none; color: inherit; opacity: 0.55; cursor: grab; padding: 4px 2px; touch-action: none;
    display: grid; place-items: center;
  }
  .grip:active { cursor: grabbing; }
  /* C-shaped blocks (if / else): the inner stacks sit in an indent. */
  .block.c { padding-bottom: 0; }
  .inner { margin: 4px 0 0 18px; padding: 2px 0 2px 8px; border-radius: 0 8px 8px 0; background: var(--b-bg); }
  .row.mid { padding: 6px 0 2px; }
  .foot { height: 12px; }
  .num { display: inline-flex; align-items: center; gap: 4px; }
  .num input { width: 64px; }
  .text { width: 130px; }
  .missing { outline: 2px dashed var(--bad); }
  .chip {
    border: 0; border-radius: 999px; padding: 3px 10px; min-height: 26px; font: 12.5px var(--font); cursor: pointer;
    background: color-mix(in srgb, black 20%, transparent); color: inherit;
  }
  .chip.on { background: color-mix(in srgb, white 92%, transparent); color: #141821; font-weight: 600; }
  .more { position: relative; margin-left: auto; }
  .dots { border: 0; background: none; color: inherit; font-size: 18px; line-height: 1; padding: 2px 6px; cursor: pointer; opacity: 0.7; }
  .menu {
    position: absolute; right: 0; top: 100%; z-index: 5; display: flex; flex-direction: column; min-width: 130px; padding: 4px;
    background: var(--card); color: var(--text); border: 1px solid var(--line); border-radius: 10px; box-shadow: var(--shadow);
  }
  .menu button { border: 0; background: none; color: inherit; font: inherit; text-align: left; padding: 8px 10px; border-radius: 6px; cursor: pointer; }
  .menu button:hover { background: var(--card-2); }
  .menu .del { color: var(--bad); }
</style>
