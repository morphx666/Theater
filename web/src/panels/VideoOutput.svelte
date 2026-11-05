<script>
  import { useSetup } from '../lib/useSetup.svelte.js';
  import { txt } from '../lib/setup.js';
  import Panel from '../lib/Panel.svelte';
  import Seg from '../lib/Seg.svelte';

  const fmt = useSetup('video', 8, { reloadDelay: 1500 });
  const scaler = useSetup('video', 13);
  const tv = useSetup('video', 9);

  const eightK = $derived(fmt.doc?.getAttribute('mode') === 'fourk_eightk');
  const formatOpts = $derived([
    { value: '1', label: 'Standard' },
    { value: '2', label: 'Enhanced' },
    ...(eightK ? [{ value: '4', label: '8K Enhanced' }] : []),
  ]);
</script>

<Panel id="video-output" title="Video output">
  {#if fmt.doc}
    <div class="setting stack">
      <div><div class="label">{eightK ? '4K/8K' : '4K'} signal format</div>
        <div class="hint">Enhanced is needed for 4K HDR / high frame rates. Use Standard only if a source or TV has trouble with it.</div></div>
      <Seg value={txt(fmt.doc, 'Format')} options={formatOpts} disabled={fmt.saving}
        onchange={(v) => fmt.write(`<Format>${v}</Format>`)} />
    </div>
  {/if}
  {#if scaler.doc}
    <div class="setting stack">
      <div><div class="label">HDMI upscaler</div><div class="hint">Let the receiver upscale lower-resolution video for the TV</div></div>
      <Seg value={scaler.doc.textContent.trim()} disabled={scaler.saving}
        options={[{ value: '1', label: 'Auto' }, { value: '10', label: 'Off' }]}
        onchange={(v) => scaler.write(`<HDMIScaler>${v}</HDMIScaler>`)} />
    </div>
  {/if}
  {#if tv.doc}
    <div class="setting stack">
      <div><div class="label">TV format</div><div class="hint">Video standard for the on-screen menu</div></div>
      <Seg value={tv.doc.textContent.trim()} disabled={tv.saving}
        options={[{ value: '1', label: 'NTSC' }, { value: '2', label: 'PAL' }]}
        onchange={(v) => tv.write(`<TVFormat>${v}</TVFormat>`)} />
    </div>
  {/if}
</Panel>
