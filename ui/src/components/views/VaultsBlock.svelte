<script lang="ts">
  // The `vaults` block: a way into one's own vault from a page — the first screen of a fresh Atlas (the desktop's
  // Welcome vault) carries it. Making, opening and switching go through lib/vaults.ts, as the vault switcher does.
  import Icon from "../Icon.svelte";
  import { askFolder, askServer, chooseVault, vaultListing } from "../../lib/vaults";

  /** null while asking; false: this core keeps no vault list (`atlas serve` of one folder) — nothing to switch to. */
  let manage = $state<boolean | null>(null);
  let others = $state(0);
  $effect(() => {
    void vaultListing().then((l) => { manage = l.manage; others = l.entries.filter((e) => !e.current && !e.missing).length; }, () => { manage = false; });
  });
</script>

<section class="vaults-block" data-testid="vaults-block" aria-label="Vaults">
  {#if manage === false}
    <p class="muted">This Atlas serves one folder. Another vault is served by starting <code>atlas serve</code> on it.</p>
  {:else}
    <div class="row">
      <button class="btn primary" disabled={manage === null} onclick={() => askFolder(true)}><Icon name="plus" size={14} /> New vault…</button>
      <button class="btn btn-ghost" disabled={manage === null} onclick={() => askFolder(false)}><Icon name="folder-open" size={14} /> Open a folder…</button>
      <button class="btn btn-ghost" disabled={manage === null} onclick={() => askServer()}><Icon name="server" size={14} /> Connect to a server…</button>
      {#if others}<button class="btn btn-ghost" onclick={() => void chooseVault()}><Icon name="folder" size={14} /> Your vaults ({others})…</button>{/if}
    </div>
    <p class="muted">A vault is any folder: an Obsidian vault opens as it is. Ctrl+Alt+V switches between vaults later.</p>
  {/if}
</section>

<style>
  .vaults-block { display: flex; flex-direction: column; gap: 10px; }
  .row { display: flex; flex-wrap: wrap; gap: 8px; }
  .row .btn { display: inline-flex; align-items: center; gap: 6px; }
  .muted { color: var(--text-muted); margin: 0; font-size: calc(13px * var(--ui-scale, 1)); }
</style>
