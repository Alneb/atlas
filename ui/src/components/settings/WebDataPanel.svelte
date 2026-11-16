<script lang="ts">
  // Settings → Web: the web tabs' sign-ins and site data, forgotten on request (lib/web-links.ts `forgetWebData`). Web
  // tabs are frames of Atlas's page and share its network session, so their data cannot live apart; this empties it.
  import Icon from "../Icon.svelte";
  import { forgetWebData, framesAnything } from "../../lib/web-links";

  let busy = $state(false);
  async function forget() {
    busy = true;
    try { await forgetWebData(); } finally { busy = false; }
  }
</script>

{#if framesAnything}
  <section class="settings-panel web-data">
    <h3>Sign-ins and site data</h3>
    <p class="desc">Sites you open in web tabs and browsing windows keep cookies, stored data and a cache here, as in a browser. Forgetting them signs you out of every site; Atlas's own data and your vault stay.</p>
    <button class="btn btn-ghost" disabled={busy} onclick={() => void forget()}><Icon name="trash" size={13} /> Forget sign-ins and site data…</button>
  </section>
{/if}

<style>
  h3 { margin: 10px 0 2px; } /* its look: SettingsPage */
  .desc { margin: 0 0 8px; color: var(--text-faint); font-size: calc(12.5px * var(--ui-scale, 1)); }
</style>
