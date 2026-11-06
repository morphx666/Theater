<script>
  import { useSetup } from '../lib/useSetup.svelte.js';
  import { txt } from '../lib/setup.js';
  import Panel from '../lib/Panel.svelte';
  import Seg from '../lib/Seg.svelte';
  import Icon from '../lib/Icon.svelte';

  const hdmi = useSetup('video', 3);
  // display attribute: 1 = not available (hide), 2 = shown read-only, 3 = editable
  // (a setting missing from the page is treated as not available)
  const disp = (tag) => hdmi.doc?.querySelector(`:scope > ${tag}`)?.getAttribute('display') ?? '1';
  // What a greyed-out setting depends on (owner's manual, NA edition pp.164-167).
  const NEEDS = {
    TVAudioSwitching: 'Needs HDMI control on', PowerOffControl: 'Needs HDMI control on', PowerSaving: 'Needs HDMI control on',
    RCSelect: 'Needs HDMI control or HDMI pass-through on',
  };
  const note = (tag, text) => (disp(tag) === '2' && NEEDS[tag]) || text;
  const val = (tag) => txt(hdmi.doc, `:scope > ${tag}`);
  const set = (tag, v) => hdmi.write(`<${tag}>${v}</${tag}>`);
  const ONOFF = [{ value: '1', label: 'On' }, { value: '2', label: 'Off' }];

  const ptSources = $derived(
    [...(hdmi.doc?.querySelectorAll('PassThroughSource > List > *') ?? [])].map((n) => ({ tag: n.tagName, label: n.textContent.trim() })),
  );
  const PT_CODE = { Last: '1', HDMI1: '2', HDMI2: '3', HDMI3: '4', HDMI4: '5', HDMI5: '6', HDMI6: '7', HDMI7: '8', Front: '9' };

  let confirm = $state(null); // { tag, value, text }
  function guarded(tag, v, text) {
    if (text) confirm = { tag, value: v, text };
    else set(tag, v);
  }
</script>

<Panel id="hdmi-setup" title="HDMI setup">
  {#if hdmi.error}<p class="err">{hdmi.error}</p>{/if}
  {#if hdmi.doc}
    {#if disp('HDMIAudioOut') !== '1'}
      <div class="setting stack">
        <div><div class="label">HDMI audio output</div><div class="hint">Play sound through the receiver, or pass it to the TV's speakers</div></div>
        <Seg value={val('HDMIAudioOut')} disabled={disp('HDMIAudioOut') !== '3' || hdmi.saving}
          options={[{ value: '1', label: 'AVR (speakers)' }, { value: '2', label: 'TV' }]}
          onchange={(v) => guarded('HDMIAudioOut', v, v === '2' ? 'Audio will go to the TV (2-channel only), and the receiver\'s speakers will go silent.' : null)} />
        {#if disp('HDMIAudioOut') === '2'}<div class="hint">With HDMI control on, the TV's own audio-output setting decides this. Change it on the TV.</div>{/if}
      </div>
    {/if}
    {#if disp('HDMIControl') !== '1'}
      <div class="setting">
        <div><div class="label">HDMI control (CEC)</div><div class="hint">Lets the TV and the receiver control each other. Uses more standby power with pass-through on. After changing it, turn the TV and other HDMI devices off and on again.</div></div>
        <button class="switch" class:on={val('HDMIControl') === '1'} disabled={disp('HDMIControl') !== '3' || hdmi.saving} aria-label="HDMI control"
          onclick={() => set('HDMIControl', val('HDMIControl') === '1' ? 2 : 1)}></button>
      </div>
    {/if}
    {#if disp('ARC') !== '1'}
      <div class="setting">
        <div><div class="label">ARC</div><div class="hint">Play the TV's sound through the receiver over HDMI. Switches on automatically with HDMI control. After changing it, turn the TV off and on again.</div></div>
        <button class="switch" class:on={val('ARC') === '1'} disabled={disp('ARC') !== '3' || hdmi.saving} aria-label="ARC"
          onclick={() => set('ARC', val('ARC') === '1' ? 2 : 1)}></button>
      </div>
    {/if}
    {#if disp('TVAudioSwitching') !== '1'}
      <div class="setting">
        <div><div class="label">TV audio switching</div><div class="hint">{note('TVAudioSwitching', 'Switch to TV Audio automatically when the TV asks for it (e.g. when you use its own apps)')}</div></div>
        <button class="switch" class:on={val('TVAudioSwitching') === '1'} disabled={disp('TVAudioSwitching') !== '3' || hdmi.saving} aria-label="TV audio switching"
          onclick={() => set('TVAudioSwitching', val('TVAudioSwitching') === '1' ? 2 : 1)}></button>
      </div>
    {/if}
    {#if disp('PowerOffControl') !== '1'}
      <div class="setting stack">
        <div><div class="label">Power off control</div>
          <div class="hint">{note('PowerOffControl', 'When the TV turns off. All: the receiver always goes to standby. Video: only while an HDMI or video input is selected. Off: not linked.')}</div></div>
        <Seg value={val('PowerOffControl')} disabled={disp('PowerOffControl') !== '3' || hdmi.saving}
          options={[{ value: '1', label: 'All' }, { value: '2', label: 'Video' }, { value: '3', label: 'Off' }]}
          onchange={(v) => set('PowerOffControl', v)} />
      </div>
    {/if}
    {#if disp('RCSelect') !== '1'}
      <div class="setting stack">
        <div><div class="label">Remote source select</div><div class="hint">{note('RCSelect', 'What the remote\'s input buttons do while the receiver is in standby: turn it on and switch, or only switch the pass-through input')}</div></div>
        <Seg value={val('RCSelect')} disabled={disp('RCSelect') !== '3' || hdmi.saving}
          options={[{ value: '1', label: 'Power on + select' }, { value: '2', label: 'Select only' }]}
          onchange={(v) => set('RCSelect', v)} />
      </div>
    {/if}
    {#if disp('HDMIPassThrough') !== '1'}
      <div class="setting">
        <div><div class="label">HDMI pass-through</div><div class="hint">Keep video going to the TV while the receiver is in standby (uses more standby power)</div></div>
        <button class="switch" class:on={val('HDMIPassThrough') === '1'} disabled={disp('HDMIPassThrough') !== '3' || hdmi.saving} aria-label="HDMI pass-through"
          onclick={() => set('HDMIPassThrough', val('HDMIPassThrough') === '1' ? 2 : 1)}></button>
      </div>
    {/if}
    {#if disp('PassThroughSource') !== '1' && ptSources.length}
      <div class="setting">
        <div class="label">Pass-through source</div>
        <select value={txt(hdmi.doc, 'PassThroughSource > Source')} disabled={disp('PassThroughSource') !== '3' || hdmi.saving}
          onchange={(e) => set('PassThroughSource', e.currentTarget.value)} style="max-width:180px">
          {#each ptSources as s}<option value={PT_CODE[s.tag]}>{s.label}</option>{/each}
        </select>
      </div>
    {/if}
    {#if disp('PowerSaving') !== '1'}
      <div class="setting">
        <div><div class="label">HDMI power saving</div><div class="hint">{note('PowerSaving', 'Puts the receiver in standby when the TV is set to use its own speakers')}</div></div>
        <button class="switch" class:on={val('PowerSaving') === '1'} disabled={disp('PowerSaving') !== '3' || hdmi.saving} aria-label="HDMI power saving"
          onclick={() => set('PowerSaving', val('PowerSaving') === '1' ? 2 : 1)}></button>
      </div>
    {/if}
  {/if}
</Panel>

{#if confirm}
  <div class="modal" role="dialog" aria-modal="true">
    <div class="card">
      <h3>Are you sure?</h3>
      <p class="muted">{confirm.text}</p>
      <div class="row" style="justify-content:flex-end">
        <button class="btn" onclick={() => (confirm = null)}>Cancel</button>
        <button class="btn primary" onclick={() => { set(confirm.tag, confirm.value); confirm = null; }}><Icon name="check" size={18} />Change</button>
      </div>
    </div>
  </div>
{/if}
