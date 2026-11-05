<script>
  import { useSetup } from '../lib/useSetup.svelte.js';
  import { el, esc, txt } from '../lib/setup.js';
  import Seg from '../lib/Seg.svelte';
  import Panel from '../lib/Panel.svelte';

  const name = useSetup('globals', 3);
  const zones = useSetup('general', 6);
  const qs = useSetup('general', 7);
  const ascii = (s, n) => s.replace(/[^\x20-\x7E]/g, '').slice(0, n);
  const zoneList = $derived([...(zones.doc?.querySelectorAll('Zone') ?? [])].map((z) => ({ idx: z.getAttribute('index'), name: txt(z, 'Rename') })));
  const qsList = $derived([...(qs.doc?.querySelectorAll('Item') ?? [])].map((i) => ({ idx: i.getAttribute('index'), name: txt(i, 'Name') })));
</script>

<Panel id="names" title="Names">
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
</Panel>
