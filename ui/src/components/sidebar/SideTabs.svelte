<script lang="ts">
  // The `tabs` block (docs/design/VERTICAL-TABS.md): every open tab grouped by split; drag to reorder or to
  // another split, middle-click closes, double-click renames a terminal; j/k, Enter, x, p, / by keyboard.
  import type { BlockHost } from "../../lib/blocks";
  import { below } from "../../lib/menu";
  import { open, nextTerminalN, dockTerminal, toggleTerminalPanel } from "../../lib/dock";
  import { keysOf } from "../../lib/keymap.svelte";
  import type { PaneZone } from "../../lib/panes";
  import { openPalette } from "../../lib/palette.svelte";
  import { settings } from "../../lib/settings.svelte";
  import {
    side, sideWide, tabGroups, flatIds, onListKey, onFilterKey, openMenu, startRename, finishRename,
    dragStart, dragEnd, acceptDrag, rowOver, halfOver, rowDrop, groupDrop, middleClose, monogram,
  } from "../../lib/sidebar.svelte";
  import { app } from "../../lib/state.svelte";
  import { tabs, activate, closeTab, closeHalf, unsplit, splitPair, type TabGroup, type TabItem } from "../../lib/tabs.svelte";
  import { flip } from "svelte/animate";
  import Icon from "../Icon.svelte";
  import { pluginMenu } from "../../lib/plugin-menus";
  import { agentsOn as agents } from "../../lib/agents";

  let { host }: { host: BlockHost } = $props();
  const wide = $derived(host !== "side" || sideWide());
  const groups = $derived(tabGroups());
  const flat = $derived(flatIds());
  /** The Terminal heading's "+": what to start there (a menu under the button). */
  function newTerminalMenu(e: MouseEvent): void {
    const start = (preset: "shell") => () => { open({ kind: "terminal", preset, n: nextTerminalN() }); };
    side.menu = below(e, [
      { label: "Shell", detail: `in ${app.workspace?.name ?? "the vault"}'s folder`, icon: "terminal", hint: keysOf("ui.terminal.new"), run: start("shell") },
      // the AI agents the plugins declare (agent_terminals.rs); without one, where to switch one on
      ...(agents().length
        ? agents().map((a) => ({ label: `${a.title} session`, detail: `the ${a.plugin} plugin`, icon: "claude" as const, hint: a.id === "claude" ? keysOf("ui.claude.new") : undefined,
            run: () => { open({ kind: "terminal", preset: "claude", agent: a.ref, n: nextTerminalN(), title: a.title === "Claude" ? undefined : a.title }); } }))
        : [{ label: "AI agent…", detail: "switch on an agent plugin (Claude) in Settings → Plugins", icon: "claude" as const, run: () => open({ kind: "settings" }) }]),
      ...pluginMenu("terminal", {}), // e.g. the SSH plugin: one row per host
    ], 4);
  }
  // One section per zone, in one order: terminal, then the editors; the side panel is not here (its tools
  // are the row on top of it, SideHead.svelte). A zone split in several groups is ONE section, as in Zen:
  // what each half shows is joined in one split row (with its unsplit button), the tabs behind them listed
  // below.
  type Entry = { g: TabGroup; t: TabItem };
  type Section = { zone: PaneZone; label: string; groups: TabGroup[]; visible: boolean; split: Entry[]; rest: Entry[] };
  const RANK: Record<PaneZone, number> = { side: 0, bottom: 1, main: 2 };
  const LABEL: Record<PaneZone, string> = { side: "Side panel", bottom: "Terminal", main: "Editor" };
  const sections = $derived.by((): Section[] => {
    const zones = [...new Set(groups.map((g) => g.zone))].sort((a, b) => RANK[a] - RANK[b]);
    const out = zones.map((zone): Section => {
      const gs = groups.filter((g) => g.zone === zone), shown = gs.filter((g) => g.visible);
      // the pair while one tab is shown alone (tabs.svelte.ts splitPair): still the split row, a click brings it back
      const split = shown.length > 1 ? shown.flatMap((g) => g.tabs.filter((t) => t.shown).map((t) => ({ g, t })))
        : zone === "main" && splitPair.ids.length > 1 ? gs.flatMap((g) => g.tabs.filter((t) => splitPair.ids.includes(t.id)).map((t) => ({ g, t }))) : [];
      const inSplit = new Set(split.map((e) => e.t.id));
      return { zone, label: LABEL[zone], groups: gs, visible: shown.length > 0, split, rest: gs.flatMap((g) => g.tabs.filter((t) => !inSplit.has(t.id)).map((t) => ({ g, t }))) };
    }).filter((x) => x.split.length || x.rest.length || x.zone !== "main"); // only an app (Home) open: no bare "Editor"
    // the terminal keeps its heading (and its buttons) in its place with nothing open
    if (wide && !side.filter && !out.some((x) => x.zone === "bottom")) out.unshift({ zone: "bottom", label: LABEL.bottom, groups: [], visible: false, split: [], rest: [] });
    return out;
  });
  $effect(() => { if (side.filtering && flat.length && (!side.cursor || !flat.includes(side.cursor))) side.cursor = flat[0]; });
</script>

<!-- a group's heading: its name, show / hide for the terminal, and what can be opened in it -->
<!-- a tab: a row of the list, or a half of the split row (`half`: the title only, the close on hover) -->
{#snippet tabRow(g: TabGroup, t: TabItem, half: boolean)}
  <div class="tab side-row" class:half class:active={tabs.active === t.id} class:cursor={side.cursor === t.id} class:dirty={!!app.dirty[t.id]}
    class:mark-before={side.mark?.id === t.id && !side.mark.after} class:mark-after={side.mark?.id === t.id && side.mark.after} class:dragging={side.dragId === t.id} class:drop-into={half && side.into === t.id}
    data-tab-id={t.id} role="option" aria-selected={tabs.active === t.id} tabindex="-1" title={settings.config?.ui.tab_preview === false || half ? t.tip : undefined}
    draggable={side.renaming !== t.id} ondragstart={(e) => dragStart(e, t.id)} ondragend={dragEnd} ondragenter={acceptDrag}
    ondragover={(e) => (half ? halfOver(e, t.id) : rowOver(e, t.id))} ondrop={(e) => (half ? groupDrop(e, g) : rowDrop(e, g, t))}
    onclick={() => activate(t.id)} onauxclick={(e) => middleClose(e, t.id)} onmousedown={(e) => { if (e.button === 1) e.preventDefault(); }}
    ondblclick={() => startRename(t.id)} oncontextmenu={(e) => openMenu(e, t)} onkeydown={(e) => { if (e.key === " ") { e.preventDefault(); activate(t.id); } }}>
    {#if !wide && t.path}<span class="mono-chip" class:active={tabs.active === t.id}>{monogram(t.title)}</span>
    {:else}<span class="tab-icon"><Icon name={t.icon} size={15} /></span>{/if}
    {#if wide}
      {#if side.renaming === t.id}
        <input class="tab-rename" bind:value={side.renameValue} aria-label="Terminal name"
          onkeydown={(e) => { e.stopPropagation(); if (e.key === "Enter") finishRename(true); else if (e.key === "Escape") finishRename(false); }}
          onblur={() => finishRename(true, true)} onclick={(e) => e.stopPropagation()} />
      {:else}
        <span class="tab-title">{t.title}{#if t.hint && !half}<span class="tab-hint">{t.hint}</span>{/if}</span>
      {/if}
      <!-- closes on the press: inside a draggable row WebKit (the desktop app) may start a drag and
           never deliver the click -->
      <!-- a half's × closes that half and ends the split -->
      <button class="tab-close" tabindex="-1" aria-label="Close {t.title}" title={half ? "Close this half: the split ended" : `Close · ${keysOf("ui.close") ?? "Super+Q"} (or middle-click)`}
        onmousedown={(e) => { if (e.button !== 0) return; e.preventDefault(); e.stopPropagation(); if (half) void closeHalf(t.id); else closeTab(t.id); }}
        onclick={(e) => e.stopPropagation()} draggable="false"><Icon name="close" size={13} /></button>
    {:else if app.dirty[t.id]}
      <span class="dot-badge"></span>
    {/if}
  </div>
{/snippet}

{#snippet head(zone: string, label: string, visible: boolean, drop?: (e: DragEvent) => void)}
  <div class="group-head side-head" role="presentation" ondragenter={(e) => { if (side.dragId && drop) e.preventDefault(); }} ondragover={(e) => { if (side.dragId && drop) e.preventDefault(); }} ondrop={drop}>
    <span>{label}</span>
    {#if zone === "bottom"}
      {@const right = settings.config?.terminal.position === "right"}
      <button class="icon-btn small-btn" class:off={!visible} onclick={toggleTerminalPanel} aria-label="{visible ? 'Hide' : 'Show'} the terminal panel" title="{visible ? 'Hide' : 'Show'} the terminal panel · {keysOf('ui.panel') ?? 'Super+J'} (the shells keep running)"><Icon name={visible ? "minus" : "chevron-down"} size={13} /></button>
      <button class="icon-btn small-btn" onclick={() => dockTerminal(right ? "bottom" : "right")} aria-label={right ? "Dock terminal at the bottom" : "Dock terminal on the right"} title={right ? "Dock at the bottom" : "Dock on the right"}><Icon name={right ? "panel-bottom" : "panel-right"} size={13} /></button>
      <button class="icon-btn small-btn" onclick={newTerminalMenu} aria-haspopup="menu" aria-label="New terminal" title="New terminal: a shell or a Claude session"><Icon name="plus" size={13} /></button>
    {/if}
  </div>
{/snippet}

<div class="tabs-list" class:wide role="listbox" tabindex="-1" aria-label="Open tabs" onkeydown={onListKey}>
  {#if wide}
    <button class="new-tab" onclick={() => openPalette("files")} data-testid="new-tab">
      <Icon name="plus" size={15} /><span>Open a file</span><kbd>{keysOf("ui.quickOpen") ?? "Ctrl+P"}</kbd>
    </button>

  {:else}
    <button class="side-tool tipped new-tab-icon" onclick={() => openPalette("files")} aria-label="Open a file" data-tip="Open a file · {keysOf('ui.quickOpen') ?? ''}"><Icon name="plus" size={16} /></button>
  {/if}

  {#if side.filtering && wide}
    <input class="side-filter" bind:value={side.filter} placeholder="Filter tabs…" aria-label="Filter tabs" onkeydown={onFilterKey} spellcheck="false" />
  {/if}

  {#each sections as sec (sec.zone)}
    <div class="group" class:hidden-group={!sec.visible && sec.groups.length > 0} role="group" aria-label={sec.label}>
      {#if wide}{@render head(sec.zone, sec.label, sec.visible, sec.groups.length ? (e: DragEvent) => groupDrop(e, sec.groups[0]) : undefined)}
      {:else if sections.length > 1}<div class="group-sep"></div>{/if}
      {#if sec.split.length}
        <!-- the split: what each half shows, side by side; a tab dropped on a half goes into that half -->
        <div class="split-row" class:wide role="group" aria-label="Split view" data-testid="split-row">
          {#each sec.split as e (e.t.id)}{@render tabRow(e.g, e.t, true)}{/each}
          <button class="unsplit" class:wide onclick={() => unsplit(sec.zone)} aria-label="Unsplit" title="Unsplit: one {sec.zone === 'bottom' ? 'terminal panel' : 'editor'} again, the tabs kept"><Icon name="close" size={11} /></button>
        </div>
      {/if}
      <!-- rows slide to their new place (a move, a drop, a close) instead of jumping -->
      {#each sec.rest as e (e.t.id)}<div class="slide" animate:flip={{ duration: 160 }}>{@render tabRow(e.g, e.t, false)}</div>{/each}
      <!-- the room under the last row takes a drop too: the tab goes to the end of the section -->
      {#if wide && side.dragId && sec.groups.length}
        <div class="end-drop" class:on={side.end === sec.zone} role="presentation" ondragenter={acceptDrag}
          ondragover={(e) => { if (side.dragId) { e.preventDefault(); side.mark = null; side.into = null; side.end = sec.zone; } }}
          ondragleave={() => { if (side.end === sec.zone) side.end = null; }} ondrop={(e) => groupDrop(e, sec.groups[sec.groups.length - 1])}></div>
      {/if}
    </div>
  {/each}
  {#if side.filter && !flat.length}<div class="none">No tab matches “{side.filter}”</div>{/if}
</div>

<style>
  .tabs-list { height: 100%; overflow-y: auto; overflow-x: hidden; padding: 0 0 8px; outline: none; display: flex; flex-direction: column; align-items: center; scrollbar-width: none; }
  .tabs-list.wide { display: block; padding: 0 8px 8px; scrollbar-width: auto; }

  .new-tab { display: flex; align-items: center; gap: 8px; width: 100%; height: 32px; padding: 0 8px 0 calc(var(--side-inset) - 8px); border-radius: 8px; color: var(--text-muted); font-size: calc(13px * var(--ui-scale, 1)); }
  .new-tab span { flex: 1; text-align: left; }
  .new-tab kbd { opacity: 0; transition: opacity .12s; }
  .new-tab:hover { background: var(--bg-hover); color: var(--text); }
  .new-tab:hover kbd { opacity: 1; }
  .new-tab-icon { margin: 2px 0 4px; }

  .side-filter { width: 100%; height: 30px; margin: 4px 0 6px; padding: 0 10px; border-radius: 8px; border: 1px solid var(--accent); background: var(--bg); color: var(--text); font: inherit; font-size: calc(13px * var(--ui-scale, 1)); outline: none; }

  .group { display: flex; flex-direction: column; align-items: center; gap: 4px; }
  .wide .group { align-items: stretch; gap: 1px; }
  .group-head { margin: 8px -8px 0; } /* full width: its label on the bar's one left edge, like every heading */
  .group-head span:first-child { flex: 1; }
  .small-btn.off { color: var(--accent); }
  .small-btn { width: 20px; height: 20px; }
  .group-sep { width: 20px; height: 1px; background: var(--border-strong); margin: 6px 0 2px; }
  .hidden-group .tab { opacity: .6; }

  /* the split row (Zen's split view): the halves side by side in one rounded frame; collapsed, stacked */
  .split-row { position: relative; display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 3px; border-radius: 10px; border: 1px solid var(--border-strong); }
  .split-row.wide { flex-direction: row; align-items: stretch; margin: 1px 0 3px; }
  .split-row.wide .tab.half { flex: 1 1 0; min-width: 0; padding-right: 4px; }
  .split-row .tab.half:not(.active) { background: transparent; }
  .split-row .tab.half .tab-close { display: none; }
  .split-row .tab.half:hover .tab-close { display: grid; }
  .unsplit { display: grid; place-items: center; width: 16px; height: 16px; border-radius: 50%; color: var(--text-faint); background: var(--bg-app); border: 1px solid var(--border-strong); flex: none; }
  .unsplit.wide { position: absolute; top: -7px; right: -6px; opacity: 0; transition: opacity .12s; }
  .split-row:hover .unsplit, .unsplit:focus-visible { opacity: 1; }
  .unsplit:hover { color: var(--text); background: var(--bg-active); }
  .slide { display: block; }
  .end-drop { height: 28px; margin-top: 2px; border-radius: 8px; }
  .end-drop.on { box-shadow: inset 0 2px 0 var(--accent); }
  .tab.half.drop-into { box-shadow: inset 0 0 0 2px var(--accent); }
  .tab.active { background: var(--bg); color: var(--heading); border-color: var(--border); box-shadow: var(--shadow-sm); }
  .tab.cursor { outline: 2px solid color-mix(in srgb, var(--accent) 60%, transparent); outline-offset: -2px; }
  .tab.dragging { opacity: .45; }
  .tab.mark-before::before, .tab.mark-after::before { content: ""; position: absolute; left: 6px; right: 6px; height: 2px; border-radius: 2px; background: var(--accent); }
  .tab.mark-before::before { top: -2px; }
  .tab.mark-after::before { bottom: -2px; }
  .tab-icon { display: inline-flex; color: var(--text-faint); flex: none; }
  .tab.active .tab-icon { color: var(--accent); }
  .tab-title { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tab.active .tab-title { font-weight: 500; }
  .tab-hint { margin-left: 6px; color: var(--text-faint); font-weight: 400; font-size: .88em; }
  .tab-rename { flex: 1; min-width: 0; font: inherit; color: var(--text); background: var(--bg); border: 1px solid var(--accent); border-radius: 5px; padding: 1px 6px; outline: none; }
  .tab-close { position: relative; display: grid; place-items: center; width: 22px; height: 22px; border-radius: 6px; color: var(--text-faint); opacity: .35; flex: none; transition: opacity .1s, background .1s; }
  .tab:hover .tab-close, .tab.active .tab-close { opacity: 1; }
  .tab-close:hover { background: var(--bg-active); color: var(--text); }
  /* unsaved: a dot that becomes the close button on hover (as on the horizontal tabs) */
  .tab.dirty .tab-close { opacity: 1; }
  .tab.dirty .tab-close :global(svg) { opacity: 0; }
  .tab.dirty .tab-close::before { content: ""; position: absolute; width: 7px; height: 7px; border-radius: 50%; background: var(--text-muted); }
  .tab.dirty .tab-close:hover :global(svg) { opacity: 1; }
  .tab.dirty .tab-close:hover::before { display: none; }
  .dot-badge { position: absolute; top: 6px; right: 6px; width: 6px; height: 6px; border-radius: 50%; background: var(--text-muted); }
  .tab.active .mono-chip { color: var(--accent); }
  .none { padding: 10px; color: var(--text-faint); font-size: calc(12px * var(--ui-scale, 1)); }
</style>
