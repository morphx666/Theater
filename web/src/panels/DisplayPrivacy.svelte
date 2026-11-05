<script>
  import { useSetup } from '../lib/useSetup.svelte.js';
  import { el, esc, txt } from '../lib/setup.js';
  import Seg from '../lib/Seg.svelte';
  import Panel from '../lib/Panel.svelte';

  const disp = useSetup('general', 10);
  const usage = useSetup('general', 14);
</script>

<Panel id="display-privacy" title="Display & privacy">
    {#if disp.doc}
      <div class="setting stack">
        <div class="label">Front display</div>
        <Seg value={txt(disp.doc, 'Dimmer')} disabled={disp.saving} onchange={(v) => disp.write(`<Dimmer>${v}</Dimmer>`)}
          options={[{ value: '1', label: 'Bright' }, { value: '2', label: 'Dim' }, { value: '3', label: 'Dark' }, { value: '4', label: 'Off' }]} />
      </div>
    {/if}
    {#if usage.doc?.querySelector('Send')?.getAttribute('display') === '3'}
      <div class="setting">
        <div><div class="label">Send usage data to Denon</div></div>
        <button class="switch" class:on={txt(usage.doc, 'Send') === '1'} aria-label="Send usage data"
          onclick={() => usage.write(`<Send>${txt(usage.doc, 'Send') === '1' ? 2 : 1}</Send>`)}></button>
      </div>
    {/if}
    <p class="faint small">Intentionally not exposed: firmware update, factory reset and setup lock. Network/IP settings are shown read-only on the Network tab.
      Use the receiver's own menu for those.</p>
</Panel>

<style>
  p { margin: 12px 0 0; }
</style>
