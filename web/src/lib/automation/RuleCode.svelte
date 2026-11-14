<script>
  // A rule as pseudo code (outline() in model.js): one line per step, if / else bodies indented, syntax colors.
  // Spans only, so it can sit inside a button (the Automation panel's rule rows).
  let { lines } = $props();
</script>

<span class="code">
  {#each lines as ln, i (i)}
    <span class="ln" style:--depth={ln.depth}>{#each ln.parts as p, j (j)}<span class={p.k}>{p.t}</span>{/each}</span>
  {/each}
</span>

<style>
  /* The whole rule, never cut. A wrapped line hangs under its own text, so the indentation stays readable. */
  .code { display: flex; flex-direction: column; gap: 1px; font-size: var(--code-size, 12.5px); line-height: 1.4; color: var(--muted); overflow-wrap: anywhere; }
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
</style>
