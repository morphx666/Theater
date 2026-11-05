<script>
  import { send } from '../lib/avr.svelte.js';
  import Icon from '../lib/Icon.svelte';
  import Panel from '../lib/Panel.svelte';
</script>

<Panel id="osd" title="On-screen menu">
  {#snippet actions()}<span class="faint small">controls the TV menu</span>{/snippet}
  <div class="pad">
    <button class="btn k up" aria-label="Up" onclick={() => send('MNCUP')}><Icon name="up" size={26} /></button>
    <button class="btn k left" aria-label="Left" onclick={() => send('MNCLT')}><Icon name="left" size={26} /></button>
    <button class="btn k ok primary" onclick={() => send('MNENT')}>OK</button>
    <button class="btn k right" aria-label="Right" onclick={() => send('MNCRT')}><Icon name="right" size={26} /></button>
    <button class="btn k down" aria-label="Down" onclick={() => send('MNCDN')}><Icon name="down" size={26} /></button>
  </div>
  <div class="row keys">
    <button class="btn grow" onclick={() => send('MNRTN')}><Icon name="back" size={18} />Back</button>
    <button class="btn grow" onclick={() => send('MNINF')}><Icon name="info" size={18} />Info</button>
    <button class="btn grow" onclick={() => send('MNOPT')}><Icon name="list" size={18} />Option</button>
  </div>
  <div class="row keys">
    <button class="btn grow" onclick={() => send('MNMEN ON')}><Icon name="menu" size={18} />Open setup menu</button>
    <button class="btn grow" onclick={() => send('MNMEN OFF')}>Close menu</button>
  </div>
</Panel>

<style>
  .pad { display: grid; grid-template-columns: repeat(3, 72px); grid-template-rows: repeat(3, 72px); gap: 8px; justify-content: center; margin: 4px 0 16px; }
  .k { border-radius: 18px; padding: 0; }
  .up { grid-area: 1 / 2; } .left { grid-area: 2 / 1; } .ok { grid-area: 2 / 2; border-radius: 50%; font-weight: 700; font-size: 17px; }
  .right { grid-area: 2 / 3; } .down { grid-area: 3 / 2; }
  .keys { margin-top: 8px; }
</style>
