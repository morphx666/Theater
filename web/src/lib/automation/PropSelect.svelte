<script>
  // Property menu, grouped like the catalog (Power, Volume, Input & signal, …).
  let { catalog, value, filter = () => true, onchange, label = 'Property' } = $props();
  const groups = $derived.by(() => {
    const out = new Map();
    for (const p of catalog) if (filter(p)) (out.get(p.group) ?? out.set(p.group, []).get(p.group)).push(p);
    return [...out];
  });
</script>

<select class="f prop" aria-label={label} {value} onchange={(e) => onchange(e.currentTarget.value)}>
  {#each groups as [group, list] (group)}
    <optgroup label={group}>
      {#each list as p (p.id)}<option value={p.id}>{p.label}</option>{/each}
    </optgroup>
  {/each}
</select>
