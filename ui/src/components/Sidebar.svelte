<script lang="ts">
  // The sidebar's frame (docs/guides/SHELL.md): the vault's name, then the blocks `.atlas/sidebar.page` lists
  // (lib/sidebar.svelte.ts). Collapses to icons (expands while hovered), resizes by its edge.
  import { onMount } from "svelte";
  import { app } from "../lib/state.svelte";
  import VaultBadge from "./VaultBadge.svelte";
  import { getBlock, mountBlock } from "../lib/blocks";
  import { keysOf, tipFor } from "../lib/keymap.svelte";
  import { blockSrc, type PageBlock } from "../lib/page-doc";
  import { sidebar, side, sideCollapsed, sideWide, takeKeyboard, SIDEBAR_FILE } from "../lib/sidebar.svelte";
  import { tabs, setSidebarWidth, toggleSidebar } from "../lib/tabs.svelte";
  import { chooseVault } from "../lib/vaults";
  import Icon from "./Icon.svelte";
  import ContextMenu from "./ContextMenu.svelte";
  import SidePanel from "./sidebar/SidePanel.svelte";
  import { sideInBar } from "../lib/side-panel.svelte";
  import { fullscreen } from "../lib/fullscreen.svelte";

  const collapsed = $derived(sideCollapsed());
  const wide = $derived(sideWide());
  /** the side panel is in this bar: it takes the free height, the tab list only what its rows need */
  const inBar = $derived(wide && sideInBar());
  /** the block that takes the free height (the tab list); the ones after it sit at the bottom */
  const grows = $derived(sidebar.blocks.findIndex((b) => b.type === "tabs"));
  const upper = $derived(grows < 0 ? sidebar.blocks : sidebar.blocks.slice(0, grows + 1));
  const lower = $derived(grows < 0 ? [] : sidebar.blocks.slice(grows + 1));
  const block = (el: HTMLElement, b: PageBlock) => ({ destroy: mountBlock(el, SIDEBAR_FILE, blockSrc(b), "side") });

  onMount(() => {
    const take = () => void takeKeyboard();
    const need = () => { if (collapsed && fullscreen.on && sideInBar()) hold(); };
    // a held bar closes on a press anywhere else, or Escape
    const outside = (e: PointerEvent) => { if (side.held && !nav?.contains(e.target as Node) && !side.menu) release(); };
    const esc = (e: KeyboardEvent) => { if (side.held && e.key === "Escape") release(); };
    window.addEventListener("atlas-tabs-focus", take);
    window.addEventListener("atlas-side-needed", need);
    window.addEventListener("pointerdown", outside, true);
    window.addEventListener("keydown", esc, true);
    return () => {
      window.removeEventListener("atlas-tabs-focus", take);
      window.removeEventListener("atlas-side-needed", need);
      window.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("keydown", esc, true);
    };
  });

  // --- fullscreen: the bar stays icons; it opens on a click on its empty space, or for a tool that needs it
  let nav = $state<HTMLElement>();
  function hold() { side.peek = true; side.held = true; }
  function release() { side.held = false; side.peek = false; }
  function emptyClick(e: MouseEvent) {
    if (side.held && (e.target as HTMLElement).closest("[role=option], .app")) { release(); return; } // chosen: out of the way
    if (!collapsed || !fullscreen.on || side.peek) return;
    if ((e.target as HTMLElement).closest("button, a, input, [role=option], [draggable=true]")) return;
    hold();
  }

  // --- hover expand (collapsed) -----------------------------------------------------------------
  let hoverT: ReturnType<typeof setTimeout> | undefined;
  function enter() { clearTimeout(hoverT); if (collapsed && !side.peek && !fullscreen.on) hoverT = setTimeout(openPeek, 220); }

  // A click aimed at an icon just as the bar opens lands on the row that took the icon's place; while the pointer has
  // not moved since, it goes to what was aimed at (the same tab, app or button in the open bar).
  let pointer = { x: -1, y: -1 };
  let aim: { sel: string; x: number; y: number } | null = null;
  const AIM_ATTRS = ["data-tab-id", "data-app-id", "data-testid", "aria-label"];
  function aimAt(el: Element | null): string | null {
    const t = el?.closest("button, [role=option]");
    const a = t && AIM_ATTRS.find((n) => t.hasAttribute(n));
    return a ? `[${a}="${CSS.escape(t!.getAttribute(a)!)}"]` : null;
  }
  function openPeek() {
    const sel = aimAt(document.elementFromPoint(pointer.x, pointer.y));
    aim = sel ? { sel, ...pointer } : null;
    side.peek = true;
  }
  // what lies over the panes changed: a native view (a web tab) hides under the open bar now, not at its next check
  $effect(() => { void side.peek; window.dispatchEvent(new Event("atlas-layout")); });
  function track(e: PointerEvent) {
    pointer = { x: e.clientX, y: e.clientY };
    if (aim && Math.hypot(e.clientX - aim.x, e.clientY - aim.y) > 4) aim = null;
  }
  function aimedClick(e: MouseEvent) {
    const was = aim;
    aim = null;
    if (!was || !side.peek || aimAt(e.target as Element) === was.sel) return;
    const to = nav?.querySelector<HTMLElement>(was.sel);
    if (!to) return;
    e.preventDefault(); e.stopPropagation();
    to.click();
  }
  function leave() {
    clearTimeout(hoverT);
    if (!collapsed || side.kb || side.held || side.menu || side.dragId) return;
    hoverT = setTimeout(() => (side.peek = false), 260);
  }
  function onFocusOut(e: FocusEvent) {
    const to = e.relatedTarget as Node | null;
    if (side.kb && !(e.currentTarget as HTMLElement).contains(to) && !side.menu) { side.kb = false; side.peek = false; side.cursor = null; side.filtering = false; side.filter = ""; }
  }

  function resize(e: PointerEvent) {
    e.preventDefault();
    const x0 = e.clientX, w0 = tabs.sidebar.width;
    document.body.classList.add("atlas-resizing");
    const move = (ev: PointerEvent) => setSidebarWidth(w0 + ev.clientX - x0);
    const up = () => {
      document.body.classList.remove("atlas-resizing");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }
</script>

<!-- the slot keeps the collapsed width while the full sidebar floats over the panes (peek) -->
<div class="slot" style:width="{collapsed ? 'var(--sb-collapsed-w)' : `${tabs.sidebar.width}px`}">
  <!-- the click on empty space is the mouse's way to open it in fullscreen; the keys have Ctrl+Shift+A -->
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
  <nav class="sidebar" class:wide class:peek={collapsed && side.peek} style:width={wide ? `${tabs.sidebar.width}px` : undefined}
    aria-label="Tabs and tools" onmouseenter={enter} onmouseleave={leave} onfocusout={onFocusOut} onclick={emptyClick}
    onpointermove={track} onclickcapture={aimedClick} bind:this={nav} data-testid="sidebar">
    <header class="head">
      <VaultBadge />
      {#if wide}<button class="ws" onclick={() => void chooseVault()} title="{app.workspace?.root ?? ""} — switch vault ({keysOf("ui.vault") ?? "Ctrl+Alt+V"})">{app.workspace?.name ?? "Atlas"}<Icon name="chevron-down" size={12} /></button>{/if}
      <!-- in fullscreen the bar stays icons, so the button opens it over the page and closes it again (it used to do
           nothing there) -->
      <button class="icon-btn collapse tipped" onclick={(e) => { e.stopPropagation(); if (fullscreen.on) { if (side.held) release(); else hold(); return; } toggleSidebar(); side.peek = false; }} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        data-tip={tipFor(collapsed ? "Keep the sidebar open" : "Collapse to icons", "ui.sidebar")} data-testid="sidebar-toggle">
        <Icon name="panel-left" size={16} />
      </button>
    </header>

    <!-- the shell's own blocks know how to stand as icons; any other block shows when there is room -->
    {#snippet part(b: PageBlock, grow: boolean)}
      <div class="sb-block" class:grow class:guest={!getBlock(b.type)?.bare} use:block={b}></div>
    {/snippet}
    <div class="blocks">
      {#each upper as b, i (b.id)}{@render part(b, i === grows)}{/each}
    </div>
    {#if inBar}<SidePanel />{/if}
    <div class="sb-foot">
      {#each lower as b (b.id)}{@render part(b, false)}{/each}
    </div>
    {#if sidebar.error && wide}<p class="sb-error">{sidebar.error}</p>{/if}
    {#if !collapsed}<div class="edge" role="separator" aria-orientation="vertical" aria-label="Resize sidebar" onpointerdown={resize} ondblclick={() => setSidebarWidth(248)}></div>{/if}
  </nav>
</div>
{#if side.menu}<ContextMenu x={side.menu.x} y={side.menu.y} items={side.menu.items} onclose={() => (side.menu = null)} />{/if}

<style>
  /* stretched by .main (no height: 100% — see App.svelte's dock note on WebKitGTK) */
  .slot { flex: none; position: relative; align-self: stretch; min-height: 0; --sb-collapsed-w: 52px; }
  .sidebar { position: absolute; inset: 0 auto 0 0; width: var(--sb-collapsed-w); display: flex; flex-direction: column; background: var(--bg-app); z-index: 30; overflow: hidden; min-height: 0;
    user-select: none; transition: box-shadow .15s; }
  .sidebar.peek { box-shadow: var(--shadow-pop); border-right: 1px solid var(--border-strong); background: var(--bg-app); z-index: 60; border-radius: 0 var(--radius-lg) var(--radius-lg) 0; }

  .head { display: flex; align-items: center; gap: 9px; height: 46px; padding: 0 6px 0 calc(var(--side-inset) - 7px); flex: none; } /* the mark over the tools' column */
  /* collapsed: the mark alone, in the open head's row (the toggle shows when the bar opens over the panes) */
  .sidebar:not(.wide) .head { position: relative; justify-content: center; padding: 0; }
  .sidebar:not(.wide) .collapse { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); opacity: 0; transition: opacity .12s; }
  .sidebar:not(.wide) .head:hover .collapse, .sidebar:not(.wide) .collapse:focus-visible { opacity: 1; }
  .sidebar:not(.wide) .head:hover :global(.badge) { opacity: 0; }
  .ws { flex: 1; min-width: 0; display: flex; align-items: center; gap: 4px; min-height: 26px; padding: 0 6px; margin-left: -6px; border-radius: 6px; text-align: left; font-weight: 600; font-size: calc(13px * var(--ui-scale, 1)); color: var(--heading); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ws:hover { background: var(--bg-hover); }
  .ws :global(svg) { flex: none; color: var(--text-faint); }
  .head .tipped::after { left: auto; right: 0; top: calc(100% + 6px); transform: none; }
  .sidebar:not(.wide) .head .tipped::after { left: calc(100% + 10px); right: auto; top: 50%; transform: translateY(-50%); }

  /* a column of blocks: the tab list takes what is left (the column scrolls when crowded); what
     follows the tab list stays at the bottom */
  .blocks { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow-y: auto; overflow-x: hidden; scrollbar-width: none; }
  .sb-foot { flex: none; max-height: 50%; overflow-y: auto; scrollbar-width: none; }
  .sb-block { flex: none; }
  .sb-block.grow { flex: 1 1 0; min-height: 96px; }
  .sb-block.grow > :global(.block-body) { height: 100%; }
  .sb-block.guest { padding: 0 8px 8px; }
  .sidebar:not(.wide) .sb-block.guest { display: none; }
  .sb-foot :global(.side-toolbar.wide) { padding-top: 6px; border-top: 1px solid var(--border); }
  .sb-foot :global(.side-toolbar:not(.wide)) { padding: 6px 0 8px; }
  .sb-foot :global(.side-toolbar.wide .tipped::after) { top: auto; bottom: calc(100% + 6px); }
  .sb-error { margin: 0; padding: 6px 10px; color: var(--red); font-size: calc(11.5px * var(--ui-scale, 1)); }

  .edge { position: absolute; top: 0; bottom: 0; right: -3px; width: 6px; cursor: col-resize; z-index: 2; }
  .edge:hover { background: linear-gradient(to right, transparent 2px, color-mix(in srgb, var(--accent) 45%, transparent) 2px 4px, transparent 4px); transition: background .12s .25s; }
</style>
