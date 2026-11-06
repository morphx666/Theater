<script>
  import { avr, send } from '../lib/avr.svelte.js';
  import { useAvailability } from '../lib/availability.svelte.js';
  import { locked as ruleLocked, reason } from '../lib/rules.js';
  import Panel from '../lib/Panel.svelte';
  import Seg from '../lib/Seg.svelte';
  import Icon from '../lib/Icon.svelte';

  const ps = $derived(avr.state.ps ?? {});
  const has = (k) => ps[k] !== undefined;
  const dynEqOn = $derived(ps.DYNEQ === 'ON');
  const av = useAvailability();
  // Until Audyssey has been run, the receiver greys out all of these (they'd have nothing to apply).
  const uncalibrated = $derived(av.audysseyCalibrated === false);
  const locked = (k) => uncalibrated || ruleLocked(k) || (k === 'REFLEV' && !dynEqOn);
  const why = (k) => (uncalibrated || !locked(k) ? '' : reason(k));
</script>

<Panel id="audyssey" title="Audyssey" needsPower>
  {#if uncalibrated}
    <div class="notice">
      <Icon name="info" size={18} />
      <div>
        <strong>Audyssey hasn't been calibrated yet</strong>, so these settings are unavailable (greyed out on the receiver too).
        Run <em>Setup → Speakers → Audyssey Setup</em> on the receiver with the supplied microphone — it takes about 10–15 minutes
        and measures your room, then these unlock.
      </div>
    </div>
  {/if}
  <div class:dim={uncalibrated}>
    {#if has('MULTEQ')}
      <div class="setting stack">
        <div><div class="label">MultEQ room correction</div><div class="hint">{why('MULTEQ') || 'Reference recommended; Flat for small rooms'}</div></div>
        <Seg value={ps.MULTEQ} disabled={locked('MULTEQ')} onchange={(v) => send('PSMULTEQ:' + v)} options={[
          { value: 'AUDYSSEY', label: 'Reference' }, { value: 'BYP.LR', label: 'L/R Bypass' },
          { value: 'FLAT', label: 'Flat' }, { value: 'OFF', label: 'Off' }]} />
      </div>
    {/if}
    {#if has('DYNEQ')}
      <div class="setting">
        <div><div class="label">Dynamic EQ</div><div class="hint">{why('DYNEQ') || 'Fuller sound at low volume; disables Tone'}</div></div>
        <button class="switch" class:on={dynEqOn} disabled={locked('DYNEQ')} aria-label="Dynamic EQ" onclick={() => send('PSDYNEQ ' + (dynEqOn ? 'OFF' : 'ON'))}></button>
      </div>
    {/if}
    {#if has('REFLEV')}
      <div class="setting stack">
        <div><div class="label">Reference level offset</div><div class="hint">{why('REFLEV') || 'Movies 0 · Classical 5 · Jazz/TV 10 · Pop/rock 15'}</div></div>
        <Seg value={ps.REFLEV} disabled={locked('REFLEV')} onchange={(v) => send('PSREFLEV ' + v)} options={[
          { value: '0', label: '0 dB' }, { value: '5', label: '5 dB' }, { value: '10', label: '10 dB' }, { value: '15', label: '15 dB' }]} />
      </div>
    {/if}
    {#if has('DYNVOL')}
      <div class="setting stack">
        <div><div class="label">Dynamic Volume</div><div class="hint">{why('DYNVOL') || 'Evens out loud and quiet parts'}</div></div>
        <Seg value={ps.DYNVOL} disabled={locked('DYNVOL')} onchange={(v) => send('PSDYNVOL ' + v)} options={[
          { value: 'OFF', label: 'Off' }, { value: 'LIT', label: 'Light' }, { value: 'MED', label: 'Medium' }, { value: 'HEV', label: 'Heavy' }]} />
      </div>
    {/if}
  </div>
</Panel>

<style>
  .notice {
    display: flex; gap: 10px; align-items: flex-start; padding: 12px 14px; margin-bottom: 8px; border-radius: 12px;
    background: color-mix(in srgb, var(--accent) 10%, var(--card-2)); border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--line));
    font-size: 13px; line-height: 1.45; color: var(--text);
  }
  .notice :global(svg) { color: var(--accent); flex: none; margin-top: 1px; }
  .dim { opacity: 0.55; }
</style>
