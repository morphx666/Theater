<script>
  import { avr, send, SOURCE_ORDER, SOURCE_ICONS, toast } from '../lib/avr.svelte.js';
  import Icon from '../lib/Icon.svelte';
  import VolumeDial from '../lib/VolumeDial.svelte';
  import NowPlaying from '../lib/NowPlaying.svelte';

  const st = $derived(avr.state);
  const on = $derived(st?.zoneMain === true);

  const inputs = $derived(
    SOURCE_ORDER.filter((c) => st.inputs[c] && !st.inputs[c].hidden).map((c) => ({ code: c, ...st.inputs[c] })),
  );
  const current = $derived(st.inputs[st.source]?.name ?? st.source);

  // Speaker layout like "5.1.2" from active channel levels
  const layout = $derived.by(() => {
    const ch = Object.keys(st.channels ?? {});
    const subs = ch.filter((c) => c.startsWith('SW')).length;
    const heights = ch.filter((c) => /^(FH|TF|TM|TR|FD|SD|BD|SH|TS)/.test(c)).length;
    const beds = ch.length - subs - heights;
    return ch.length ? `${beds}.${subs}${heights ? '.' + heights : ''}` : null;
  });

  const MODES = [
    { cmd: 'MSMOVIE', label: 'Movie', hint: 'Cycles movie modes' },
    { cmd: 'MSMUSIC', label: 'Music', hint: 'Cycles music modes' },
    { cmd: 'MSGAME', label: 'Game', hint: 'Cycles game modes' },
    { cmd: 'MSPURE DIRECT', label: 'Pure', match: /^PURE/ },
    { cmd: 'MSDIRECT', label: 'Direct', match: /^DIRECT/ },
    { cmd: 'MSSTEREO', label: 'Stereo', match: /^STEREO/ },
    { cmd: 'MSMCH STEREO', label: 'All Ch Stereo', match: /^MCH STEREO|MULTI CH/ },
    { cmd: 'MSAUTO', label: 'Auto', match: /^AUTO/ },
  ];

  function quick(n, e) {
    if (e.shiftKey || e.altKey) return saveQuick(n);
    send('MSQUICK' + n);
  }
  let pressTimer;
  function pressStart(n) {
    pressTimer = setTimeout(() => { pressTimer = null; saveQuick(n); }, 700);
  }
  function pressEnd(n) {
    if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; send('MSQUICK' + n); }
  }
  let confirmSave = $state(null);
  function saveQuick(n) { confirmSave = n; }
  function doSave() {
    send(`MSQUICK${confirmSave} MEMORY`);
    toast(`Saved current settings to Quick Select ${confirmSave}`);
    confirmSave = null;
  }
</script>

<div class="layout">
  <section class="left grid">
    <div class="card hero">
      <div class="info">
        <div class="src">{on ? current : 'Standby'}</div>
        {#if on}
          <div class="row wrap chips">
            {#if st.soundModeText}<span class="pill accent"><Icon name="wave" size={14} />{st.soundModeText}</span>{/if}
            {#if st.decoder}<span class="pill">{st.decoder}</span>{/if}
            {#if st.sampleRate}<span class="pill">{st.sampleRate}Hz</span>{/if}
            {#if layout}<span class="pill"><Icon name="speaker" size={14} />{layout}</span>{/if}
          </div>
        {:else}
          <p class="muted">Turn it on with the power button above.</p>
        {/if}
      </div>
      {#if on && st.source === 'NET'}
        <NowPlaying />
      {/if}
    </div>

    <div class="card">
      <VolumeDial />
    </div>
  </section>

  <section class="right grid">
    <div class="card">
      <h2>Input</h2>
      <div class="inputs">
        {#each inputs as i (i.code)}
          <button class="tile" class:on={st.source === i.code} disabled={!on} onclick={() => send('SI' + i.code)}>
            <Icon name={SOURCE_ICONS[i.code] ?? 'plug'} size={22} />
            <span>{i.name}</span>
          </button>
        {/each}
      </div>
    </div>

    <div class="card">
      <h2>Sound mode <span class="pill mono">{st.surround ?? '—'}</span></h2>
      <div class="modes">
        {#each MODES as m (m.cmd)}
          <button class="btn" class:on={m.match?.test(st.surround ?? '')} disabled={!on} title={m.hint ?? ''}
            onclick={() => send(m.cmd)}>{m.label}</button>
        {/each}
      </div>
    </div>

    <div class="card">
      <h2>Quick Select <span class="faint small" style="text-transform:none;letter-spacing:0">long-press to save</span></h2>
      <div class="quick">
        {#each [1, 2, 3, 4] as n}
          <button class="tile q" class:on={st.quick === n} disabled={!on}
            onpointerdown={() => pressStart(n)} onpointerup={() => pressEnd(n)}
            onpointerleave={() => pressTimer && (clearTimeout(pressTimer), (pressTimer = null))}
            onkeydown={(e) => e.key === 'Enter' && quick(n, e)}
            oncontextmenu={(e) => e.preventDefault()}>
            <span class="num">{n}</span>
            <span>{st.quickNames[n - 1] || `Quick ${n}`}</span>
          </button>
        {/each}
      </div>
    </div>
  </section>
</div>

{#if confirmSave}
  <div class="modal" role="dialog" aria-modal="true">
    <div class="card">
      <h3>Save Quick Select {confirmSave}?</h3>
      <p class="muted">This stores the current input, sound mode, volume and audio settings into Quick Select {confirmSave},
        replacing “{st.quickNames[confirmSave - 1] || 'empty'}”.</p>
      <div class="row" style="justify-content:flex-end">
        <button class="btn" onclick={() => (confirmSave = null)}>Cancel</button>
        <button class="btn primary" onclick={doSave}><Icon name="save" size={18} />Save</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .layout { display: grid; gap: 16px; }
  @media (min-width: 1000px) { .layout { grid-template-columns: minmax(340px, 420px) 1fr; align-items: start; } }

  .hero { display: flex; flex-direction: column; gap: 16px; background:
    radial-gradient(120% 140% at 0% 0%, color-mix(in srgb, var(--accent) 16%, transparent), transparent 60%), var(--card); }
  .src { font-size: 30px; font-weight: 750; letter-spacing: -0.02em; }
  .chips { margin-top: 10px; gap: 6px; }

  .inputs { display: grid; grid-template-columns: repeat(auto-fill, minmax(118px, 1fr)); gap: 10px; }
  .tile {
    border: 1px solid var(--line); background: var(--card-2); border-radius: 14px; padding: 14px 12px; cursor: pointer;
    display: flex; flex-direction: column; align-items: flex-start; gap: 10px; text-align: left; min-height: 84px;
    transition: transform 0.08s, border-color 0.15s, background 0.15s; color: var(--muted); user-select: none;
  }
  .tile span { color: var(--text); font-weight: 600; font-size: 14px; line-height: 1.2; }
  .tile:hover { border-color: color-mix(in srgb, var(--accent) 40%, var(--line)); }
  .tile:active { transform: scale(0.97); }
  .tile.on { background: color-mix(in srgb, var(--accent) 16%, var(--card-2)); border-color: var(--accent); color: var(--accent); }
  .tile:disabled { opacity: 0.45; cursor: not-allowed; }

  .modes { display: grid; grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: 8px; }
  .quick { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
  @media (max-width: 480px) {
    .quick { grid-template-columns: repeat(2, 1fr); }
    .inputs { grid-template-columns: repeat(3, 1fr); gap: 8px; }
    .tile { min-height: 74px; padding: 12px 10px; }
    .tile span { font-size: 13px; }
  }
  .q { min-height: 74px; -webkit-touch-callout: none; }
  .q .num { font-size: 12px; color: var(--accent); font-weight: 700; }

  .modal { position: fixed; inset: 0; background: rgb(0 0 0 / 0.55); display: grid; place-items: center; z-index: 30; padding: 20px; }
  .modal .card { max-width: 420px; display: grid; gap: 12px; }
  .modal p { margin: 0; }
</style>
