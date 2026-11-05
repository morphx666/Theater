<script>
  import { api, toast } from './avr.svelte.js';
  import Icon from './Icon.svelte';

  let favs = $state(null);
  api('/api/heos/favorites').then((f) => (favs = f)).catch(() => (favs = []));

  async function play(i) {
    try { await api('/api/heos/favorites/play', { method: 'POST', body: { index: i + 1 } }); toast(`Playing ${favs[i].name}`); }
    catch (e) { toast(e.message, 'error'); }
  }
</script>

{#if favs?.length}
  <div class="card">
    <h2>HEOS favorites</h2>
    <div class="favs">
      {#each favs as f, i (f.mid + i)}
        <button class="fav" onclick={() => play(i)}>
          <span class="art" style:background-image={f.image ? `url("${f.image}")` : null}>{#if !f.image}<Icon name="star" />{/if}</span>
          <span class="name">{f.name}</span>
        </button>
      {/each}
    </div>
  </div>
{/if}

<style>
  .favs { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 12px; }
  .fav { border: 0; background: none; padding: 0; cursor: pointer; display: grid; gap: 6px; text-align: left; }
  .art { aspect-ratio: 1; border-radius: 12px; background: var(--card-2) center/cover; display: grid; place-items: center; color: var(--faint);
    border: 1px solid var(--line); transition: transform 0.1s; }
  .fav:hover .art { transform: scale(1.03); border-color: var(--accent); }
  .name { font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>
