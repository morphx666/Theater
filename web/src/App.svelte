<script>
  import { avr, connect, send } from './lib/avr.svelte.js';
  import Icon from './lib/Icon.svelte';
  import Home from './pages/Home.svelte';
  import Section from './pages/Section.svelte';
  import Setup from './pages/Setup.svelte';
  import { ui } from './lib/layout.svelte.js';

  const PAGES = [
    { id: 'home', label: 'Home', icon: 'home', comp: Home },
    { id: 'sound', label: 'Sound', icon: 'sliders', comp: Section },
    { id: 'speakers', label: 'Speakers', icon: 'speaker', comp: Section },
    { id: 'zones', label: 'Zone 2', icon: 'zones', comp: Section },
    { id: 'remote', label: 'Remote', icon: 'remote', comp: Section },
    { id: 'setup', label: 'Setup', icon: 'gear', comp: Setup },
  ];

  let page = $state(location.hash.slice(1) || 'home');
  const Current = $derived(PAGES.find((p) => p.id === page)?.comp ?? Home);
  $effect(() => { history.replaceState(null, '', '#' + page); if (page !== 'home') ui.editing = false; });
  window.addEventListener('hashchange', () => (page = location.hash.slice(1) || 'home'));

  connect();

  const st = $derived(avr.state);
  const on = $derived(st?.zoneMain === true);
  const name = $derived(st?.model?.replace(/USA$|EUR$/, '') ?? 'AVR');
  $effect(() => { document.title = on ? `${st?.inputs?.[st.source]?.name ?? 'Home Theater'} · ${st?.volume ?? ''} dB` : 'Home Theater'; });

  const link = $derived(
    !avr.online ? { cls: 'bad', text: 'Server offline' }
    : avr.conn.telnet ? { cls: 'good', text: 'Live' }
    : avr.conn.http ? { cls: 'warn', text: 'HTTP fallback' }
    : { cls: 'bad', text: 'Receiver unreachable' },
  );

  // Keyboard shortcuts (ignored while typing)
  function onKey(e) {
    if (e.target.closest('input, select, textarea') || e.metaKey || e.ctrlKey) return;
    if (e.key === 'm') send(st?.mute ? 'MUOFF' : 'MUON');
    else if (e.key === '+' || e.key === '=') send('MVUP');
    else if (e.key === '-') send('MVDOWN');
    else if (/^[1-6]$/.test(e.key)) page = PAGES[Number(e.key) - 1].id;
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="shell">
  <nav class="side">
    <div class="brand"><img src="/icon.svg" alt="" width="30" height="30" /><span>Theater</span></div>
    {#each PAGES as p (p.id)}
      <button class="nav" class:active={page === p.id} onclick={() => (page = p.id)}>
        <Icon name={p.icon} /><span>{p.label}</span>
      </button>
    {/each}
  </nav>

  <div class="main">
    <header class="top">
      <div class="grow">
        <h1>Home Theater</h1>
        <div class="row small muted"><span class="dot {link.cls}"></span>{link.text} · {name}</div>
      </div>
      <button class="power" class:on aria-label="Power" disabled={!st}
        onclick={() => send(on ? 'ZMOFF' : 'ZMON')}>
        <Icon name="power" size={22} stroke={2.4} />
      </button>
    </header>

    <main>
      {#if !st}
        <div class="empty">Connecting to the receiver…</div>
      {:else}
        {#key page}<Current section={page} />{/key}
      {/if}
    </main>
  </div>

  <nav class="tabs">
    {#each PAGES as p (p.id)}
      <button class:active={page === p.id} onclick={() => (page = p.id)}>
        <Icon name={p.icon} size={22} /><span>{p.label}</span>
      </button>
    {/each}
  </nav>
</div>

{#if avr.toast}
  <div class="toast {avr.toast.kind}" role="status">{avr.toast.text}</div>
{/if}

<style>
  .shell { display: flex; min-height: 100dvh; }
  .side {
    display: none; flex-direction: column; gap: 4px; width: 210px; flex: none; padding: 22px 14px;
    border-right: 1px solid var(--line); background: var(--bg-2); position: sticky; top: 0; height: 100dvh;
  }
  .brand { display: flex; align-items: center; gap: 10px; font-weight: 700; font-size: 18px; padding: 0 10px 22px; }
  .nav {
    display: flex; align-items: center; gap: 12px; padding: 11px 12px; border-radius: 12px; border: 0;
    background: none; cursor: pointer; color: var(--muted); text-align: left; font-weight: 550;
  }
  .nav:hover { background: var(--card); color: var(--text); }
  .nav.active { background: var(--card); color: var(--accent); box-shadow: var(--shadow); }

  .main { flex: 1; min-width: 0; padding: env(safe-area-inset-top) 0 calc(78px + env(safe-area-inset-bottom)); }
  .top {
    display: flex; align-items: center; gap: 14px; padding: 18px 18px 10px; max-width: 1180px; margin: 0 auto;
  }
  .top h1 { font-size: 24px; }
  main { padding: 8px 16px 24px; max-width: 1180px; margin: 0 auto; }

  .power {
    width: 52px; height: 52px; border-radius: 50%; border: 1px solid var(--line); background: var(--card);
    color: var(--faint); cursor: pointer; display: grid; place-items: center; transition: all 0.2s;
  }
  .power.on { color: var(--good); border-color: color-mix(in srgb, var(--good) 50%, var(--line)); box-shadow: 0 0 18px -4px var(--good); }
  .power:active { transform: scale(0.94); }

  .tabs {
    position: fixed; bottom: 0; left: 0; right: 0; display: flex; z-index: 10;
    background: color-mix(in srgb, var(--bg-2) 88%, transparent); backdrop-filter: blur(16px);
    border-top: 1px solid var(--line); padding: 6px 4px calc(6px + env(safe-area-inset-bottom));
  }
  .tabs button {
    flex: 1; border: 0; background: none; display: flex; flex-direction: column; align-items: center; gap: 3px;
    color: var(--faint); font-size: 10.5px; padding: 6px 0; cursor: pointer; font-weight: 550;
  }
  .tabs button.active { color: var(--accent); }

  @media (min-width: 900px) {
    .side { display: flex; }
    .tabs { display: none; }
    .main { padding-bottom: 20px; }
    .top { padding: 26px 28px 12px; }
    main { padding: 8px 28px 32px; }
  }

  .toast {
    position: fixed; left: 50%; bottom: calc(92px + env(safe-area-inset-bottom)); transform: translateX(-50%);
    background: var(--card-2); border: 1px solid var(--line); padding: 10px 16px; border-radius: 12px;
    box-shadow: var(--shadow); z-index: 20; max-width: calc(100% - 32px); animation: pop 0.2s;
  }
  .toast.error { border-color: var(--bad); color: var(--bad); }
  @keyframes pop { from { opacity: 0; transform: translate(-50%, 8px); } }
</style>
