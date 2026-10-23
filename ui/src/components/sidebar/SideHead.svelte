<script lang="ts">
  // The side panel's heading, the same row wherever the panel is (in the left bar, or beside the editors):
  // its tools — Files, Search, Outline, Git, then the plugins' — and on the right hide and "move to the other
  // place". The tools are not tabs: they are this row, never rows of the tab list.
  import { openSide, toggleSidePanel } from "../../lib/dock";
  import { atPointer, below } from "../../lib/menu";
  import { keysOf } from "../../lib/keymap.svelte";
  import { paneIcon, paneTitle, type IconName } from "../../lib/panes";
  import { SIDE_KINDS, sideInBar, sidePanel, placeSidePanel, type SideId } from "../../lib/side-panel.svelte";
  import { sideTools, toolId } from "../../lib/side-tools.svelte";
  import { tabs } from "../../lib/tabs.svelte";
  import { side } from "../../lib/sidebar.svelte";
  import { zoneGroup } from "../../lib/dock-instance";
  import { paneElement } from "../../lib/dock-panels";
  import type { MenuItem } from "../ContextMenu.svelte";
  import Icon from "../Icon.svelte";

  const inBar = $derived(sideInBar());
  const shown = $derived(inBar ? sidePanel.visible : tabs.side !== null);
  const current = $derived(inBar ? (sidePanel.visible ? sidePanel.kind : null) : tabs.side);
  const tools = $derived<{ id: SideId; title: string; icon: IconName; keys?: string }[]>([
    ...SIDE_KINDS.map((k) => ({ id: k, title: paneTitle({ kind: k }), icon: paneIcon({ kind: k }), keys: keysOf(`ui.${k}`) })),
    ...sideTools.map((t) => ({ id: toolId(t.type), title: t.title, icon: t.icon })),
  ]);
  const tip = (t: { title: string; keys?: string }) => (t.keys ? `${t.title} · ${t.keys}` : t.title);

  // One row of tools: the tools that fit, the open one always among them; "+" lists the others. A tool's own heading is hidden
  // in the side panel (one row); its line and buttons are the open tool's right-click menu (a long press on a phone).
  let row = $state<HTMLElement>();
  let fits = $state(99);
  $effect(() => {
    if (!row) return;
    const ro = new ResizeObserver(() => { fits = Math.max(1, Math.floor((row!.clientWidth + 2) / 30)); });
    ro.observe(row);
    return () => ro.disconnect();
  });
  /** The tools on the row: the first that fit, the open one put in the last place when it would not be there. */
  const visible = $derived.by(() => {
    if (tools.length <= fits) return tools;
    const first = tools.slice(0, fits - 1), open = tools.find((t) => t.id === current);
    return [...first, open && !first.includes(open) ? open : tools[fits - 1]];
  });
  const hidden = $derived(tools.filter((t) => !visible.includes(t)));
  function moreMenu(e: MouseEvent): void {
    side.menu = below(e, hidden.map((t) => ({ label: t.title, icon: t.icon, hint: t.keys, run: () => openSide(t.id) })), 4);
  }

  function toolHead(): Element | null {
    const root = inBar
      ? document.querySelector(`[data-testid="side-panel"] [data-side-kind="${CSS.escape(sidePanel.kind)}"]`)
      : (() => { const p = zoneGroup("side")?.activePanel; return p ? paneElement(p.id) ?? null : null; })();
    return root?.querySelector(".side-pane > .side-head") ?? null;
  }
  /** The open tool's own heading as a menu: its line (the vault, the branch and its ↑↓, the note outlined), then its
   *  buttons, which the items press. Any tool with a `.side-pane > .side-head` gets it, a plugin's too. */
  function toolMenu(e: MouseEvent, id: SideId): void {
    if (id !== current) return;
    e.preventDefault();
    const head = toolHead();
    const line = head?.querySelector(".side-title")?.textContent?.replace(/\s+/g, " ").trim();
    const buttons = [...(head?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
    const items: MenuItem[] = [
      ...(line ? [{ label: line, disabled: true, run: () => {} }, "sep" as const] : []),
      ...buttons.map((b) => { const label = b.getAttribute("aria-label") ?? b.title; return { label, detail: b.title && b.title !== label ? b.title : undefined, disabled: b.disabled, run: () => b.click() }; }),
    ];
    if (!items.length) return;
    side.menu = atPointer(e, items);
  }
</script>

<div class="side-head-row" data-testid="side-head">
  <div class="tools" role="tablist" aria-label="Side panel tools" bind:this={row}>
    {#each visible as t (t.id)}
      {@const on = current === t.id}
      <button class="icon-btn tipped" class:on role="tab" aria-selected={on} aria-label={t.title} data-tip={on ? `${tip(t)} · right-click: its actions` : tip(t)}
        onclick={() => openSide(t.id)} oncontextmenu={(e) => toolMenu(e, t.id)}><Icon name={t.icon} size={15} /></button>
    {/each}
  </div>
  {#if hidden.length}<button class="icon-btn add tipped" onclick={moreMenu} aria-haspopup="menu" aria-label="More tools" data-tip="More tools ({hidden.length})"><Icon name="plus" size={15} /></button>{/if}
  <button class="icon-btn small-btn tipped" class:off={!shown} onclick={toggleSidePanel} aria-label="{shown ? 'Hide' : 'Show'} the side panel"
    data-tip="{shown ? 'Hide' : 'Show'} the side panel · {keysOf('ui.sidePanel') ?? ''}"><Icon name={shown ? "minus" : "chevron-down"} size={13} /></button>
  {#if inBar}
    <button class="icon-btn small-btn tipped" onclick={() => placeSidePanel("dock")} aria-label="Side panel beside the editors" data-tip="Move the side panel out of the bar, beside the editors"><Icon name="move-out" size={13} /></button>
  {:else}
    <button class="icon-btn small-btn tipped" onclick={() => placeSidePanel("sidebar")} aria-label="Side panel in the left bar" data-tip="Move the side panel into the left bar, under the tabs"><Icon name="move-in" size={13} /></button>
  {/if}
</div>

<style>
  /* the tools' icons start on the bar's left edge, like the headings and rows (28 px buttons, as in the footer) */
  .side-head-row { flex: none; display: flex; align-items: center; gap: 2px; min-width: 0; padding: 5px 6px 3px calc(var(--side-inset) - 7px); }
  .tools { flex: 1; min-width: 0; display: flex; gap: 2px; } /* one row: what does not fit is under "+"; no overflow clip, it would cut the tips */
  .tools .icon-btn { flex: none; width: 28px; height: 28px; color: var(--text-faint); }
  .tools .icon-btn:hover { color: var(--text); }
  .tools .icon-btn.on { color: var(--accent); background: var(--bg-hover); }
  .add { flex: none; width: 28px; height: 28px; color: var(--text-muted); }
  .small-btn { flex: none; width: 20px; height: 20px; color: var(--text-faint); }
  .small-btn.off { color: var(--accent); }
  .tipped::after { left: 0; top: calc(100% + 6px); transform: translateY(-2px); }
  .tipped:hover::after { transform: none; }
  .small-btn.tipped::after { left: auto; right: 0; }
</style>
