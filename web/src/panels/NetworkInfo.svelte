<script>
  import { useSetup } from '../lib/useSetup.svelte.js';
  import { txt } from '../lib/setup.js';
  import Panel from '../lib/Panel.svelte';

  // Read-only on purpose: a wrong IP setting would take the receiver off the network.
  const info = useSetup('network', 2);
  const settings = useSetup('network', 4);
  const CONN = { 1: 'Not connected', 2: 'Connecting…', 3: 'Wired (Ethernet)', 4: 'Wi-Fi' };
  const mac = (s) => (s ? s.replace(/(..)(?!$)/g, '$1:') : '—');
</script>

<Panel id="network-info" title="Network">
  {#if info.doc}
    <dl>
      <dt>Connection</dt><dd>{CONN[txt(info.doc, 'Connection')] ?? '—'}</dd>
      {#if txt(info.doc, 'Connection') === '4'}<dt>Wi-Fi network</dt><dd>{txt(info.doc, 'SSID')}</dd>{/if}
      <dt>Address</dt><dd class="mono">{txt(info.doc, 'IPAddress')} <span class="faint">({txt(info.doc, 'DHCP') === '1' ? 'DHCP' : 'static'})</span></dd>
      {#if settings.doc}
        <dt>Subnet mask</dt><dd class="mono">{txt(settings.doc, 'SubnetMask')}</dd>
        <dt>Gateway</dt><dd class="mono">{txt(settings.doc, 'DefaultGateway')}</dd>
        <dt>DNS</dt><dd class="mono">{txt(settings.doc, 'DNS')}</dd>
      {/if}
      <dt>MAC (Ethernet)</dt><dd class="mono">{mac(txt(info.doc, 'MacAddress > Ethernet'))}</dd>
      <dt>MAC (Wi-Fi)</dt><dd class="mono">{mac(txt(info.doc, 'MacAddress > WiFi'))}</dd>
    </dl>
    <p class="faint small">Read-only. Change these in the receiver's menu (Setup → Network).</p>
  {/if}
</Panel>

<style>
  dl { display: grid; grid-template-columns: auto 1fr; gap: 8px 16px; margin: 0; }
  dt { color: var(--muted); }
  dd { margin: 0; }
  p { margin: 12px 0 0; }
</style>
