<script>
  // Full-screen dimmer shown after a while without input (settings: lib/idle.svelte.js, Setup › App & Info).
  // While dimmed it sits on top of everything, so the first tap, click, scroll or key press only wakes the
  // screen and never reaches a control the user can't see. Moving the mouse wakes it too.
  import { onMount } from 'svelte';
  import { idle, activity, wake } from './idle.svelte.js';

  let last = null; // last mouse position, to ignore synthetic or sub-pixel moves

  function moved(e) {
    const p = { x: e.screenX, y: e.screenY };
    const far = !last || Math.abs(p.x - last.x) + Math.abs(p.y - last.y) > 4;
    last = p;
    return far;
  }

  onMount(() => {
    const onPointerMove = (e) => {
      if (!moved(e)) return;
      if (idle.dimmed) { if (e.pointerType === 'mouse') wake(); } else activity();
    };
    const onKey = (e) => {
      if (!idle.dimmed) return activity();
      e.preventDefault();
      e.stopImmediatePropagation(); // e.g. "m" must not toggle mute while waking up
      wake();
    };
    const opts = { capture: true, passive: true };
    window.addEventListener('pointermove', onPointerMove, opts);
    window.addEventListener('pointerdown', activity, opts);
    window.addEventListener('wheel', activity, opts);
    window.addEventListener('keydown', onKey, { capture: true });
    wake();
    return () => {
      window.removeEventListener('pointermove', onPointerMove, opts);
      window.removeEventListener('pointerdown', activity, opts);
      window.removeEventListener('wheel', activity, opts);
      window.removeEventListener('keydown', onKey, { capture: true });
    };
  });

  // After a tap wakes the screen, keep catching input for a moment: the rest of that tap (pointerup, the
  // click some browsers send afterwards) must not land on the control underneath.
  let guard = $state(false);
  let guardTimer;

  function guardedWake() {
    if (!idle.dimmed) return;
    guard = true;
    clearTimeout(guardTimer);
    guardTimer = setTimeout(() => (guard = false), 500);
    wake();
  }

  function swallow(e) {
    e.preventDefault();
    e.stopPropagation();
    guardedWake();
  }
</script>

<div class="dimmer {idle.level}" class:on={idle.dimmed} class:preview={idle.preview && !idle.dimmed} class:guard aria-hidden="true"
  onpointerup={swallow} onclick={swallow} oncontextmenu={swallow} onwheel={guardedWake}></div>

<style>
  .dimmer {
    position: fixed; inset: 0; z-index: 1000; background: #000;
    opacity: 0; pointer-events: none; transition: opacity 0.25s ease-out;
  }
  .dimmer.guard { pointer-events: auto; }
  .dimmer.on { pointer-events: auto; cursor: none; transition: opacity 2s ease-in; }
  .dimmer.preview { transition: opacity 0.3s ease-out; } /* visual only: input still reaches the UI */
  .dimmer:is(.on, .preview).dim { opacity: 0.6; }
  .dimmer:is(.on, .preview).dark { opacity: 0.85; }
  .dimmer:is(.on, .preview).black { opacity: 1; }
  @media (prefers-reduced-motion: reduce) {
    .dimmer, .dimmer.on { transition: none; }
  }
</style>
