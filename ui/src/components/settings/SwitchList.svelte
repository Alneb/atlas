<script lang="ts">
  // A list of things each with a switch and its place: the apps in the left bar (`[ui] apps_hidden` / `apps_order`,
  // the same lists the tiles' right-click changes) and the Library page's libraries (`[ui] libraries`).
  import Icon from "../Icon.svelte";
  import type { IconName } from "../../lib/panes";

  interface Entry { key: string; title: string; icon: IconName; keys?: string }
  let { title, desc, label, items, hidden, setHidden, move, movable = () => true }: {
    title: string; desc: string; label: string; items: Entry[];
    hidden: (key: string) => boolean; setHidden: (key: string, hidden: boolean) => void; move: (key: string, by: -1 | 1) => void;
    /** Whether an entry has a place to move (a library the page does not show has none). */
    movable?: (key: string) => boolean;
  } = $props();
</script>

<section class="settings-panel switch-list">
  <h3>{title}</h3>
  <p class="desc">{@html desc}</p>
  <ol class="list" aria-label={label}>
    {#each items as a, i (a.key)}
      <li class="row" class:off={hidden(a.key)} data-key={a.key}>
        <label class="on"><input type="checkbox" checked={!hidden(a.key)} onchange={(e) => setHidden(a.key, !e.currentTarget.checked)} aria-label="Show {a.title}" />
          <Icon name={a.icon} size={15} /><span class="nm">{a.title}</span></label>
        {#if a.keys}<kbd>{a.keys}</kbd>{/if}
        <button class="mv" aria-label="Move {a.title} up" title="Move up" disabled={i === 0 || !movable(a.key)} onclick={() => move(a.key, -1)}><Icon name="arrow-up" size={13} /></button>
        <button class="mv" aria-label="Move {a.title} down" title="Move down" disabled={i === items.length - 1 || !movable(a.key)} onclick={() => move(a.key, 1)}><Icon name="arrow-down" size={13} /></button>
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
