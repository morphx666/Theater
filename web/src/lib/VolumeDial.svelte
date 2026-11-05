<script>
  // Big circular volume knob: drag around the arc, scroll, or use the +/- buttons.
  import { avr, send, vol2 } from './avr.svelte.js';
  import { throttle } from './controls.svelte.js';
  import Icon from './Icon.svelte';

  const MIN = -80;
  const SWEEP = 270; // degrees
  const START = 135; // degrees, measured clockwise from +x axis

  const st = $derived(avr.state);
  const cap = $derived(avr.cap);
  const max = $derived(Math.min(18, st?.volumeMax ?? 18));
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
    db = Math.max(MIN, Math.min(cap, db));
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
  function down(e) {
    if (off) return;
    dragging = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    fromPointer(e);
  }
  function move(e) { if (dragging) fromPointer(e); }
  function up() { dragging = false; holdUntil = Date.now() + 900; }
  function wheel(e) {
    if (off) return;
    e.preventDefault();
    step(e.deltaY < 0 ? 1 : -1);
  }
  function step(dir) {
    const s = avr.settings?.volumeStep ?? 0.5;
    setDb((local ?? st?.volume ?? MIN) + dir * s);
  }
  function key(e) {
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

<div class="dial" class:muted class:off>
  <svg bind:this={svg} viewBox="0 0 200 200" role="slider" tabindex="0" aria-label="Master volume"
    aria-valuemin={MIN} aria-valuemax={cap} aria-valuenow={value}
    onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up} onwheel={wheel} onkeydown={key}>
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
    <text x="100" y="98" class="num">{off ? 'OFF' : muted ? 'MUTE' : value.toFixed(1)}</text>
    <text x="100" y="122" class="unit">{off || muted ? (off ? 'standby' : value.toFixed(1) + ' dB') : 'dB'}</text>
    <text x="100" y="178" class="cap">limit {cap} dB</text>
  </svg>

  <div class="row controls">
    <button class="btn icon big" aria-label="Volume down" disabled={off}
      onpointerdown={() => hold(-1)} onpointerup={release} onpointerleave={release}><Icon name="minus" size={22} /></button>
    <button class="btn mute" class:on={muted} disabled={off} onclick={() => send(muted ? 'MUOFF' : 'MUON')}>
      <Icon name={muted ? 'mute' : 'vol'} /> {muted ? 'Muted' : 'Mute'}
    </button>
    <button class="btn icon big" aria-label="Volume up" disabled={off || value >= cap}
      onpointerdown={() => hold(1)} onpointerup={release} onpointerleave={release}><Icon name="plus" size={22} /></button>
  </div>
</div>

<style>
  .dial { display: flex; flex-direction: column; align-items: center; gap: 6px; }
  svg { width: min(100%, 300px); touch-action: none; cursor: grab; user-select: none; }
  svg:active { cursor: grabbing; }
  .track { fill: none; stroke: var(--line); stroke-width: 12; stroke-linecap: round; }
  .over { fill: none; stroke: color-mix(in srgb, var(--bad) 30%, transparent); stroke-width: 12; stroke-linecap: round; }
  .fill { fill: none; stroke: url(#vg); stroke-width: 12; stroke-linecap: round; transition: d 0.12s; }
  .glow { fill: none; stroke: var(--accent); stroke-width: 12; opacity: 0.45; stroke-linecap: round; }
  .knob { fill: #fff; filter: drop-shadow(0 1px 3px rgb(0 0 0 / 0.5)); }
  .capmark { stroke: var(--bad); stroke-width: 2.5; stroke-linecap: round; }
  .num { fill: var(--text); font-size: 40px; font-weight: 700; text-anchor: middle; font-variant-numeric: tabular-nums; letter-spacing: -1px; }
  .unit { fill: var(--muted); font-size: 13px; text-anchor: middle; }
  .cap { fill: var(--faint); font-size: 10px; text-anchor: middle; }
  .muted .fill, .muted .glow { stroke: var(--faint); opacity: 0.6; }
  .muted .num { fill: var(--bad); font-size: 32px; }
  .off .num { fill: var(--faint); }
  .off svg { cursor: default; }
  .controls { gap: 14px; }
  .big { width: 56px; height: 56px; border-radius: 50%; }
  .mute { min-width: 120px; border-radius: 99px; height: 48px; }
</style>
