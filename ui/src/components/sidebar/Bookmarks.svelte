<script lang="ts">
  // The `bookmarks` block: the vault's bookmarks (lib/bookmarks.svelte.ts) — files, headings, saved
  // searches, commands, web pages. Click opens; the menu removes one or opens the file they live in.
  import type { BlockHost } from "../../lib/blocks";
  import { atPointer, type MenuAt } from "../../lib/menu";
  import { bookmarks, bookmarkTitle, bookmarkIcon, bookmarkDetail, openBookmark, removeBookmark, editBookmarks, type Bookmark } from "../../lib/bookmarks.svelte";
  import { keysOf } from "../../lib/keymap.svelte";
  import { side, sideWide } from "../../lib/sidebar.svelte";
  import ContextMenu from "../ContextMenu.svelte";
  import Icon from "../Icon.svelte";

  let { host }: { host: BlockHost } = $props();
  const inSidebar = $derived(host === "side");
  const wide = $derived(!inSidebar || sideWide());
  const list = $derived(bookmarks.list);
  // in the sidebar the menu is the sidebar's (it keeps a hovered-open sidebar open); elsewhere our own
  let own = $state<MenuAt | null>(null);
  function menu(e: MouseEvent, b: Bookmark) {
    e.preventDefault();
    const m = atPointer(e, [
      { label: "Open", icon: bookmarkIcon(b), run: () => void openBookmark(b) },
      { label: "Remove bookmark", icon: "close" as const, run: () => void removeBookmark(b) },
      "sep" as const,
      { label: "Edit the bookmarks file", icon: "edit" as const, run: () => void editBookmarks() },
    ]);
    if (inSidebar) side.menu = m; else own = m;
  }
</script>

{#if list.length || !inSidebar}
  <div class="bookmarks" class:wide data-testid="bookmarks">
    {#if wide}<div class="side-head"><span>Bookmarks</span></div>{:else}<div class="sep"></div>{/if}
    {#each list as b}
      <button class="side-row bm" title={bookmarkDetail(b)} onclick={() => void openBookmark(b)} oncontextmenu={(e) => menu(e, b)}>
        <span class="bm-icon"><Icon name={bookmarkIcon(b)} size={15} /></span>
        {#if wide}<span class="bm-title">{bookmarkTitle(b)}</span>{/if}
      </button>
    {:else}
      <p class="hint">No bookmarks yet. {keysOf("ui.bookmark.add") ?? "“Bookmark: add…”"} keeps the current tab, a heading or a search.</p>
    {/each}
  </div>
{/if}
{#if own}<ContextMenu x={own.x} y={own.y} items={own.items} onclose={() => (own = null)} />{/if}

<style>
  .bookmarks { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 0 0 6px; }
  .bookmarks.wide { align-items: stretch; gap: 1px; padding: 0 8px 8px; }
  .bm { width: 36px; text-align: left; }
  .wide .bm { width: 100%; }
  .bm-icon { display: inline-flex; color: var(--text-faint); flex: none; }
  .bm-title { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sep { width: 20px; height: 1px; background: var(--border-strong); margin: 2px 0; }
  .hint { margin: 0; padding: 4px 9px; color: var(--text-faint); font-size: calc(12px * var(--ui-scale, 1)); line-height: 1.4; }
</style>
