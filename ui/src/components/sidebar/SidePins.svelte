<script lang="ts">
  // The `pins` block (Zen's Essentials): first the apps — Home, the Library, the plugins' views (Email) —
  // as icon tiles, always there (lib/apps.svelte.ts); then the pinned tabs, kept in the vault's bookmarks
  // file, a resting one reopening on click. Drop a tab here to pin it. Neither is a row of the tab list.
  import type { BlockHost } from "../../lib/blocks";
  import { atPointer } from "../../lib/menu";
  import { keysOf } from "../../lib/keymap.svelte";
  import { basename, shownName } from "../../lib/paths";
  import { side, sideWide, pinTiles, onListKey, openMenu, dragStart, dragEnd, acceptDrag, pinsOver, pinsDrop, middleClose, monogram } from "../../lib/sidebar.svelte";
  import { tabs, activate, closeTab } from "../../lib/tabs.svelte";
  import { appLaunchers, type AppTile } from "../../lib/apps.svelte";
  import Icon from "../Icon.svelte";

  let { host }: { host: BlockHost } = $props();
  const wide = $derived(host !== "side" || sideWide());
  const pins = $derived(pinTiles());
  /** the launchers, then any other open app (a plugin's pane on an account or a host) */
  const apps = $derived.by((): AppTile[] => {
    const l = appLaunchers();
    const more = tabs.apps.filter((t) => !l.some((a) => a.ids.includes(t.id))).map((t): AppTile => ({ ids: [t.id], title: t.title, icon: t.icon, open: () => activate(t.id) }));
    return [...l, ...more];
  });
  /** the tile's open tab: the shown one first, else any */
  const openId = (a: AppTile) => (a.ids.includes(tabs.active ?? "") ? tabs.active : a.ids.find((id) => tabs.apps.some((t) => t.id === id))) ?? null;
  const isActive = (a: AppTile) => a.ids.includes(tabs.active ?? "");
  const go = (a: AppTile) => { const id = openId(a); if (id) activate(id); else a.open(); };
  const appTip = (a: AppTile) => `${a.title}${a.keys ? ` · ${a.keys}` : ""}${openId(a) ? "" : " (opens it)"}`;
  function appMenu(e: MouseEvent, a: AppTile): void {
    e.preventDefault();
    const id = openId(a);
    if (id) side.menu = atPointer(e, [{ label: `Close ${a.title}`, icon: "close", run: () => closeTab(id) }]);
  }
</script>

{#if apps.length}
  <div class="apps" class:wide role="toolbar" aria-label="Apps" data-testid="apps">
    {#each apps as a (a.ids[0])}
      {@const id = openId(a)}
      <button class="app" class:active={isActive(a)} class:open={!!id} aria-label={a.title} aria-pressed={isActive(a)} title={appTip(a)}
        data-app-id={a.ids[0]} onclick={() => go(a)} onauxclick={(e) => { if (e.button === 1 && id) { e.preventDefault(); closeTab(id); } }}
        onmousedown={(e) => { if (e.button === 1) e.preventDefault(); }} oncontextmenu={(e) => appMenu(e, a)}><Icon name={a.icon} size={16} /></button>
    {/each}
  </div>
{/if}

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="pins" class:wide class:empty={!pins.length} class:dropping={!!side.dragId} role="listbox" tabindex="-1" aria-label="Pinned tabs" onkeydown={onListKey}
  ondragenter={acceptDrag} ondragover={pinsOver} ondragleave={() => (side.pinMark = null)} ondrop={pinsDrop} data-testid="pins">
  {#each pins as p, i (p.id)}
    {#if side.pinMark === i}<span class="pin-mark"></span>{/if}
    <button class="pin" class:active={tabs.active === p.id} class:resting={!p.open} class:cursor={side.cursor === p.id} data-tab-id={p.id}
      role="option" aria-selected={tabs.active === p.id} tabindex="-1" title={p.open ? p.tip : `${p.tip} (pinned — click to open)`}
      draggable="true" ondragstart={(e) => dragStart(e, p.id)} ondragend={dragEnd}
      onclick={() => activate(p.id)} onauxclick={(e) => middleClose(e, p.id)} onmousedown={(e) => { if (e.button === 1) e.preventDefault(); }}
      oncontextmenu={(e) => openMenu(e, { id: p.id, path: p.tip !== p.title ? p.tip : undefined })}>
      {#if !wide && p.tip !== p.title}<span class="mono-chip">{monogram(p.title)}</span>{:else}<Icon name={p.icon} size={wide ? 14 : 16} />{/if}
      {#if wide}<span class="pin-title">{p.title === basename(p.tip) ? shownName(p.tip) : p.title}</span>{/if}
    </button>
  {/each}
  {#if side.pinMark !== null && side.pinMark >= pins.length}<span class="pin-mark"></span>{/if}
  <!-- nothing pinned: no standing box; while a tab is dragged, the place to drop it (and the key) shows -->
  {#if !pins.length && wide && side.dragId}
    <span class="pins-hint">Drop here to pin · {keysOf("ui.tabs.pin") ?? "right-click → Pin"}</span>
  {/if}
</div>

<style>
  /* apps: icon tiles sharing a row (a column when collapsed); an open one is underlined, the shown one lit.
     Native tips (title): the bar's scrolling column would clip a drawn one */
  .apps { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 2px 0 6px; }
  .apps.wide { display: grid; grid-template-columns: repeat(auto-fill, minmax(36px, 1fr)); gap: 4px; padding: 2px 8px 8px; }
  .app { position: relative; height: 32px; width: 36px; border-radius: 9px; display: grid; place-items: center; padding: 0;
    background: var(--bg-hover); border: 1px solid var(--border); color: var(--text-muted); transition: background .12s, border-color .12s, color .12s; }
  .apps.wide .app { width: auto; }
  .app:hover { background: var(--bg-active); color: var(--text); }
  .app.open::before { content: ""; position: absolute; bottom: 3px; left: 50%; width: 10px; height: 2px; margin-left: -5px; border-radius: 2px; background: var(--text-faint); }
  .app.active { background: var(--accent-soft); border-color: color-mix(in srgb, var(--accent) 45%, transparent); color: var(--accent); }
  .app.active::before { background: var(--accent); }
  .pins { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 4px 0 6px; position: relative; outline: none; }
  /* in the open bar a pin is a small chip, icon then name: several to a row, one line high */
  .pins.wide { display: grid; grid-template-columns: repeat(auto-fill, minmax(92px, 1fr)); gap: 4px; padding: 2px 8px 8px; }
  .pins.wide.empty { display: none; }
  /* the drop place floats over the rows below: appearing as a drag starts, it must not move what is being aimed at */
  .pins.wide.empty.dropping { display: block; height: 0; padding: 0; z-index: 3; }
  .pins.wide.empty.dropping .pins-hint { position: absolute; top: 0; left: 8px; right: 8px; background: var(--bg-app); }
  .pins.empty:not(.wide) { display: none; }
  .pin { width: 36px; height: 36px; border-radius: 10px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; padding: 0; min-width: 0;
    background: var(--bg-hover); border: 1px solid var(--border); color: var(--text-muted); transition: background .12s, border-color .12s, color .12s; }
  .wide .pin { width: auto; height: 28px; flex-direction: row; justify-content: flex-start; gap: 6px; padding: 0 8px; border-radius: 8px; }
  .pin:hover { background: var(--bg-active); color: var(--text); }
  .pin.active { background: var(--accent-soft); border-color: color-mix(in srgb, var(--accent) 45%, transparent); color: var(--accent); }
  .pin.active :global(.mono-chip) { color: var(--accent); }
  .pin.resting { opacity: .62; }
  .pin.resting:hover { opacity: 1; }
  .pin.cursor { outline: 2px solid color-mix(in srgb, var(--accent) 60%, transparent); outline-offset: -2px; }
  .pin-title { min-width: 0; font-size: calc(12px * var(--ui-scale, 1)); line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--text-muted); }
  .pin.active .pin-title { color: var(--text); }
  .pin-mark { position: absolute; width: 2px; height: 0; } /* grid insert point: the tile after it shows the line */
  .pin-mark + .pin { box-shadow: -4px 0 0 -1px var(--accent); }
  .pins-hint { display: block; padding: 8px 10px; border: 1px dashed var(--border-strong); border-radius: 10px; color: var(--text-faint); font-size: calc(11.5px * var(--ui-scale, 1)); text-align: center; line-height: 1.35; }
</style>
