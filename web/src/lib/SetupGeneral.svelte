<script>
  import { useSetup } from './useSetup.svelte.js';
  import { el, esc, txt } from './setup.js';
  import Seg from './Seg.svelte';

  const name = useSetup('globals', 3);
  const eco = useSetup('general', 3);
  const zones = useSetup('general', 6);
  const qs = useSetup('general', 7);
  const disp = useSetup('general', 10);
  const usage = useSetup('general', 14);

  const ascii = (s, n) => s.replace(/[^\x20-\x7E]/g, '').slice(0, n);
  const ecoEdit = (t) => eco.doc?.querySelector(t)?.getAttribute('display') === '3';
  const zoneList = $derived([...(zones.doc?.querySelectorAll('Zone') ?? [])].map((z) => ({ idx: z.getAttribute('index'), name: txt(z, 'Rename') })));
  const qsList = $derived([...(qs.doc?.querySelectorAll('Item') ?? [])].map((i) => ({ idx: i.getAttribute('index'), name: txt(i, 'Name') })));
</script>

<div class="cols">
  <section class="card">
    <h2>Names</h2>
    {#if name.doc}
      <div class="setting stack">
        <div><div class="label">Receiver name</div><div class="hint">Shown in HEOS, AirPlay and Spotify Connect</div></div>
        <input type="text" maxlength="63" value={name.doc.textContent.trim()}
          onchange={(e) => e.currentTarget.value.trim() && name.write(el('FriendlyName', esc(ascii(e.currentTarget.value.trim(), 63))))} />
      </div>
    {/if}
    {#each zoneList as z (z.idx)}
      <div class="setting stack">
        <div class="label">Zone {z.idx === '1' ? 'Main' : z.idx} name</div>
        <input type="text" maxlength="10" value={z.name}
          onchange={(e) => zones.write(`<List>${el('Zone', esc(ascii(e.currentTarget.value, 10) || ' '), { index: z.idx })}</List>`)} />
      </div>
    {/each}
    {#each qsList as q (q.idx)}
      <div class="setting stack">
        <div class="label">Quick Select {Number(q.idx) + 1} name</div>
        <input type="text" maxlength="16" value={q.name}
          onchange={(e) => qs.write(`<List>${el('Item', esc(ascii(e.currentTarget.value, 16) || ' '), { index: q.idx })}</List>`)} />
      </div>
    {/each}
  </section>

  <section class="card">
    <h2>Power & ECO</h2>
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
  </section>

  <section class="card">
    <h2>Display & privacy</h2>
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
    <p class="faint small">Intentionally not exposed: firmware update, factory reset, setup lock and network/IP settings.
      Use the receiver's own menu for those.</p>
  </section>
</div>

<style>
  .cols { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); align-items: start; }
  p { margin: 12px 0 0; }
</style>
