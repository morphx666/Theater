<script>
  import { avr, send, fmtDb, level2 } from '../lib/avr.svelte.js';
  import Seg from '../lib/Seg.svelte';
  import Slider from '../lib/Slider.svelte';

  const st = $derived(avr.state);
  const ps = $derived(st.ps ?? {});
  const on = $derived(st.zoneMain === true);
  const has = (k) => ps[k] !== undefined;
  const lvl = (raw) => (raw == null ? 0 : (raw.length === 3 ? Number(raw) / 10 : Number(raw)) - 50);

  const dynEqOn = $derived(ps.DYNEQ === 'ON');
  const pureMode = $derived(/DIRECT/.test(st.surround ?? ''));
  const toneLocked = $derived(dynEqOn || pureMode);
</script>

{#if !on}
  <div class="card empty">The main zone is in standby — sound settings appear when it's on.</div>
{:else}
<div class="cols">
  <section class="card">
    <h2>Audyssey</h2>
    {#if has('MULTEQ')}
      <div class="setting stack">
        <div><div class="label">MultEQ room correction</div><div class="hint">Uses your Audyssey calibration</div></div>
        <Seg value={ps.MULTEQ} onchange={(v) => send('PSMULTEQ:' + v)} options={[
          { value: 'AUDYSSEY', label: 'Reference' }, { value: 'BYP.LR', label: 'L/R Bypass' },
          { value: 'FLAT', label: 'Flat' }, { value: 'OFF', label: 'Off' }]} />
      </div>
    {/if}
    {#if has('DYNEQ')}
      <div class="setting">
        <div><div class="label">Dynamic EQ</div><div class="hint">Keeps bass and surround full at low volume</div></div>
        <button class="switch" class:on={dynEqOn} aria-label="Dynamic EQ" onclick={() => send('PSDYNEQ ' + (dynEqOn ? 'OFF' : 'ON'))}></button>
      </div>
    {/if}
    {#if has('REFLEV')}
      <div class="setting stack">
        <div><div class="label">Reference level offset</div><div class="hint">Higher = less bass/surround boost (for loud mixes)</div></div>
        <Seg value={ps.REFLEV} disabled={!dynEqOn} onchange={(v) => send('PSREFLEV ' + v)} options={[
          { value: '0', label: '0 dB' }, { value: '5', label: '5 dB' }, { value: '10', label: '10 dB' }, { value: '15', label: '15 dB' }]} />
      </div>
    {/if}
    {#if has('DYNVOL')}
      <div class="setting stack">
        <div><div class="label">Dynamic Volume</div><div class="hint">Evens out loud ads and quiet dialog — great for late nights</div></div>
        <Seg value={ps.DYNVOL} onchange={(v) => send('PSDYNVOL ' + v)} options={[
          { value: 'OFF', label: 'Off' }, { value: 'LIT', label: 'Light' }, { value: 'MED', label: 'Medium' }, { value: 'HEV', label: 'Heavy' }]} />
      </div>
    {/if}
  </section>

  <section class="card">
    <h2>Dialog & bass</h2>
    {#if has('DEH')}
      <div class="setting stack">
        <div><div class="label">Dialog Enhancer</div><div class="hint">Makes voices clearer</div></div>
        <Seg value={ps.DEH} onchange={(v) => send('PSDEH ' + v)} options={[
          { value: 'OFF', label: 'Off' }, { value: 'LOW', label: 'Low' }, { value: 'MED', label: 'Medium' }, { value: 'HIGH', label: 'High' }]} />
      </div>
    {/if}
    {#if has('SWL')}
      <div class="setting stack">
        <Slider label="Subwoofer level" min={-12} max={12} step={0.5} center value={lvl(ps.SWL)}
          format={(v) => fmtDb(v) + ' dB'} disabled={ps.SWR === 'OFF'} onchange={(v) => send('PSSWL ' + level2(v))} />
      </div>
    {/if}
    {#if has('SWR')}
      <div class="setting">
        <div class="label">Subwoofer</div>
        <button class="switch" class:on={ps.SWR === 'ON'} aria-label="Subwoofer on/off" onclick={() => send('PSSWR ' + (ps.SWR === 'ON' ? 'OFF' : 'ON'))}></button>
      </div>
    {/if}
    {#if has('LFE')}
      <div class="setting stack">
        <Slider label="LFE level" min={-10} max={0} step={1} value={-Number(ps.LFE)} format={(v) => fmtDb(v) + ' dB'}
          onchange={(v) => send('PSLFE ' + String(-v).padStart(2, '0'))} />
      </div>
    {/if}
    {#if has('CINEMA EQ')}
      <div class="setting">
        <div><div class="label">Cinema EQ</div><div class="hint">Softens harsh treble in movie soundtracks</div></div>
        <button class="switch" class:on={ps['CINEMA EQ'] === 'ON'} aria-label="Cinema EQ" onclick={() => send('PSCINEMA EQ.' + (ps['CINEMA EQ'] === 'ON' ? 'OFF' : 'ON'))}></button>
      </div>
    {/if}
  </section>

  <section class="card">
    <h2>Tone</h2>
    {#if has('TONE CTRL')}
      <div class="setting">
        <div><div class="label">Tone control</div>
          <div class="hint">{toneLocked ? (pureMode ? 'Not available in Direct / Pure Direct' : 'Turn off Dynamic EQ to use tone controls') : 'Bass & treble adjustments'}</div></div>
        <button class="switch" class:on={ps['TONE CTRL'] === 'ON'} disabled={toneLocked} aria-label="Tone control"
          onclick={() => send('PSTONE CTRL ' + (ps['TONE CTRL'] === 'ON' ? 'OFF' : 'ON'))}></button>
      </div>
      <div class="setting stack">
        <Slider label="Bass" min={-6} max={6} step={1} center value={Number(ps.BAS ?? 50) - 50} format={(v) => fmtDb(v, 0) + ' dB'}
          disabled={toneLocked || ps['TONE CTRL'] !== 'ON'} onchange={(v) => send('PSBAS ' + (50 + v))} />
        <Slider label="Treble" min={-6} max={6} step={1} center value={Number(ps.TRE ?? 50) - 50} format={(v) => fmtDb(v, 0) + ' dB'}
          disabled={toneLocked || ps['TONE CTRL'] !== 'ON'} onchange={(v) => send('PSTRE ' + (50 + v))} />
      </div>
    {/if}
  </section>

  <section class="card">
    <h2>Processing</h2>
    {#if has('DRC')}
      <div class="setting stack">
        <div><div class="label">Dynamic compression</div><div class="hint">For Dolby / DTS content</div></div>
        <Seg value={ps.DRC} onchange={(v) => send('PSDRC ' + v)} options={[
          { value: 'AUTO', label: 'Auto' }, { value: 'LOW', label: 'Low' }, { value: 'MID', label: 'Mid' }, { value: 'HI', label: 'High' }, { value: 'OFF', label: 'Off' }]} />
      </div>
    {/if}
    {#if has('RSTR')}
      <div class="setting stack">
        <div><div class="label">Compressed audio restorer</div><div class="hint">Restores detail to Bluetooth / streaming audio</div></div>
        <Seg value={ps.RSTR} onchange={(v) => send('PSRSTR ' + v)} options={[
          { value: 'OFF', label: 'Off' }, { value: 'LOW', label: 'Low' }, { value: 'MED', label: 'Medium' }, { value: 'HI', label: 'High' }]} />
      </div>
    {/if}
    {#if has('LOM')}
      <div class="setting">
        <div><div class="label">Loudness management</div><div class="hint">Dolby dialog normalization</div></div>
        <button class="switch" class:on={ps.LOM === 'ON'} aria-label="Loudness management" onclick={() => send('PSLOM ' + (ps.LOM === 'ON' ? 'OFF' : 'ON'))}></button>
      </div>
    {/if}
    {#if has('NEURAL')}
      <div class="setting">
        <div><div class="label">DTS Neural:X</div><div class="hint">Upmix to height speakers for non-DTS content</div></div>
        <button class="switch" class:on={ps.NEURAL === 'ON'} aria-label="Neural X" onclick={() => send('PSNEURAL ' + (ps.NEURAL === 'ON' ? 'OFF' : 'ON'))}></button>
      </div>
    {/if}
    {#if has('CES')}
      <div class="setting">
        <div><div class="label">Center spread</div><div class="hint">Spreads the center channel to the fronts (Dolby Surround upmix)</div></div>
        <button class="switch" class:on={ps.CES === 'ON'} aria-label="Center spread" onclick={() => send('PSCES ' + (ps.CES === 'ON' ? 'OFF' : 'ON'))}></button>
      </div>
    {/if}
    {#if has('DEL')}
      <div class="setting stack">
        <Slider label="Audio delay (lip-sync)" min={0} max={200} step={1} value={Number(ps.DEL)} format={(v) => v + ' ms'}
          onchange={(v) => send('PSDEL ' + String(v).padStart(3, '0'))} />
      </div>
    {/if}
  </section>
</div>
{/if}

<style>
  .cols { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); align-items: start; }
</style>
