<script>
  import { useSetup } from '../lib/useSetup.svelte.js';
  import { txt } from '../lib/setup.js';
  import Panel from '../lib/Panel.svelte';
  import { avr } from '../lib/avr.svelte.js';

  // Setup-API source index -> telnet input code (to fill in names the receiver leaves blank).
  const INDEX_TO_SI = { 1: 'SAT/CBL', 3: 'BD', 4: 'GAME', 5: 'MPLAY', 6: 'TV', 7: 'AUX1', 8: 'AUX2', 10: 'PHONO', 11: 'TUNER', 13: 'NET' };
  const nameFor = (idx, given) => given || avr.state?.inputs?.[INDEX_TO_SI[idx]]?.name || INDEX_TO_SI[idx] || `Input ${idx}`;

  const hdcp = useSetup('video', 11);
  const rows = $derived([...(hdcp.doc?.querySelectorAll('Source') ?? [])].map((n) => ({
    idx: n.getAttribute('index'), name: nameFor(n.getAttribute('index'), txt(n, 'Name')), value: txt(n, 'Value'),
    edit: n.getAttribute('display') === '3', custom: txt(n, 'Limit') === '1',
  })));
</script>

<Panel id="hdcp" title="HDCP">
  <p class="muted small" style="margin:-6px 0 8px">Copy-protection version per input. Leave on Auto unless a device shows a black screen.</p>
  {#each rows as r (r.idx)}
    <label class="r">
      <span>{r.name}</span>
      <select value={r.value} disabled={!r.edit || hdcp.saving} onchange={(e) => hdcp.write(`<Value index="${r.idx}">${e.currentTarget.value}</Value>`)}>
        <option value="1">Auto</option>
        <option value="2">HDCP 1.4</option>
        <option value="3">HDCP 2.3</option>
        {#if r.custom}<option value="4">Custom</option>{/if}
      </select>
    </label>
  {/each}
</Panel>

<style>
  .r { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 5px 0; }
  .r select { width: 140px; flex: none; }
</style>
