<script>
  import { avr, send, fmtDb, level2, CHANNELS } from '../lib/avr.svelte.js';
  import Icon from '../lib/Icon.svelte';
  import Slider from '../lib/Slider.svelte';
  import Panel from '../lib/Panel.svelte';

  const st = $derived(avr.state);

  // Positions on a 100 x 100 room (screen at the top, listener in the middle).
  const POS = {
    SW: [10, 13], SW2: [90, 13], FL: [25, 16], C: [50, 11], FR: [75, 16],
    FDL: [34, 28], FDR: [66, 28], FHL: [30, 30], FHR: [70, 30], TFL: [38, 38], TFR: [62, 38],
    TML: [36, 50], TMR: [64, 50], TRL: [38, 76], TRR: [62, 76],
    SDL: [8, 50], SDR: [92, 50], SL: [8, 63], SR: [92, 63], SBL: [33, 92], SBR: [67, 92], SB: [50, 93],
    BDL: [25, 96], BDR: [75, 96],
  };
  const chans = $derived(Object.keys(st.channels ?? {}).filter((c) => POS[c]));
  let sel = $state(null);
  const selected = $derived(sel && chans.includes(sel) ? sel : null);
  const isHeight = (c) => /^(FH|TF|TM|TR|FD|SD|BD)/.test(c);
  const total = (c) => (st.channels[c] ?? 0) + (st.setupLevels[c] ?? 0);

  const anyTrim = $derived(chans.some((c) => st.channels[c] !== 0));
</script>

<Panel id="channel-levels" title="Channel levels" needsPower>
    {#snippet actions()}
      <button class="btn small" disabled={!anyTrim} onclick={() => send('CVZRL')}><Icon name="reset" size={16} />Reset all</button>
    {/snippet}
    <p class="muted small" style="margin:-6px 0 12px">Each speaker shows its <strong>effective level</strong> = speaker setup level + listening trim.
      Tap one to trim it (same as the receiver's <em>Option → Channel Level Adjust</em>). Stored levels are edited in <em>Speaker setup → Levels</em>.</p>

    <svg class="room" viewBox="-4 -4 108 108" role="group" aria-label="Speaker layout">
      <rect x="0" y="0" width="100" height="100" rx="6" class="floor" />
      <rect x="28" y="-1.5" width="44" height="3" rx="1.5" class="screen" />
      <!-- listener -->
      <g transform="translate(50 60)">
        <circle r="7" class="seat" />
        <path d="M-3 -1 a3 3 0 1 1 6 0 M-5 5 q5 -5 10 0" class="person" />
      </g>
      {#each chans as c (c)}
        {@const [x, y] = POS[c]}
        {@const v = st.channels[c]}
        {@const eff = total(c)}
        <g class="spk" class:sel={selected === c} class:h={isHeight(c)} class:sub={c.startsWith('SW')}
          transform="translate({x} {y})" role="button" tabindex="0" aria-label="{CHANNELS[c] ?? c} {fmtDb(eff)} dB, trim {fmtDb(v)} dB"
          onclick={() => (sel = selected === c ? null : c)} onkeydown={(e) => e.key === 'Enter' && (sel = c)}>
          {#if v !== 0}<circle r={7 + Math.abs(v) * 0.6} class="halo" class:neg={v < 0} />{/if}
          {#if c.startsWith('SW')}<rect x="-6" y="-6" width="12" height="12" rx="3" class="body" />{:else}<circle r="6" class="body" />{/if}
          <text y="1.6" class="code">{c}</text>
          <text y="12.5" class="lv" class:trimmed={v !== 0}>{eff === 0 ? '0' : fmtDb(eff)}</text>
          {#if v !== 0}<text x="6.5" y="-5" class="trim" class:neg={v < 0}>{fmtDb(v)}</text>{/if}
        </g>
      {/each}
    </svg>

    {#if selected}
      <div class="adjust">
        <div class="row between">
          <strong>{CHANNELS[selected] ?? selected}</strong>
          <span class="faint small">setup {fmtDb(st.setupLevels[selected] ?? 0)} + trim {fmtDb(st.channels[selected])} = <strong class="eff">{fmtDb(total(selected))} dB</strong></span>
        </div>
        <div class="row">
          <button class="btn icon" aria-label="Down" onclick={() => send(`CV${selected} DOWN`)}><Icon name="minus" /></button>
          <div class="grow">
            <Slider label="Trim" min={-12} max={12} step={0.5} center value={st.channels[selected]} format={(v) => fmtDb(v) + ' dB'}
              onchange={(v) => send(`CV${selected} ${level2(v)}`)} />
          </div>
          <button class="btn icon" aria-label="Up" onclick={() => send(`CV${selected} UP`)}><Icon name="plus" /></button>
        </div>
      </div>
    {/if}
</Panel>

<style>
  .room { width: 100%; max-width: 520px; display: block; margin: 0 auto; touch-action: manipulation; }
  .floor { fill: var(--bg-2); stroke: var(--line); stroke-width: 0.6; }
  .screen { fill: var(--accent); opacity: 0.8; }
  .seat { fill: var(--card-2); stroke: var(--line); stroke-width: 0.6; }
  .person { fill: none; stroke: var(--muted); stroke-width: 0.9; stroke-linecap: round; }
  .spk { cursor: pointer; }
  .spk:focus { outline: none; }
  .spk:focus-visible .body { stroke: var(--accent); stroke-width: 1.4; }
  .spk .body { fill: var(--card); stroke: var(--muted); stroke-width: 0.8; transition: all 0.15s; }
  .spk.h .body { stroke-dasharray: 2 1.2; }
  .spk:hover .body { stroke: var(--accent); }
  .spk.sel .body { fill: var(--accent); stroke: var(--accent); }
  .spk.sel .code { fill: var(--accent-ink); }
  .halo { fill: color-mix(in srgb, var(--accent) 22%, transparent); }
  .halo.neg { fill: color-mix(in srgb, var(--blue) 22%, transparent); }
  .code { font-size: 3.4px; font-weight: 700; text-anchor: middle; fill: var(--text); pointer-events: none; }
  .lv.trimmed { fill: var(--accent); font-weight: 700; }
  .trim { font-size: 3px; font-weight: 700; fill: var(--accent); font-family: var(--mono); pointer-events: none; }
  .trim.neg { fill: var(--blue); }
  .eff { color: var(--text); }
  .lv { font-size: 3.6px; text-anchor: middle; fill: var(--muted); font-family: var(--mono); pointer-events: none; }
  .adjust { margin-top: 14px; display: grid; gap: 8px; padding: 14px; border-radius: 14px; background: var(--card-2); border: 1px solid var(--line); }
</style>
