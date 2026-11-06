<script>
  import { avr, toast } from '../lib/avr.svelte.js';
  import { useSetup } from '../lib/useSetup.svelte.js';
  import { getXml, txt } from '../lib/setup.js';
  import Seg from '../lib/Seg.svelte';
  import Slider from '../lib/Slider.svelte';
  import Icon from '../lib/Icon.svelte';
  import Panel from '../lib/Panel.svelte';

  const z2 = useSetup('general', 4);

  // ---- Zone 2 ----
  const z2node = (t) => z2.doc?.querySelector(t);
  const z2edit = (t) => z2node(t)?.getAttribute('display') === '3';

  // Power-on volume: 99 = last used, 0 = muted, 1-98 = fixed (value - 80 dB). A fixed level may not exceed
  // Zone 2's own Volume Limit (1 Off, 2 -20, 3 -10, 4 0 dB) or the app's cap.
  const Z2_LIMIT_DB = { 1: 18, 2: -20, 3: -10, 4: 0 };
  const pon = $derived(txt(z2.doc, 'PowerOnVolume'));
  const ponMode = $derived(pon === '99' ? 'last' : pon === '0' ? 'mute' : 'fixed');
  const ponMax = $derived(Math.min(avr.cap, Z2_LIMIT_DB[txt(z2.doc, 'VolumeLimit')] ?? 18));
  const setPon = (mode) => z2.write(`<PowerOnVolume>${mode === 'last' ? 99 : mode === 'mute' ? 0 : Math.min(-40, ponMax) + 80}</PowerOnVolume>`);

</script>

<Panel id="volume-zone2" title="Volume — Zone 2">
    {#if z2.error}<p class="err">{z2.error}</p>{/if}
    {#if z2.doc}
      {#if z2edit('VolumeLimit')}
        <div class="setting stack">
          <div class="label">Volume limit</div>
          <Seg value={txt(z2.doc, 'VolumeLimit')} disabled={z2.saving} onchange={(v) => z2.write(`<VolumeLimit>${v}</VolumeLimit>`)}
            options={[{ value: '1', label: 'Off' }, { value: '2', label: '−20 dB' }, { value: '3', label: '−10 dB' }, { value: '4', label: '0 dB' }]} />
        </div>
      {/if}
      {#if z2edit('PowerOnVolume')}
        <div class="setting stack">
          <div class="label">Power-on volume</div>
          <Seg value={ponMode} disabled={z2.saving}
            options={[{ value: 'last', label: 'Last used' }, { value: 'mute', label: 'Muted' }, { value: 'fixed', label: 'Fixed' }]}
            onchange={setPon} />
          {#if ponMode === 'fixed'}
            <Slider min={-79} max={ponMax} step={1} value={Math.min(Number(pon) - 80, ponMax)} format={(v) => v + ' dB'}
              onchange={(v) => z2.write(`<PowerOnVolume>${v + 80}</PowerOnVolume>`, { quiet: true })} />
          {/if}
        </div>
      {/if}
      {#if z2edit('VolumeLevel')}
        <div class="setting">
          <div><div class="label">Variable volume</div><div class="hint">Off = fixed line-level output (for an external amp)</div></div>
          <span class="pill">{txt(z2.doc, 'VolumeLevel') === '99' ? 'Variable' : 'Fixed ' + (Number(txt(z2.doc, 'VolumeLevel')) - 80) + ' dB'}</span>
        </div>
      {/if}
    {/if}
  </Panel>
