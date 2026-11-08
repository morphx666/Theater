<script>
  // Compact master volume for the top bar: mute, −/+, and a small slider.
  // Follows the Volume panel's rules: only dragging the knob changes the volume (tapping the track does
  // nothing), and when the panel's dial is locked the knob, scroll wheel and arrow keys are locked here
  // too (−/+ and mute keep working, as on the panel).
  import { avr, send } from './avr.svelte.js';
  import { volume, MIN } from './volume.svelte.js';
  import Icon from './Icon.svelte';

  let { locked = false } = $props();

  const st = $derived(avr.state);
  const off = $derived(st?.zoneMain !== true);
  const muted = $derived(!!st?.mute);
  const value = $derived(volume.value);
  const frac = (db) => Math.max(0, Math.min(1, (db - MIN) / (volume.max - MIN)));
  const pos = $derived(frac(value) * 100);
  const capPos = $derived(frac(volume.top) * 100);

  // Dragging moves the volume at a fixed, gentle rate whatever the track's width (the full scale is
  // 98 dB on a short track), so the knob trails the finger a little and a fling can't jump the volume.
  const DB_PER_PX = 0.25;
  let start = null; // { x, db } while dragging the knob
  function down(e) {
    if (off || locked) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    start = { x: e.clientX, db: value };
    volume.dragging = true;
  }
  function move(e) {
    if (!start) return;
    volume.set(start.db + (e.clientX - start.x) * DB_PER_PX);
  }
  function up() {
    if (!start) return;
    start = null;
    volume.dragging = false;
  }
  function wheel(e) {
    if (off || locked) return;
    e.preventDefault();
    volume.step(e.deltaY < 0 ? 1 : -1);
  }
  function key(e) {
    if (off || locked) return;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { e.preventDefault(); volume.step(1); }
    if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { e.preventDefault(); volume.step(-1); }
  }
  const release = () => volume.release();
</script>

<div class="mini" class:muted class:off class:locked onwheel={wheel}>
  <button class="ib mute" class:on={muted} disabled={off} aria-pressed={muted} aria-label={muted ? 'Unmute' : 'Mute'}
    title={muted ? 'Unmute' : 'Mute'} onclick={() => send(muted ? 'MUOFF' : 'MUON')}><Icon name={muted ? 'mute' : 'vol'} size={17} /></button>
  <button class="ib" aria-label="Volume down" disabled={off}
    onpointerdown={() => volume.hold(-1)} onpointerup={release} onpointerleave={release} onpointercancel={release}><Icon name="minus" size={14} /></button>
  <div class="track">
    <div class="over" style="left: {capPos}%"></div>
    <div class="fill" style="width: {pos}%"></div>
    <div class="capmark" style="left: {capPos}%" title="Limit {volume.cap} dB"></div>
    <div class="knob" style="left: {pos}%" role="slider" tabindex={off || locked ? -1 : 0}
      aria-label="Master volume{locked ? ' (dial locked)' : ''}" aria-valuemin={MIN} aria-valuemax={volume.top} aria-valuenow={value}
      aria-readonly={locked} title={locked ? 'Dial locked (Home › Customize)' : ''}
      onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up} onkeydown={key}>
      {#if locked}<Icon name="lock" size={9} stroke={2.6} />{/if}
    </div>
  </div>
  <button class="ib" aria-label="Volume up" disabled={off || value >= volume.top}
    onpointerdown={() => volume.hold(1)} onpointerup={release} onpointerleave={release} onpointercancel={release}><Icon name="plus" size={14} /></button>
  <span class="val">{off ? 'Off' : muted ? 'Muted' : value.toFixed(1)}</span>
</div>

<style>
  .mini { flex: none; display: flex; align-items: center; gap: 4px; height: 44px; padding: 0 12px 0 4px; border-radius: 99px;
    background: var(--card); border: 1px solid var(--line); min-width: 0; }
  .ib { width: 32px; height: 32px; flex: none; border-radius: 50%; border: 0; background: none; color: var(--muted);
    display: grid; place-items: center; cursor: pointer; transition: color 0.15s, background 0.15s; }
  .ib:hover:not(:disabled) { color: var(--text); background: var(--card-2); }
  .ib:disabled { opacity: 0.35; cursor: default; }
  .mute.on { color: var(--bad); }

  .track { position: relative; flex: none; width: 140px; height: 6px; margin: 0 8px;
    border-radius: 99px; background: var(--line); }
  .fill { position: absolute; inset: 0 auto 0 0; border-radius: 99px; background: linear-gradient(90deg, var(--accent), var(--accent-2)); }
  .over { position: absolute; top: 0; bottom: 0; right: 0; border-radius: 0 99px 99px 0; background: color-mix(in srgb, var(--bad) 30%, transparent); }
  .capmark { position: absolute; top: -4px; bottom: -4px; width: 2px; margin-left: -1px; border-radius: 1px; background: var(--bad); }
  .knob { position: absolute; top: 50%; width: 16px; height: 16px; margin: -8px 0 0 -8px; border-radius: 50%; background: #fff;
    box-shadow: 0 1px 3px rgb(0 0 0 / 0.5); cursor: grab; touch-action: none; display: grid; place-items: center; color: var(--bg); }
  .knob::before { content: ''; position: absolute; inset: -12px; } /* bigger grab area for fingers */
  .knob:active { cursor: grabbing; }
  .locked .knob { background: var(--muted); cursor: not-allowed; }
  .off .knob { cursor: default; opacity: 0.5; }
  .muted .fill, .off .fill { background: var(--faint); opacity: 0.6; }

  .val { min-width: 42px; text-align: right; font-size: 13px; font-weight: 650; font-variant-numeric: tabular-nums; }
  .muted .val { color: var(--bad); }
  .off .val { color: var(--faint); }
</style>
