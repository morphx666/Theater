<script>
  // Range slider that updates locally while dragging and reports (throttled) changes.
  import { throttle, fill } from './controls.svelte.js';

  let { value, min, max, step = 1, onchange, format = (v) => v, disabled = false, label = '', center = false } = $props();

  let local = $state(null);
  let dragging = $state(false);
  const shown = $derived(dragging && local !== null ? local : value ?? min);
  const send = throttle((v) => onchange(v), 150);

  function input(e) {
    local = Number(e.currentTarget.value);
    dragging = true;
    send(local);
  }
  function commit() {
    if (local !== null) onchange(local);
    // keep showing the local value briefly until the receiver echoes back
    setTimeout(() => { dragging = false; local = null; }, 600);
  }
  // Fill from the middle for +/- controls
  const bg = $derived(
    center
      ? `linear-gradient(to right, var(--line) ${Math.min(50, ((shown - min) / (max - min)) * 100)}%, var(--accent) ${Math.min(50, ((shown - min) / (max - min)) * 100)}%, var(--accent) ${Math.max(50, ((shown - min) / (max - min)) * 100)}%, var(--line) ${Math.max(50, ((shown - min) / (max - min)) * 100)}%)`
      : null,
  );
</script>

<div class="slider">
  <div class="row between">
    {#if label}<span class="label">{label}</span>{/if}
    <span class="val mono">{format(shown)}</span>
  </div>
  <input type="range" {min} {max} {step} value={shown} {disabled} aria-label={label}
    style:--fill={fill(shown, min, max)} style:--track={bg}
    class:center oninput={input} onchange={commit} />
</div>

<style>
  .slider { width: 100%; }
  .label { font-weight: 550; }
  .val { color: var(--accent); font-weight: 600; font-size: 14px; }
  input.center::-webkit-slider-runnable-track { background: var(--track); }
  input.center::-moz-range-track { background: var(--track); }
  input.center::-moz-range-progress { background: transparent; }
</style>
