<script>
  // A value field that fits the property: number with its unit, a menu for choices, on/off, or text.
  //  write:    for an action (text properties then offer only the values an action may use)
  //  optional: an "any" choice (trigger from / to); the value is undefined then
  //  multiple: a list of values (is one of, has any of …)
  let { def, value, onchange, write = false, optional = false, multiple = false, label = 'Value' } = $props();

  // "has / doesn't have" on a channel list: pick a channel.
  const CHANNEL_CODES = ['FL', 'FR', 'C', 'LFE', 'SW', 'SL', 'SR', 'SBL', 'SBR', 'FHL', 'FHR', 'TFL', 'TFR', 'FDL', 'FDR', 'SDL', 'SDR']
    .map((c) => ({ value: c, label: c }));

  const choices = $derived(
    def?.type === 'bool' ? [{ value: true, label: 'On' }, { value: false, label: 'Off' }]
    : def?.type === 'enum' ? def.options ?? []
    : def?.type === 'text' && write ? def.writeOptions ?? []
    : def?.type === 'set' ? def.param?.options ?? CHANNEL_CODES
    : null,
  );
  const key = (v) => JSON.stringify(v);
  function pickOne(raw) {
    if (raw === '__any') return onchange(undefined);
    onchange(choices.find((c) => key(c.value) === raw)?.value);
  }
  function pickMany(sel) {
    onchange([...sel.selectedOptions].map((o) => choices.find((c) => key(c.value) === o.value)?.value).filter((v) => v !== undefined));
  }
  function num(raw) {
    if (raw === '' && optional) return onchange(undefined);
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    const step = def.step ?? 1;
    const clamped = Math.min(def.max ?? Infinity, Math.max(def.min ?? -Infinity, Math.round(n / step) * step));
    onchange(Number(clamped.toFixed(3)));
  }
</script>

{#if choices && multiple}
  <select class="f" multiple aria-label={label} onchange={(e) => pickMany(e.currentTarget)} size={Math.min(5, choices.length)}>
    {#each choices as c (key(c.value))}<option value={key(c.value)} selected={Array.isArray(value) && value.some((v) => key(v) === key(c.value))}>{c.label}</option>{/each}
  </select>
{:else if choices}
  <select class="f" aria-label={label} value={value === undefined ? '__any' : key(value)} onchange={(e) => pickOne(e.currentTarget.value)}>
    {#if optional}<option value="__any">any</option>{/if}
    {#each choices as c (key(c.value))}<option value={key(c.value)}>{c.label}</option>{/each}
  </select>
{:else if def?.type === 'number'}
  <span class="num">
    <input class="f" type="number" aria-label={label} min={def.min} max={def.max} step={def.step ?? 1}
      value={value ?? ''} placeholder={optional ? 'any' : ''} onchange={(e) => num(e.currentTarget.value)} />
    {#if def.unit}<span class="unit">{def.unit}</span>{/if}
  </span>
{:else}
  <input class="f text" type="text" aria-label={label} maxlength="60" value={value ?? ''} placeholder={optional ? 'any' : 'text'}
    onchange={(e) => onchange(e.currentTarget.value === '' && optional ? undefined : e.currentTarget.value)} />
{/if}

<style>
  .num { display: inline-flex; align-items: center; gap: 4px; }
  .num input { width: 78px; }
  .unit { font-size: 12px; opacity: 0.8; }
  .text { width: 130px; }
</style>
