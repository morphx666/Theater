<script>
  import { useSetup } from '../lib/useSetup.svelte.js';
  import Panel from '../lib/Panel.svelte';
  import Seg from '../lib/Seg.svelte';

  const lang = useSetup('general', 2);
  const ALL = [
    { value: '1', label: 'English' }, { value: '2', label: 'Deutsch' }, { value: '3', label: 'Français' }, { value: '4', label: 'Italiano' },
    { value: '5', label: 'Español' }, { value: '6', label: 'Nederlands' }, { value: '7', label: 'Svenska' }, { value: '8', label: '日本語' },
    { value: '9', label: '中文' }, { value: '10', label: 'Polski' }, { value: '11', label: 'Русский' },
  ];
  // Languages offered depend on the unit's region (group): 0 = Americas, 1 = Europe, 2 = Japan, 3 = China.
  const REGION = { 0: ['1', '3', '5'], 1: ['1', '2', '3', '4', '5', '6', '7', '10', '11'], 2: ['1', '8'], 3: ['1', '9'] };
  const options = $derived(ALL.filter((o) => (REGION[lang.doc?.getAttribute('group') ?? '0'] ?? ['1']).includes(o.value)));
</script>

<Panel id="language" title="Language">
  {#if lang.doc}
    <div class="setting stack">
      <div><div class="label">Menu language</div><div class="hint">For the on-screen menu</div></div>
      <Seg value={lang.doc.textContent.trim()} {options} disabled={lang.saving}
        onchange={(v) => lang.write(`<Language>${v}</Language>`)} />
    </div>
  {/if}
</Panel>
