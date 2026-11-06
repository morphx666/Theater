<script>
  // Big circular volume knob: drag around the arc, scroll, or use the +/- buttons.
  import { avr, send, vol2 } from './avr.svelte.js';
  import { throttle } from './controls.svelte.js';
  import Icon from './Icon.svelte';

  // locked: the dial still shows the live volume, but ignores dragging, the scroll wheel and arrow keys
  // (the −/+ buttons and Mute keep working). Set from Home › Customize › "Lock dial".
  let { locked = false } = $props();

  let lockText = $state();
  let lockW = $state(46); // measured below; fallback estimate
  $effect(() => { if (locked && lockText) lockW = lockText.getComputedTextLength() || lockW; });
  const lockX = $derived(100 - (16 + 4 + lockW) / 2);

  const MIN = -80;
  const SWEEP = 270; // degrees
  const START = 135; // degrees, measured clockwise from +x axis

  const st = $derived(avr.state);
  const cap = $derived(avr.cap);
  const max = $derived(Math.min(18, st?.volumeMax ?? 18));
  // The receiver's maximum depends on the input signal and channel levels (manual p.69); never ask for more.
  const top = $derived(Math.min(cap, max));
  let local = $state(null);
  let dragging = $state(false);
  let holdUntil = 0;
  const value = $derived(local ?? st?.volume ?? MIN);
  const muted = $derived(!!st?.mute);
  const off = $derived(st?.zoneMain === false);

  const frac = (v) => (v - MIN) / (max - MIN);
  const angle = (f) => START + f * SWEEP;
  const pt = (a, r) => [100 + r * Math.cos((a * Math.PI) / 180), 100 + r * Math.sin((a * Math.PI) / 180)];
  function arc(f0, f1, r) {
    const [x0, y0] = pt(angle(f0), r);
    const [x1, y1] = pt(angle(f1), r);
    const large = (f1 - f0) * SWEEP > 180 ? 1 : 0;
    return `M${x0} ${y0} A${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
  }
  const capFrac = $derived(frac(Math.min(cap, max)));
  const [kx, ky] = $derived(pt(angle(frac(value)), 80));
  const [cx1, cy1] = $derived(pt(angle(capFrac), 70));
  const [cx2, cy2] = $derived(pt(angle(capFrac), 94));

  const sendVol = throttle((db) => send('MV' + vol2(db)), 130);

  function setDb(db) {
    db = Math.round(db * 2) / 2;
    db = Math.max(MIN, Math.min(top, db));
    local = db;
    holdUntil = Date.now() + 900;
    sendVol(db);
  }

  // Clear the optimistic value once the receiver catches up.
  $effect(() => {
    const v = st?.volume;
    if (local !== null && !dragging && (v === local || Date.now() > holdUntil)) local = null;
  });

  let svg = $state();
  function fromPointer(e) {
    const r = svg.getBoundingClientRect();
    const x = e.clientX - (r.left + r.width / 2);
    const y = e.clientY - (r.top + r.height / 2);
    let a = (Math.atan2(y, x) * 180) / Math.PI; // -180..180, clockwise from +x
    let rel = (a - START + 360) % 360; // 0..360 from start
    if (rel > SWEEP) rel = rel - SWEEP < (360 - SWEEP) / 2 ? SWEEP : 0; // snap in the dead zone
    const f = rel / SWEEP;
    const target = MIN + f * (max - MIN);
    // Avoid big jumps: limit to 6 dB per move event (prevents wrap-around accidents).
    const cur = local ?? st?.volume ?? MIN;
    setDb(Math.max(cur - 6, Math.min(cur + 6, target)));
  }
  // Volume only changes by dragging the knob itself. Clicking/tapping elsewhere on the ring does nothing,
  // so a stray tap near the end of the arc can never jump the volume up.
  function down(e) {
    if (off || locked) return;
    e.preventDefault();
    e.stopPropagation();
    dragging = true;
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
    window.addEventListener('pointercancel', up, { once: true });
  }
  function move(e) { if (dragging) fromPointer(e); }
  function up() {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    dragging = false;
    holdUntil = Date.now() + 900;
  }
  function wheel(e) {
    if (off || locked) return;
    e.preventDefault();
    step(e.deltaY < 0 ? 1 : -1);
  }
  function step(dir) {
    const s = avr.settings?.volumeStep ?? 0.5;
    setDb((local ?? st?.volume ?? MIN) + dir * s);
  }
  function key(e) {
    if (locked) return;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { e.preventDefault(); step(1); }
    if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
  }

  // Hold-to-repeat for the +/- buttons
  let repeat;
  function hold(dir) {
    step(dir);
    let delay = 350;
    const tick = () => { step(dir); delay = Math.max(90, delay * 0.75); repeat = setTimeout(tick, delay); };
    repeat = setTimeout(tick, delay);
  }
  const release = () => clearTimeout(repeat);
</script>

<div class="dial" class:muted class:off class:locked>
  <svg bind:this={svg} viewBox="0 0 200 200" role="slider" tabindex="0" aria-label="Master volume{locked ? ' (dial locked)' : ''}"
    aria-valuemin={MIN} aria-valuemax={top} aria-valuenow={value} aria-readonly={locked}
    onwheel={wheel} onkeydown={key}>
    <defs>
      <linearGradient id="vg" x1="0" y1="1" x2="1" y2="0">
        <stop offset="0" stop-color="var(--accent)" />
        <stop offset="1" stop-color="var(--accent-2)" />
      </linearGradient>
      <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="4" />
      </filter>
    </defs>
    <path d={arc(0, 1, 80)} class="track" />
    <path d={arc(capFrac, 1, 80)} class="over" />
    {#if frac(value) > 0.002}
      <path d={arc(0, frac(value), 80)} class="glow" filter="url(#glow)" />
      <path d={arc(0, frac(value), 80)} class="fill" />
    {/if}
    <line x1={cx1} y1={cy1} x2={cx2} y2={cy2} class="capmark" />
    <circle cx={kx} cy={ky} r="9" class="knob" />
    {#if !locked}<circle cx={kx} cy={ky} r="20" class="grab" class:active={dragging} onpointerdown={down} role="presentation" />{/if}
    <text x="100" y="98" class="num">{off ? 'OFF' : muted ? 'MUTE' : value.toFixed(1)}</text>
    <text x="100" y="122" class="unit">{off || muted ? (off ? 'standby' : value.toFixed(1) + ' dB') : 'dB'}</text>
    {#if locked}
      <!-- icon (16 wide) + 4 gap + text, centred as one unit using the text's measured width -->
      <g class="lockmark" transform="translate({lockX} 167)"><path d="M3 7h10v8H3z M5 7V5a3 3 0 0 1 6 0v2" /></g>
      <text bind:this={lockText} x={lockX + 20} y="179" class="cap start">dial locked</text>
    {:else}
      <text x="100" y="178" class="cap">limit {cap} dB</text>
    {/if}
  </svg>

  <div class="row controls">
    <button class="btn icon big" aria-label="Volume down" disabled={off}
      onpointerdown={() => hold(-1)} onpointerup={release} onpointerleave={release}><Icon name="minus" size={22} /></button>
    <button class="btn mute" class:on={muted} disabled={off} onclick={() => send(muted ? 'MUOFF' : 'MUON')}>
      <Icon name={muted ? 'mute' : 'vol'} /> {muted ? 'Muted' : 'Mute'}
    </button>
    <button class="btn icon big" aria-label="Volume up" disabled={off || value >= top}
      onpointerdown={() => hold(1)} onpointerup={release} onpointerleave={release}><Icon name="plus" size={22} /></button>
  </div>
</div>

<style>
  .dial { display: flex; flex-direction: column; align-items: center; gap: 6px; }
  svg { width: min(100%, 300px); touch-action: none; user-select: none; }
  .grab { fill: transparent; cursor: grab; }
  .grab.active { cursor: grabbing; }
  .off .grab { cursor: default; }
  .knob { pointer-events: none; }
  .locked .knob { fill: var(--muted); }
  .cap.start { text-anchor: start; }
  .lockmark path { fill: none; stroke: var(--muted); stroke-width: 1.4; stroke-linecap: round; stroke-linejoin: round; }
  .track { fill: none; stroke: var(--line); stroke-width: 12; stroke-linecap: round; }
  .over { fill: none; stroke: color-mix(in srgb, var(--bad) 30%, transparent); stroke-width: 12; stroke-linecap: round; }
  /* No transition on the arc: browsers can't interpolate an SVG arc (radius/flags), so the fill would bulge outside the ring. */
  .fill { fill: none; stroke: url(#vg); stroke-width: 12; stroke-linecap: round; }
  .glow { fill: none; stroke: var(--accent); stroke-width: 12; opacity: 0.45; stroke-linecap: round; }
  .knob { fill: #fff; filter: drop-shadow(0 1px 3px rgb(0 0 0 / 0.5)); }
  .capmark { stroke: var(--bad); stroke-width: 2.5; stroke-linecap: round; }
  .num { fill: var(--text); font-size: 40px; font-weight: 700; text-anchor: middle; font-variant-numeric: tabular-nums; letter-spacing: -1px; }
  .unit { fill: var(--muted); font-size: 13px; text-anchor: middle; }
  .cap { fill: var(--faint); font-size: 10px; text-anchor: middle; }
  .muted .fill, .muted .glow { stroke: var(--faint); opacity: 0.6; }
  .muted .num { fill: var(--bad); font-size: 32px; }
  .off .num { fill: var(--faint); }
  .controls { gap: 14px; }
  .big { width: 56px; height: 56px; border-radius: 50%; }
  .mute { min-width: 120px; border-radius: 99px; height: 48px; }
</style>
