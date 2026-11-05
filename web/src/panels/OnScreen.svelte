<script>
  import { useSetup } from '../lib/useSetup.svelte.js';
  import { txt } from '../lib/setup.js';
  import Panel from '../lib/Panel.svelte';
  import Seg from '../lib/Seg.svelte';

  const osd = useSetup('video', 7);
  const saver = useSetup('video', 12);
  const has = (tag) => osd.doc?.querySelector(tag) && osd.doc.querySelector(tag).getAttribute('display') !== '1';
  const set = (tag, v) => osd.write(`<OnScreenDisplay><${tag}>${v}</${tag}></OnScreenDisplay>`);
</script>

<Panel id="on-screen" title="On-screen display">
  {#if osd.doc}
    {#if has('Volume')}
      <div class="setting stack">
        <div><div class="label">Volume bar</div><div class="hint">Where the volume appears on the TV when you change it</div></div>
        <Seg value={txt(osd.doc, 'Volume')} disabled={osd.saving} onchange={(v) => set('Volume', v)}
          options={[{ value: '1', label: 'Bottom' }, { value: '2', label: 'Top' }, { value: '3', label: 'Off' }]} />
      </div>
    {/if}
    {#if has('Info')}
      <div class="setting">
        <div><div class="label">Info banner</div><div class="hint">Show input / sound mode on the TV when they change</div></div>
        <button class="switch" class:on={txt(osd.doc, 'Info') === '1'} disabled={osd.saving} aria-label="Info banner"
          onclick={() => set('Info', txt(osd.doc, 'Info') === '1' ? 0 : 1)}></button>
      </div>
    {/if}
    {#if has('NowPlaying')}
      <div class="setting stack">
        <div><div class="label">Now playing</div><div class="hint">Music info on the TV for streaming / USB / tuner</div></div>
        <Seg value={txt(osd.doc, 'NowPlaying')} disabled={osd.saving} onchange={(v) => set('NowPlaying', v)}
          options={[{ value: '1', label: 'Always on' }, { value: '2', label: 'Auto off' }]} />
      </div>
    {/if}
  {/if}
  {#if saver.doc}
    <div class="setting">
      <div><div class="label">Screensaver</div><div class="hint">Dim the on-screen menu after a few minutes</div></div>
      <button class="switch" class:on={saver.doc.textContent.trim() === '1'} disabled={saver.saving} aria-label="Screensaver"
        onclick={() => saver.write(`<ScreenSaver>${saver.doc.textContent.trim() === '1' ? 0 : 1}</ScreenSaver>`)}></button>
    </div>
  {/if}
</Panel>
