<script>
  import { useSetup } from '../lib/useSetup.svelte.js';
  import { txt } from '../lib/setup.js';
  import Panel from '../lib/Panel.svelte';

  // Status only, on purpose: signing in/out would send the HEOS password through this app.
  const acct = useSetup('account', 9);
  const signedIn = $derived(txt(acct.doc, 'SignedIn') === '1');
</script>

<Panel id="heos-account" title="HEOS account">
  {#if acct.doc}
    <div class="setting">
      <div>
        <div class="label">{signedIn ? 'Signed in' : 'Not signed in'}</div>
        {#if signedIn}<div class="hint mono">{txt(acct.doc, 'Username')}</div>{/if}
      </div>
      <span class="dot {signedIn ? 'good' : 'bad'}"></span>
    </div>
    <p class="faint small">HEOS favorites and streaming accounts come from this HEOS account. Sign in or out from the HEOS app —
      your password never passes through this app.</p>
  {/if}
</Panel>

<style>
  p { margin: 10px 0 0; }
</style>
