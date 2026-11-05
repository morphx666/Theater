<script>
  // Analog-style tuner dial: a fixed red needle over a scale (MHz on top, kHz below) that scrolls to the
  // current frequency and fades out at the edges. Drag the scale to tune; tap it to type a frequency.
  //   freq: receiver's 6-digit frequency ("010570" = 105.70 MHz, "105000" = 1050 kHz); band: 'FM' | 'AM'
  //   ontune(raw6, band): called with a valid, snapped frequency
  let { freq, band, disabled = false, ontune } = $props();

  // North American bands: FM 87.5-107.9 MHz on odd tenths (0.2 MHz steps), AM 530-1710 kHz in 10 kHz steps.
  const FM = { min: 87.5, max: 107.9, step: 0.2, end: 108 };
  const AM = { min: 530, max: 1710, step: 10 };
  const PX = 72; // pixels per MHz on the FM scale
  const SPAN = (FM.end - FM.min) * PX; // both scales share this length, like a real dial
  const PAD = 420; // blank scale beyond each end so the ends can reach the needle
  const W = SPAN + PAD * 2;
  const H = 140;
  const xFM = (mhz) => PAD + (mhz - FM.min) * PX;
  const xAM = (khz) => PAD + ((khz - AM.min) / (AM.max - AM.min)) * SPAN;

  const snapFM = (v) => Math.min(FM.max, Math.max(FM.min, FM.min + Math.round((v - FM.min) / FM.step) * FM.step));
  const snapAM = (v) => Math.min(AM.max, Math.max(AM.min, Math.round(v / AM.step) * AM.step));
  const raw6 = (v, b) => String(Math.round(v * 100)).padStart(6, '0'); // MHz*100 or kHz*100
  const label = (v, b) => (b === 'AM' ? `${Math.round(v)}` : v.toFixed(1));

  // Current value in band units (MHz or kHz)
  const value = $derived.by(() => {
    const n = Number(freq);
    if (!freq || !Number.isFinite(n)) return null;
    return n / 100;
  });
  let preview = $state(null); // { v, am }: value just requested, shown until the receiver confirms
  const isAM = $derived(preview ? preview.am : band === 'AM' || (value != null && value >= 500));

  // Ticks (static)
  const fmMinor = [], fmMid = [], fmMajor = [];
  for (let i = 0; i <= Math.round((FM.end - FM.min) / 0.2); i++) fmMinor.push(xFM(FM.min + i * 0.2));
  for (let m = 88; m <= 108; m++) (m % 2 ? fmMid : fmMajor).push(m);
  const amMinor = [], amMajor = [];
  for (let k = 550; k <= 1700; k += 50) (k % 200 === 0 ? amMajor : amMinor).push(k);

  // ---- position, drag, preview ----
  let width = $state(320);
  let dragX = $state(null); // pointer x while dragging
  let dragFrom = 0; // pointer x at drag start
  let dragBase = 0; // scale x at drag start
  let previewTimer;
  let moved = false;

  const shownValue = $derived(dragX != null ? dragValue() : preview?.v ?? value);
  const scaleX = (v) => (v == null ? xFM(98) : isAM ? xAM(v) : xFM(v));
  // Offset of the scale so the shown value sits under the needle
  const offset = $derived(width / 2 - (dragX != null ? dragBase - (dragX - dragFrom) : scaleX(shownValue)));

  function dragValue() {
    const x = dragBase - (dragX - dragFrom);
    if (isAM) return snapAM(AM.min + ((x - PAD) / SPAN) * (AM.max - AM.min));
    return snapFM(FM.min + (x - PAD) / PX);
  }

  function setPreview(v, am) {
    preview = { v, am };
    clearTimeout(previewTimer);
    previewTimer = setTimeout(() => (preview = null), 4000); // give up if the receiver doesn't follow
  }
  $effect(() => { if (preview && value != null && Math.abs(value - preview.v) < 0.001) { preview = null; clearTimeout(previewTimer); } });

  function tune(v, b) {
    setPreview(v, b === 'AM');
    ontune?.(raw6(v, b), b);
  }

  function down(e) {
    if (disabled || editing || e.button > 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragFrom = e.clientX;
    dragBase = scaleX(shownValue);
    dragX = e.clientX;
    moved = false;
  }
  function move(e) {
    if (dragX == null) return;
    if (Math.abs(e.clientX - dragFrom) > 4) moved = true;
    dragX = e.clientX;
  }
  function up() {
    if (dragX == null) return;
    const v = dragValue();
    dragX = null;
    if (!moved) { startEdit(); return; } // a tap: type a frequency
    if (value == null || Math.abs(v - value) > 0.001) tune(v, isAM ? 'AM' : 'FM');
  }

  // ---- typing ----
  let editing = $state(false);
  let draft = $state('');
  let error = $state('');
  function startEdit() {
    if (disabled) return;
    draft = shownValue != null ? label(shownValue, isAM ? 'AM' : 'FM') : '';
    error = '';
    editing = true;
  }
  function focusSelect(el) { requestAnimationFrame(() => { el.focus(); el.select(); }); }
  function commit() {
    const v = Number(draft.replace(',', '.').trim());
    if (!draft.trim() || !Number.isFinite(v)) { error = 'Type a frequency, e.g. 105.7 or 1050'; return; }
    // Small numbers are MHz (FM), big ones kHz (AM)
    if (v >= FM.min - 0.05 && v <= FM.max + 0.05) {
      const s = snapFM(v);
      editing = false;
      tune(s, 'FM');
    } else if (v >= AM.min && v <= AM.max) {
      const s = snapAM(v);
      editing = false;
      tune(s, 'AM');
    } else {
      error = `FM ${FM.min}–${FM.max} MHz or AM ${AM.min}–${AM.max} kHz`;
    }
  }
  function keyEdit(e) {
    e.stopPropagation(); // keys typed here must not reach the dial (Enter would reopen the editor) or the page shortcuts
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    if (e.key === 'Escape') { e.preventDefault(); editing = false; }
  }
  function keyDial(e) {
    if (disabled || editing) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startEdit(); return; }
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0;
    if (!dir || shownValue == null) return;
    e.preventDefault();
    const b = isAM ? 'AM' : 'FM';
    tune(b === 'AM' ? snapAM(shownValue + dir * AM.step) : snapFM(shownValue + dir * FM.step), b);
  }
</script>

<div class="dial" class:disabled class:dragging={dragX != null} bind:clientWidth={width}
  role="slider" tabindex={disabled ? -1 : 0} aria-label="Tuner frequency"
  aria-valuetext={shownValue != null ? `${label(shownValue, isAM ? 'AM' : 'FM')} ${isAM ? 'kHz' : 'MHz'}` : 'unknown'}
  aria-valuenow={shownValue ?? undefined} aria-disabled={disabled}
  onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={() => (dragX = null)} onkeydown={keyDial}>

  <div class="scale">
    <svg width={W} height={H} viewBox="0 0 {W} {H}" style="transform: translateX({offset}px)" aria-hidden="true">
      <!-- decorative tick rows (top and bottom), like the printed glass on old radios -->
      {#each fmMinor as x}<rect class="deco" x={x - 1.5} y="30" width="3" height="11" rx="1" />{/each}
      {#each fmMinor as x}<rect class="deco" x={x - 1.5} y={H - 13} width="3" height="11" rx="1" />{/each}

      <g class="band fm" class:active={!isAM}>
        <rect x={xFM(FM.min) - 20} y="86" width={SPAN + 40} height="5" rx="2.5" />
        {#each fmMid as m}<rect x={xFM(m) - 2.5} y="70" width="5" height="18" rx="1" />{/each}
        {#each fmMajor as m}
          <rect x={xFM(m) - 3} y="62" width="6" height="26" rx="1" />
          <text x={xFM(m)} y="56" text-anchor="middle">{m}</text>
        {/each}
      </g>
      <g class="band am" class:active={isAM}>
        {#each amMinor as k}<rect x={xAM(k) - 2.5} y="89" width="5" height="13" rx="1" />{/each}
        {#each amMajor as k}
          <rect x={xAM(k) - 3} y="89" width="6" height="22" rx="1" />
          <text x={xAM(k)} y={H - 18} text-anchor="middle" class="small">{k}</text>
        {/each}
      </g>
    </svg>
  </div>

  <span class="unit mhz" class:active={!isAM}>MHz</span>
  <span class="unit khz" class:active={isAM}>kHz</span>
  <div class="needle"></div>

  <!-- readout over the needle; becomes an input when you tap the dial -->
  <div class="readout">
    {#if editing}
      <!-- svelte-ignore a11y_autofocus -->
      <input class="entry" bind:value={draft} use:focusSelect onkeydown={keyEdit} onblur={() => (editing = false)}
        inputmode="decimal" aria-label="Frequency (MHz or kHz)" size="6" onpointerdown={(e) => e.stopPropagation()} />
    {:else}
      <span class="val">{shownValue != null ? label(shownValue, isAM ? 'AM' : 'FM') : '—'}</span>
    {/if}
  </div>
</div>
{#if editing && error}<div class="err">{error}</div>{/if}

<style>
  .dial {
    --glow: #3dff8f;
    --phosphor: #2ee87a;
    position: relative; height: 140px; overflow: hidden; border-radius: 12px; cursor: grab; touch-action: pan-y;
    background: radial-gradient(120% 90% at 50% 50%, #0b1a10 0%, #050a07 70%), #040805;
    box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.06), inset 0 10px 30px rgb(0 0 0 / 0.6);
    user-select: none; -webkit-user-select: none; outline: none;
  }
  .dial:focus-visible { box-shadow: inset 0 0 0 2px var(--accent), inset 0 10px 30px rgb(0 0 0 / 0.6); }
  .dial.dragging { cursor: grabbing; }
  .dial.disabled { cursor: default; filter: saturate(0.25) brightness(0.7); }

  /* the scale fades out toward the panel edges */
  .scale {
    position: absolute; inset: 0;
    -webkit-mask-image: linear-gradient(to right, transparent 0%, #000 22%, #000 78%, transparent 100%);
    mask-image: linear-gradient(to right, transparent 0%, #000 22%, #000 78%, transparent 100%);
  }
  svg { display: block; will-change: transform; transition: transform 0.55s cubic-bezier(0.22, 0.8, 0.25, 1);
    filter: drop-shadow(0 0 3px rgb(61 255 143 / 0.45)); }
  .dragging svg { transition: none; }
  @media (prefers-reduced-motion: reduce) { svg { transition: none; } }

  .deco { fill: var(--phosphor); opacity: 0.35; }
  .band { fill: var(--phosphor); opacity: 0.3; transition: opacity 0.3s; }
  .band.active { opacity: 1; }
  text { font: 700 26px/1 var(--font); letter-spacing: -0.5px; }
  text.small { font-size: 21px; }

  .unit { position: absolute; right: 12px; font: 700 15px/1 var(--font); color: rgb(46 232 122 / 0.3); pointer-events: none;
    text-shadow: 0 0 3px #040805, 0 0 6px #040805, 0 0 10px #040805; } /* dark halo keeps it readable over the scale */
  .unit.active { color: rgb(46 232 122 / 0.9); text-shadow: 0 0 3px #040805, 0 0 6px #040805, 0 0 10px #040805, 0 0 6px rgb(61 255 143 / 0.5); }
  .mhz { top: 40px; }
  .khz { bottom: 34px; }

  .needle { position: absolute; top: 0; bottom: 0; left: 50%; width: 3px; margin-left: -1.5px; pointer-events: none;
    background: #ff2b2b; box-shadow: 0 0 8px rgb(255 43 43 / 0.8), 0 0 2px #ff6b6b; }

  .readout { position: absolute; top: 5px; left: 50%; transform: translateX(-50%); z-index: 1; }
  .val, .entry {
    display: inline-block; min-width: 5.2ch; padding: 1px 8px; border-radius: 7px; text-align: center;
    font: 700 17px/1.3 var(--mono); color: var(--glow); background: rgb(4 8 5 / 0.92);
    border: 1px solid rgb(61 255 143 / 0.35); text-shadow: 0 0 6px rgb(61 255 143 / 0.6);
  }
  .entry { width: 7ch; outline: none; border-color: var(--glow); caret-color: var(--glow); box-shadow: 0 0 10px rgb(61 255 143 / 0.35); }
  .err { margin-top: 6px; font-size: 12.5px; color: var(--bad); text-align: center; }
</style>
