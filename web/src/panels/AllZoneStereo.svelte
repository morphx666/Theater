<script>
  import { avr, send } from '../lib/avr.svelte.js';
  import Panel from '../lib/Panel.svelte';

  const st = $derived(avr.state);
</script>

<Panel id="all-zone-stereo" title="All Zone Stereo">
  <div class="setting">
    <div><div class="label">Play main-zone audio everywhere</div>
      <div class="hint">{st.zoneMain !== true ? 'Turn on the main zone first'
        : 'Plays the main zone in Zone 2 too, in stereo. Zone 2 switches to the same input, and only Stereo or Multi Ch Stereo can be used. Not available while HDMI audio goes to the TV. Ends when the main zone turns off.'}</div></div>
    <button class="switch" class:on={st.allZoneStereo} disabled={st.zoneMain !== true} aria-label="All Zone Stereo"
      onclick={() => send('MNZST ' + (st.allZoneStereo ? 'OFF' : 'ON'))}></button>
  </div>
</Panel>
