<script>
  import { useSetup } from '../lib/useSetup.svelte.js';
  import { txt, shown, editable } from '../lib/setup.js';
  import Seg from '../lib/Seg.svelte';
  import Panel from '../lib/Panel.svelte';

  const eco = useSetup('general', 3);
  // display 1 = hidden, 2 = shown but fixed by the receiver right now, 3 = editable
  const ecoShown = (t) => shown(eco.doc?.querySelector(t));
  const locked = (t) => eco.saving || !editable(eco.doc?.querySelector(t));
</script>

<Panel id="power-eco" title="Power & ECO">
    {#if eco.doc}
      {#if ecoShown('Mode')}
        <div class="setting stack">
          <div class="label">ECO mode</div>
          <Seg value={txt(eco.doc, 'Mode')} disabled={locked('Mode')} onchange={(v) => eco.write(`<Mode>${v}</Mode>`)}
            options={[{ value: '1', label: 'On' }, { value: '2', label: 'Auto' }, { value: '3', label: 'Off' }]} />
        </div>
      {/if}
      {#if ecoShown('PowerOnDefault')}
        <div class="setting stack">
          <div><div class="label">ECO at power-on</div></div>
          <Seg value={txt(eco.doc, 'PowerOnDefault')} disabled={locked('PowerOnDefault')} onchange={(v) => eco.write(`<PowerOnDefault>${v}</PowerOnDefault>`)}
            options={[{ value: '3', label: 'Last' }, { value: '1', label: 'On' }, { value: '2', label: 'Auto' }, { value: '4', label: 'Off' }]} />
        </div>
      {/if}
      {#if ecoShown('OnScreenDisplay')}
        <div class="setting stack">
          <div class="label">ECO meter on screen</div>
          <Seg value={txt(eco.doc, 'OnScreenDisplay')} disabled={locked('OnScreenDisplay')} onchange={(v) => eco.write(`<OnScreenDisplay>${v}</OnScreenDisplay>`)}
            options={[{ value: '1', label: 'Always' }, { value: '2', label: 'Auto' }, { value: '3', label: 'Off' }]} />
        </div>
      {/if}
      {#if ecoShown('AutoStandby > MainZone')}
        <div class="setting stack">
          <div><div class="label">Auto standby — Main</div><div class="hint">After no signal & no operation</div></div>
          <Seg value={txt(eco.doc, 'AutoStandby > MainZone')} disabled={locked('AutoStandby > MainZone')}
            onchange={(v) => eco.write(`<AutoStandby><MainZone>${v}</MainZone></AutoStandby>`)}
            options={[{ value: '1', label: '15 min' }, { value: '2', label: '30 min' }, { value: '3', label: '60 min' }, { value: '4', label: 'Off' }]} />
        </div>
      {/if}
      {#if ecoShown('AutoStandby > Zone2')}
        <div class="setting stack">
          <div class="label">Auto standby — Zone 2</div>
          <Seg value={txt(eco.doc, 'AutoStandby > Zone2')} disabled={locked('AutoStandby > Zone2')}
            onchange={(v) => eco.write(`<AutoStandby><Zone2>${v}</Zone2></AutoStandby>`)}
            options={[{ value: '1', label: '2 h' }, { value: '2', label: '4 h' }, { value: '3', label: '8 h' }, { value: '4', label: 'Off' }]} />
        </div>
      {/if}
    {/if}
</Panel>
