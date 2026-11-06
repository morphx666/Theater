<script>
  import { avr, send } from '../lib/avr.svelte.js';
  import Panel from '../lib/Panel.svelte';

  const st = $derived(avr.state);
  const on = $derived(st?.zoneMain === true);
  const MODES = [
    // Hints from the owner's manual (NA edition, pp.117-122).
    { cmd: 'MSMOVIE', label: 'Movie', hint: 'Press again for the next movie mode' },
    { cmd: 'MSMUSIC', label: 'Music', hint: 'Press again for the next music mode' },
    { cmd: 'MSGAME', label: 'Game', hint: 'Press again for the next game mode' },
    { cmd: 'MSPURE DIRECT', label: 'Pure', match: /^PURE/, hint: 'Direct, with the display and TV menu off' },
    { cmd: 'MSDIRECT', label: 'Direct', match: /^DIRECT/, hint: 'Unprocessed; most audio settings off' },
    { cmd: 'MSSTEREO', label: 'Stereo', match: /^STEREO/, stereo: true, hint: 'Front speakers and subwoofer only' },
    { cmd: 'MSMCH STEREO', label: 'Multi Ch Stereo', match: /^MCH STEREO|MULTI CH/, stereo: true, hint: 'Stereo through all speakers' },
    { cmd: 'MSAUTO', label: 'Auto', match: /^AUTO/, hint: 'Matches the input format' },
  ];
  // In All Zone Stereo only Stereo and Multi Ch Stereo can be selected (p.115).
  const azs = $derived(st?.allZoneStereo === true);
</script>

<Panel id="sound-mode" title="Sound mode">
  {#snippet actions()}<span class="pill mono">{st.surround ?? '—'}</span>{/snippet}
  <div class="modes">
    {#each MODES as m (m.cmd)}
      <button class="btn" class:on={m.match?.test(st.surround ?? '')} disabled={!on || (azs && !m.stereo)} title={azs && !m.stereo ? 'Only stereo modes during All Zone Stereo' : m.hint ?? ''}
        onclick={() => send(m.cmd)}>{m.label}</button>
    {/each}
  </div>
</Panel>

<style>
  .modes { display: grid; grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: 8px; }
</style>
