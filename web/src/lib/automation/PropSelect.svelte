<script>
  // Property menu, grouped like the catalog (Power, Volume, Input & signal, …), with search.
  import Pick from './Pick.svelte';
  let { catalog, value, filter = () => true, onchange, label = 'Property' } = $props();
  const options = $derived(catalog.filter(filter).map((p) => ({ value: p.id, label: p.label, group: p.group })));
</script>

<Pick {value} {options} {label} search {onchange} />
