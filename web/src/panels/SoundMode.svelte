<script>
  import { avr, send } from '../lib/avr.svelte.js';
  import Panel from '../lib/Panel.svelte';

  const st = $derived(avr.state);
  const on = $derived(st?.zoneMain === true);
  const MODES = [
    { cmd: 'MSMOVIE', label: 'Movie', hint: 'Cycles movie modes' },
    { cmd: 'MSMUSIC', label: 'Music', hint: 'Cycles music modes' },
    { cmd: 'MSGAME', label: 'Game', hint: 'Cycles game modes' },
    { cmd: 'MSPURE DIRECT', label: 'Pure', match: /^PURE/ },
    { cmd: 'MSDIRECT', label: 'Direct', match: /^DIRECT/ },
    { cmd: 'MSSTEREO', label: 'Stereo', match: /^STEREO/ },
    { cmd: 'MSMCH STEREO', label: 'All Ch Stereo', match: /^MCH STEREO|MULTI CH/ },
    { cmd: 'MSAUTO', label: 'Auto', match: /^AUTO/ },
  ];
</script>

<Panel id="sound-mode" title="Sound mode">
  {#snippet actions()}<span class="pill mono">{st.surround ?? '—'}</span>{/snippet}
  <div class="modes">
    {#each MODES as m (m.cmd)}
      <button class="btn" class:on={m.match?.test(st.surround ?? '')} disabled={!on} title={m.hint ?? ''}
        onclick={() => send(m.cmd)}>{m.label}</button>
    {/each}
  </div>
</Panel>

<style>
  .modes { display: grid; grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: 8px; }
</style>
