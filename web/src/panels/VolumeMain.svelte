<script>
  import { avr, toast } from '../lib/avr.svelte.js';
  import { useSetup } from '../lib/useSetup.svelte.js';
  import { getXml, txt } from '../lib/setup.js';
  import Seg from '../lib/Seg.svelte';
  import Slider from '../lib/Slider.svelte';
  import Icon from '../lib/Icon.svelte';
  import Panel from '../lib/Panel.svelte';

  const vol = useSetup('audio', 7);

  // ---- Main zone volume settings ----
  const limit = $derived(txt(vol.doc, 'Limit'));
  const pon = $derived(txt(vol.doc, 'PowerOnLevel'));
  const mute = $derived(txt(vol.doc, 'MuteLevel'));
  // Limit: 99 = Off, or 60-80 (-20 dB to 0 dB) in 1 dB steps (manual p.157).
  const limitOn = $derived(!!limit && limit !== '99');
  const ponMode = $derived(pon === '99' ? 'last' : pon === '0' ? 'mute' : 'fixed');
  const ponMax = $derived(Math.min(avr.cap, limit && limit !== '99' ? Number(limit) - 80 : 18));

</script>

<Panel id="volume-main" title="Volume — Main Zone">
    {#if vol.error}<p class="err">{vol.error}</p>{/if}
    {#if vol.doc}
      <div class="setting stack">
        <div><div class="label">Volume limit</div>
          <div class="hint">The receiver itself will never go louder than this — from any remote, app or the knob.</div></div>
        <Seg value={limitOn ? 'on' : 'off'} disabled={vol.saving}
          options={[{ value: 'off', label: 'Off' }, { value: 'on', label: 'Limit' }]}
          onchange={(v) => vol.write(`<Limit>${v === 'on' ? 70 : 99}</Limit>`)} />
        {#if limitOn}
          <Slider min={-20} max={0} step={1} value={Number(limit) - 80} format={(v) => v + ' dB'}
            onchange={(v) => vol.write(`<Limit>${v + 80}</Limit>`, { quiet: true })} />
        {/if}
        {#if limit === '99'}<div class="warn small"><Icon name="info" size={16} />No limit set — the knob can reach +18 dB. A limit of −10 dB is a sensible safety net.</div>{/if}
      </div>
      <div class="setting stack">
        <div><div class="label">Power-on volume</div><div class="hint">Volume when the receiver turns on</div></div>
        <Seg value={ponMode} disabled={vol.saving}
          options={[{ value: 'last', label: 'Last used' }, { value: 'mute', label: 'Muted' }, { value: 'fixed', label: 'Fixed' }]}
          onchange={(v) => vol.write(`<PowerOnLevel>${v === 'last' ? 99 : v === 'mute' ? 0 : 40}</PowerOnLevel>`)} />
        {#if ponMode === 'fixed'}
          <Slider min={-79} max={ponMax} step={1} value={Number(pon) - 80} format={(v) => v + ' dB'}
            onchange={(v) => vol.write(`<PowerOnLevel>${v + 80}</PowerOnLevel>`, { quiet: true })} />
        {/if}
      </div>
      <div class="setting stack">
        <div><div class="label">Mute level</div><div class="hint">How much “mute” turns it down</div></div>
        <Seg value={mute} disabled={vol.saving} onchange={(v) => vol.write(`<MuteLevel>${v}</MuteLevel>`)}
          options={[{ value: '1', label: 'Full' }, { value: '3', label: '−40 dB' }, { value: '2', label: '−20 dB' }]} />
      </div>
    {/if}
  </Panel>

<style>
  .err { color: var(--bad); }
  .warn { display: flex; gap: 8px; align-items: center; color: var(--accent); }
</style>
