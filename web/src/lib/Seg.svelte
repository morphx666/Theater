<script>
  // Segmented control. options: [{ value, label }]
  // repeat: also call onchange when the selected option is clicked again (e.g. to preview it).
  let { options, value, onchange, disabled = false, accent = false, repeat = false } = $props();
</script>

<div class="seg" role="radiogroup">
  {#each options as o (o.value)}
    <button type="button" role="radio" aria-checked={value === o.value} class:on={value === o.value} class:accent
      {disabled} onclick={() => (repeat || value !== o.value) && onchange(o.value)}>{o.label}</button>
  {/each}
</div>
