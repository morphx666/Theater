<script>
  // Setup › App & Info › Automation: every rule, with on/off, edit, run now, duplicate and delete.
  // The rules run on the server (server/automation.ts); the editor opens full screen (lib/automation/Editor.svelte).
  import { avr, toast } from '../lib/avr.svelte.js';
  import Panel from '../lib/Panel.svelte';
  import Icon from '../lib/Icon.svelte';
  import { auto, loadCatalog, loadRules, act, openRule, followNames } from '../lib/automation/store.svelte.js';
  import { outline } from '../lib/automation/model.js';

  let error = $state('');
  // The snapshot's summary changes when a rule is added, renamed, removed or switched: reload the full rules then.
  const shape = $derived(JSON.stringify((avr.automations ?? []).map((a) => [a.id, a.name, a.enabled])));
  $effect(() => {
    shape;
    Promise.all([auto.catalog.length ? null : loadCatalog(), loadRules()]).then(() => (error = ''), (e) => (error = e.message));
  });

  followNames(); // input and preset names as the user set them, even if they change while the page is open

  const live = (id) => avr.automations?.find((a) => a.id === id);
  const rows = $derived(auto.rules.map((r) => ({ rule: r, s: live(r.id), lines: outline(r, auto.catalog) })));

  function ago(t) {
    const s = Math.round((Date.now() - t) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.round(s / 60)} min ago`;
    if (s < 86400) return `${Math.round(s / 3600)} h ago`;
    return new Date(t).toLocaleDateString();
  }
  const STATUS = { done: 'ran', stopped: 'stopped', cancelled: 'cancelled', error: 'failed', running: 'running' };

  async function run(body, ok) {
    try { await act(body); if (ok) toast(ok); await loadRules(); } catch (e) { toast(e.message, 'error'); }
  }
  const isOn = (r, s) => (s?.enabled ?? r.enabled) && !s?.disabled;
  const toggle = (r, s) => run({ action: 'enable', id: r.id, on: !isOn(r, s) }); // turning on also clears a loop-protection stop
  const runNow = (r) => run({ action: 'run', id: r.id }, `Running "${r.name}"`);
  function duplicate(r) {
    const { id, disabled, ...rest } = structuredClone($state.snapshot(r));
    run({ action: 'save', automation: { ...rest, name: `${r.name} copy`.slice(0, 40), enabled: false } }, 'Duplicated (turned off)');
  }
  let deleting = $state(null); // tap twice
  function remove(r) {
    if (deleting !== r.id) { deleting = r.id; setTimeout(() => { if (deleting === r.id) deleting = null; }, 4000); return; }
    deleting = null;
    run({ action: 'delete', id: r.id }, `Deleted "${r.name}"`);
  }
</script>

<Panel id="automation" title="Automation">
  {#snippet actions()}
    <button class="btn small" onclick={() => openRule('new')}><Icon name="plus" size={14} />New</button>
  {/snippet}
  {#if error}<p class="err small">{error}</p>{/if}
  {#if auto.loaded && !rows.length}
    <p class="muted small">No automations yet. A rule watches the receiver ("when the input changes to Blu-ray"), checks
      conditions and changes settings. Rules run on the server, even with no browser open.</p>
  {/if}
  <div class="rules">
    {#each rows as { rule: r, s, lines } (r.id)}
      {@const on = isOn(r, s)}
      <div class="rule" class:off={!on}>
        <button class="switch" class:on aria-label="{r.name} on/off" title={on ? 'Turn off' : 'Turn on'} onclick={() => toggle(r, s)}></button>
        <button class="body" onclick={() => openRule(r.id)} title="Edit">
          <span class="name">{r.name}{#if s?.running}<span class="pill run">running</span>{/if}</span>
          <!-- The rule as pseudo code: one line per step, if / else bodies indented. -->
          <span class="code">
            {#each lines as ln, i (i)}
              <span class="ln" style:--depth={ln.depth}>{#each ln.parts as p, j (j)}<span class={p.k}>{p.t}</span>{/each}</span>
            {/each}
          </span>
          {#if s?.disabled}
            <span class="warn small">{s.disabled}</span>
          {:else if s?.lastRun}
            <span class="faint small" class:err={s.lastRun.status === 'error'}>
              {STATUS[s.lastRun.status] ?? s.lastRun.status} {ago(s.lastRun.at)}{s.lastRun.error ? `: ${s.lastRun.error}` : ''}
            </span>
          {/if}
        </button>
        <div class="acts">
          <button class="btn small" onclick={() => openRule(r.id)}><Icon name="edit" size={14} />Edit</button>
          <button class="btn small" title="Run now" disabled={!!s?.running} onclick={() => runNow(r)}><Icon name="play" size={14} />Run</button>
          <button class="btn small" title="Duplicate" onclick={() => duplicate(r)}><Icon name="copy" size={14} />Duplicate</button>
          <button class="btn small danger" onclick={() => remove(r)}><Icon name="x" size={14} />{deleting === r.id ? 'Tap again' : 'Delete'}</button>
        </div>
      </div>
    {/each}
  </div>
</Panel>

<style>
  .rules { display: flex; flex-direction: column; gap: 8px; container: rules / inline-size; }
  .rule {
    display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 12px;
    padding: 10px 12px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--card-2);
  }
  .rule.off .body { opacity: 0.6; }
  .body {
    all: unset; cursor: pointer; display: flex; flex-direction: column; gap: 3px; min-width: 0;
  }
  .name { font-weight: 600; display: flex; align-items: center; gap: 8px; }
  /* The whole rule, never cut. A wrapped line hangs under its own text, so the indentation stays readable. */
  .code { display: flex; flex-direction: column; gap: 1px; font-size: 12.5px; line-height: 1.4; color: var(--muted); overflow-wrap: anywhere; }
  .ln { padding-left: calc(var(--depth) * 12px + 10px); text-indent: -10px; }
  /* Syntax colors (app.css): control words, actions, properties, operators, values. */
  .ln .kw { font-weight: 650; color: var(--text); }
  .ln .verb { color: var(--syn-verb); }
  .ln .prop { color: var(--syn-prop); }
  .ln .op { color: var(--muted); }
  .ln .val { color: var(--syn-val); }
  /* Names stay in one piece ("Fire TV Stick", "Speaker preset", "-3 dB"): a name that doesn't fit moves to the
     next line whole; only one longer than a whole line wraps inside. */
  .ln .prop, .ln .val, .ln .verb { display: inline-block; max-width: 100%; text-indent: 0; }
  .warn { color: var(--bad); }
  .pill.run { font-size: 11px; padding: 1px 8px; color: var(--good); border-color: color-mix(in srgb, var(--good) 40%, var(--line)); }
  /* Every button as wide as the widest; icons in one column, the text after them. */
  .acts { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 6px; }
  .acts .btn { justify-content: flex-start; }
  /* A one-column card: the buttons one over the other on the right. */
  @container rules (max-width: 560px) {
    .rule { align-items: start; }
    .switch { margin-top: 2px; }
    .acts { grid-auto-flow: row; }
  }
</style>
