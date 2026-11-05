<script>
  import { useSetup } from '../lib/useSetup.svelte.js';
  import { el, esc, txt } from '../lib/setup.js';
  import Seg from '../lib/Seg.svelte';
  import Panel from '../lib/Panel.svelte';

  const eco = useSetup('general', 3);
  const ecoEdit = (t) => eco.doc?.querySelector(t)?.getAttribute('display') === '3';
</script>

<Panel id="power-eco" title="Power & ECO">
    {#if eco.doc}
      {#if ecoEdit('Mode')}
        <div class="setting stack">
          <div class="label">ECO mode</div>
          <Seg value={txt(eco.doc, 'Mode')} disabled={eco.saving} onchange={(v) => eco.write(`<Mode>${v}</Mode>`)}
            options={[{ value: '1', label: 'On' }, { value: '2', label: 'Auto' }, { value: '3', label: 'Off' }]} />
        </div>
      {/if}
      {#if ecoEdit('PowerOnDefault')}
        <div class="setting stack">
          <div><div class="label">ECO at power-on</div></div>
          <Seg value={txt(eco.doc, 'PowerOnDefault')} disabled={eco.saving} onchange={(v) => eco.write(`<PowerOnDefault>${v}</PowerOnDefault>`)}
            options={[{ value: '3', label: 'Last' }, { value: '1', label: 'On' }, { value: '2', label: 'Auto' }, { value: '4', label: 'Off' }]} />
        </div>
      {/if}
      {#if ecoEdit('OnScreenDisplay')}
        <div class="setting stack">
          <div class="label">ECO meter on screen</div>
          <Seg value={txt(eco.doc, 'OnScreenDisplay')} disabled={eco.saving} onchange={(v) => eco.write(`<OnScreenDisplay>${v}</OnScreenDisplay>`)}
            options={[{ value: '1', label: 'Always' }, { value: '2', label: 'Auto' }, { value: '3', label: 'Off' }]} />
        </div>
      {/if}
      {#if ecoEdit('AutoStandby > MainZone')}
        <div class="setting stack">
          <div><div class="label">Auto standby — Main</div><div class="hint">After no signal & no operation</div></div>
          <Seg value={txt(eco.doc, 'AutoStandby > MainZone')} disabled={eco.saving}
            onchange={(v) => eco.write(`<AutoStandby><MainZone>${v}</MainZone></AutoStandby>`)}
            options={[{ value: '1', label: '15 min' }, { value: '2', label: '30 min' }, { value: '3', label: '60 min' }, { value: '4', label: 'Off' }]} />
        </div>
      {/if}
      {#if ecoEdit('AutoStandby > Zone2')}
        <div class="setting stack">
          <div class="label">Auto standby — Zone 2</div>
          <Seg value={txt(eco.doc, 'AutoStandby > Zone2')} disabled={eco.saving}
            onchange={(v) => eco.write(`<AutoStandby><Zone2>${v}</Zone2></AutoStandby>`)}
            options={[{ value: '1', label: '2 h' }, { value: '2', label: '4 h' }, { value: '3', label: '8 h' }, { value: '4', label: 'Off' }]} />
        </div>
      {/if}
    {/if}
</Panel>
