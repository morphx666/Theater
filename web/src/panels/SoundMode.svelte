<script>
  import { avr, send } from '../lib/avr.svelte.js';
  import Panel from '../lib/Panel.svelte';

  const st = $derived(avr.state);
  const on = $derived(st?.zoneMain === true);
  const MODES = [
    // Hints from the owner's manual (NA edition, pp.117-122).
    { cmd: 'MSMOVIE', label: 'Movie', hint: 'Recalls the last movie mode; press again for the next. The choices depend on the input signal.' },
    { cmd: 'MSMUSIC', label: 'Music', hint: 'Recalls the last music mode; press again for the next. The choices depend on the input signal.' },
    { cmd: 'MSGAME', label: 'Game', hint: 'Recalls the last game mode; press again for the next. The choices depend on the input signal.' },
    { cmd: 'MSPURE DIRECT', label: 'Pure', match: /^PURE/, hint: 'Pure Direct: like Direct, plus the front display turns off and the on-screen menu is not shown' },
    { cmd: 'MSDIRECT', label: 'Direct', match: /^DIRECT/, hint: 'Plays the source as recorded. Dialog Enhancer, Tone, Restorer, Audyssey and the Graphic EQ are unavailable.' },
    { cmd: 'MSSTEREO', label: 'Stereo', match: /^STEREO/, stereo: true, hint: 'Front left/right and subwoofer only; multichannel sources are mixed down to 2 channels' },
    { cmd: 'MSMCH STEREO', label: 'Multi Ch Stereo', match: /^MCH STEREO|MULTI CH/, stereo: true, hint: 'Plays stereo through all speakers' },
    { cmd: 'MSAUTO', label: 'Auto', match: /^AUTO/, hint: 'Matches the input format; analog and 2-channel PCM sources play in stereo' },
  ];
  // In All Zone Stereo only Stereo and Multi Ch Stereo can be selected (p.115).
  const azs = $derived(st?.allZoneStereo === true);
</script>

<Panel id="sound-mode" title="Sound mode">
  {#snippet actions()}<span class="pill mono">{st.surround ?? '—'}</span>{/snippet}
  <div class="modes">
    {#each MODES as m (m.cmd)}
      <button class="btn" class:on={m.match?.test(st.surround ?? '')} disabled={!on || (azs && !m.stereo)} title={azs && !m.stereo ? 'Only Stereo and Multi Ch Stereo while All Zone Stereo is on' : m.hint ?? ''}
        onclick={() => send(m.cmd)}>{m.label}</button>
    {/each}
  </div>
</Panel>

<style>
  .modes { display: grid; grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: 8px; }
</style>
