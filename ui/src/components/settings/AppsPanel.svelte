<script lang="ts">
  // The apps at the top of the left bar: every one the vault has (Home, built-ins, plugins' panes), hidden ones too,
  // with a switch and its place — `[ui] apps_hidden` / `apps_order`, the same lists the tiles' right-click changes.
  import Icon from "../Icon.svelte";
  import { allApps, ordered, appHidden, setAppHidden, moveApp } from "../../lib/apps.svelte";

  const apps = $derived(ordered(allApps()));
</script>

<section class="settings-panel apps-panel">
  <h3>Apps in the left bar</h3>
  <p class="desc">The tiles above the tabs. A hidden app still opens from the palette and its keys; a plugin's pane gets a tile when its manifest says <code>rail = true</code>.</p>
  <ol class="list" aria-label="Apps">
    {#each apps as a, i (a.key)}
      <li class="row" class:off={appHidden(a.key)} data-app-key={a.key}>
        <label class="on"><input type="checkbox" checked={!appHidden(a.key)} onchange={(e) => setAppHidden(a.key, !e.currentTarget.checked)} aria-label="Show {a.title}" />
          <Icon name={a.icon} size={15} /><span class="nm">{a.title}</span></label>
        {#if a.keys}<kbd>{a.keys}</kbd>{/if}
        <button class="mv" aria-label="Move {a.title} up" title="Move up" disabled={i === 0} onclick={() => moveApp(a.key, -1)}><Icon name="arrow-up" size={13} /></button>
        <button class="mv" aria-label="Move {a.title} down" title="Move down" disabled={i === apps.length - 1} onclick={() => moveApp(a.key, 1)}><Icon name="arrow-down" size={13} /></button>
      </li>
    {/each}
  </ol>
</section>

<style>
  h3 { margin: 10px 0 2px; } /* its look: SettingsPage */
  .desc { margin: 0 0 6px; color: var(--text-faint); font-size: calc(12.5px * var(--ui-scale, 1)); }
  .list { list-style: none; margin: 0; padding: 0; }
  .row { display: flex; align-items: center; gap: 6px; padding: 3px 0; }
  .row.off .nm { color: var(--text-faint); }
  .on { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; }
  .nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  kbd { color: var(--text-faint); font-size: .85em; }
  .mv { display: grid; place-items: center; width: 24px; height: 24px; border-radius: 6px; color: var(--text-muted); }
  .mv:hover:not(:disabled) { background: var(--bg-hover); color: var(--text); }
  .mv:disabled { opacity: .35; }
</style>
