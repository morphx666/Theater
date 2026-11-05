<script>
  import { useSetup } from '../lib/useSetup.svelte.js';
  import { txt } from '../lib/setup.js';
  import Panel from '../lib/Panel.svelte';

  const SERVICES = [
    { type: 9, tag: 'AirPlay', name: 'AirPlay', hint: 'Stream from iPhone, iPad and Mac' },
    { type: 10, tag: 'SpotifyConnect', name: 'Spotify Connect', hint: 'Play from the Spotify app' },
    { type: 11, tag: 'RoonReady', name: 'Roon Ready', hint: 'Use the receiver as a Roon endpoint' },
    { type: 12, tag: 'TidalConnect', name: 'TIDAL Connect', hint: 'Play from the TIDAL app' },
    { type: 13, tag: 'QobuzConnect', name: 'Qobuz Connect', hint: 'Play from the Qobuz app' },
  ].map((s) => ({ ...s, cfg: useSetup('network', s.type) }));

  const on = (s) => txt(s.cfg.doc, 'Value') === '1';
  const visible = (s) => s.cfg.doc && s.cfg.doc.querySelector('Value')?.getAttribute('display') !== '1';
</script>

<Panel id="streaming" title="Streaming services">
  {#each SERVICES as s (s.tag)}
    {#if visible(s)}
      <div class="setting">
        <div><div class="label">{s.name}</div><div class="hint">{s.hint}</div></div>
        <button class="switch" class:on={on(s)} disabled={s.cfg.saving || s.cfg.doc.querySelector('Value')?.getAttribute('display') !== '3'}
          aria-label={s.name} onclick={() => s.cfg.write(`<${s.tag}>${on(s) ? 2 : 1}</${s.tag}>`)}></button>
      </div>
    {/if}
  {/each}
</Panel>
