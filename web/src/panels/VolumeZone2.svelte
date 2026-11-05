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
          <Seg value={txt(z2.doc, 'PowerOnVolume') === '99' ? 'last' : txt(z2.doc, 'PowerOnVolume') === '0' ? 'mute' : 'fixed'} disabled={z2.saving}
            options={[{ value: 'last', label: 'Last used' }, { value: 'mute', label: 'Muted' }, { value: 'fixed', label: 'Fixed' }]}
            onchange={(v) => z2.write(`<PowerOnVolume>${v === 'last' ? 99 : v === 'mute' ? 0 : 40}</PowerOnVolume>`)} />
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
