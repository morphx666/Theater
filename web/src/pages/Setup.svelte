<script>
  import { avr, api, toast } from '../lib/avr.svelte.js';
  import Icon from '../lib/Icon.svelte';
  import Seg from '../lib/Seg.svelte';
  import Slider from '../lib/Slider.svelte';
  import SetupInputs from '../lib/SetupInputs.svelte';
  import SetupAudio from '../lib/SetupAudio.svelte';
  import SetupGeneral from '../lib/SetupGeneral.svelte';

  const st = $derived(avr.state);
  let tab = $state('inputs');

  async function saveSettings(patch) {
    try { await api('/api/settings', { method: 'POST', body: patch }); toast('Saved'); }
    catch (e) { toast(e.message, 'error'); }
  }

  let backups = $state(null);
  async function loadBackups() {
    try { backups = await api('/api/setup/backups'); } catch (e) { toast(e.message, 'error'); }
  }
</script>

<div class="seg tabs" role="tablist">
  {#each [['inputs', 'Inputs'], ['audio', 'Audio & Volume'], ['general', 'General'], ['app', 'App & Info']] as [id, label]}
    <button role="tab" class:on={tab === id} aria-selected={tab === id} onclick={() => (tab = id)}>{label}</button>
  {/each}
</div>

{#if tab === 'inputs'}
  <SetupInputs />
{:else if tab === 'audio'}
  <SetupAudio />
{:else if tab === 'general'}
  <SetupGeneral />
{:else}
  <div class="cols">
    <section class="card">
      <h2>This app</h2>
      <div class="setting stack">
        <Slider label="Volume safety cap" min={-40} max={10} step={1} value={avr.settings.volumeCapDb}
          format={(v) => (v > 0 ? '+' : '') + v + ' dB'} onchange={(v) => saveSettings({ volumeCapDb: v })} />
        <div class="hint">The app never lets the main or Zone 2 volume go above this. If the receiver's own Volume Limit is
          lower, that wins (effective cap now: <strong>{avr.cap} dB</strong>).</div>
      </div>
      <div class="setting stack">
        <div class="label">Volume button step</div>
        <Seg value={avr.settings.volumeStep} onchange={(v) => saveSettings({ volumeStep: v })}
          options={[{ value: 0.5, label: '0.5 dB' }, { value: 1, label: '1 dB' }, { value: 2, label: '2 dB' }]} />
      </div>
      <div class="setting stack">
        <div class="label">Keyboard shortcuts</div>
        <div class="hint"><span class="mono">+ / −</span> volume · <span class="mono">m</span> mute · <span class="mono">1–6</span> switch page ·
          arrow keys on the volume dial</div>
      </div>
    </section>

    <section class="card">
      <h2>Receiver</h2>
      <dl>
        <dt>Model</dt><dd>{st.model ?? '—'}</dd>
        {#each Object.entries(st.firmware ?? {}) as [k, v]}<dt>Firmware {k}</dt><dd class="mono">{v}</dd>{/each}
        <dt>Connection</dt>
        <dd>
          <span class="dot {avr.conn.telnet ? 'good' : 'bad'}"></span> telnet
          <span class="dot {avr.conn.heos ? 'good' : 'bad'}" style="margin-left:10px"></span> HEOS
          {#if !avr.conn.telnet}<span class="dot {avr.conn.http ? 'warn' : 'bad'}" style="margin-left:10px"></span> HTTP{/if}
        </dd>
        <dt>Volume limit</dt><dd>{st.volumeLimit === 'OFF' ? 'Off' : st.volumeLimit ? Number(st.volumeLimit) - 80 + ' dB' : '—'}</dd>
        <dt>Max volume</dt><dd>{st.volumeMax != null ? st.volumeMax + ' dB' : '—'}</dd>
      </dl>
    </section>

    <section class="card">
      <h2>Setup backups
        <button class="btn small" onclick={loadBackups}><Icon name="reset" size={16} />Refresh</button>
      </h2>
      <p class="muted small">Before every setup change, the previous value is saved on the server (in <span class="mono">data/backups</span>).</p>
      {#if backups === null}
        <button class="btn" onclick={loadBackups}>Show backups</button>
      {:else if !backups.length}
        <p class="faint">No changes made yet.</p>
      {:else}
        <ul class="backups">
          {#each backups.slice(0, 50) as b}
            <li><a href="/api/setup/backups/{b}" target="_blank" class="mono small">{b}</a></li>
          {/each}
        </ul>
      {/if}
    </section>
  </div>
{/if}

<style>
  .tabs { margin-bottom: 16px; max-width: 640px; overflow-x: auto; }
  .cols { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); align-items: start; }
  .hint { font-size: 12.5px; color: var(--muted); }
  dl { display: grid; grid-template-columns: auto 1fr; gap: 8px 16px; margin: 0; }
  dt { color: var(--muted); }
  dd { margin: 0; display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
  .backups { list-style: none; padding: 0; margin: 0; display: grid; gap: 4px; max-height: 260px; overflow: auto; }
  .backups a { color: var(--blue); }
  .btn.small { min-height: 32px; padding: 4px 10px; font-size: 12.5px; text-transform: none; letter-spacing: 0; }
</style>
