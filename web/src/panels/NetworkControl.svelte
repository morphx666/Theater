<script>
  import { useSetup } from '../lib/useSetup.svelte.js';
  import { txt } from '../lib/setup.js';
  import Panel from '../lib/Panel.svelte';
  import Seg from '../lib/Seg.svelte';
  import Icon from '../lib/Icon.svelte';

  const nc = useSetup('network', 5);
  const val = $derived(txt(nc.doc, 'Control'));
  let confirmOff = $state(false);
</script>

<Panel id="network-control" title="Network control">
  {#if nc.doc}
    <div class="setting stack">
      <div><div class="label">Keep network on in standby</div>
        <div class="hint">Needed to turn the receiver on from this app. Uses more standby power.</div></div>
      <Seg value={val} disabled={nc.saving || nc.doc.querySelector('Control')?.getAttribute('display') !== '3'}
        options={[{ value: '1', label: 'Always on' }, { value: '2', label: 'Off in standby' }]}
        onchange={(v) => (v === '2' ? (confirmOff = true) : nc.write('<Control>1</Control>'))} />
      {#if val === '2'}<div class="warn small"><Icon name="info" size={16} />While the receiver is in standby, this app can't reach it or turn it on.</div>{/if}
    </div>
  {/if}
</Panel>

{#if confirmOff}
  <div class="modal" role="dialog" aria-modal="true">
    <div class="card">
      <h3>Turn network off in standby?</h3>
      <p class="muted">Once the receiver goes to standby, this app (and HEOS, AirPlay, Spotify…) won't be able to reach it or
        turn it on — you'd need the remote or the front panel.</p>
      <div class="row" style="justify-content:flex-end">
        <button class="btn" onclick={() => (confirmOff = false)}>Cancel</button>
        <button class="btn primary" onclick={() => { nc.write('<Control>2</Control>'); confirmOff = false; }}>Turn off in standby</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .warn { display: flex; gap: 8px; align-items: center; color: var(--accent); }
</style>
