<script>
  import { avr, api, toast } from '../lib/avr.svelte.js';
  import Icon from '../lib/Icon.svelte';
  import Panel from '../lib/Panel.svelte';
  import Seg from '../lib/Seg.svelte';
  import Slider from '../lib/Slider.svelte';

  async function saveSettings(patch) {
    try { await api('/api/settings', { method: 'POST', body: patch }); toast('Saved'); }
    catch (e) { toast(e.message, 'error'); }
  }
</script>

<Panel id="app-settings" title="This app">
      <div class="setting stack">
        <Slider label="Volume safety cap" min={-40} max={10} step={1} value={avr.settings.volumeCapDb}
          format={(v) => (v > 0 ? '+' : '') + v + ' dB'} onchange={(v) => saveSettings({ volumeCapDb: v })} />
        <div class="hint">The app never lets the main or Zone 2 volume go above this. If the receiver's own Volume Limit is
          lower, that wins (effective cap now: <strong>{avr.cap} dB</strong>).</div>
      </div>
      <div class="setting stack">
        <div class="label">Volume button step</div>
        <Seg value={avr.settings.volumeStep} onchange={(v) => saveSettings({ volumeStep: v })}
          options={[{ value: 0.5, label: '0.5 dB' }, { value: 1, label: '1 dB' }, { value: 2, label: '2 dB' }]} />
      </div>
      <div class="setting stack">
        <div class="label">Keyboard shortcuts</div>
        <div class="hint"><span class="mono">+ / −</span> volume · <span class="mono">m</span> mute · <span class="mono">1–6</span> switch page ·
          arrow keys on the volume dial</div>
      </div>
</Panel>

<style>
  .hint { font-size: 12.5px; color: var(--muted); }
</style>
