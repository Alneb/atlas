<script lang="ts">
  // The side panel inside the left bar (ui.side_panel = "sidebar"): files, search, outline or git right
  // under the tab list, at a height of its own: dragged by its top edge, never squeezed by the tabs
  // above (they scroll instead). Its heading is the row of tools (SideHead.svelte, the same beside the
  // editors). Each tool is the same pane as in the dock, kept once opened.
  import { mountBlock, paneBlockType } from "../../lib/blocks";
  import type { PaneKind } from "../../lib/panes";
  import { SIDEBAR_FILE } from "../../lib/sidebar.svelte";
  import { sidePanel, sizeSide, type SideId } from "../../lib/side-panel.svelte";
  import { TOOL, sideTools, toolId } from "../../lib/side-tools.svelte";
  import SideHead from "./SideHead.svelte";

  const shown = $derived(sidePanel.visible);
  let opened = $state<SideId[]>([]);
  let body = $state<HTMLElement>();
  $effect(() => { if (shown && !opened.includes(sidePanel.kind)) opened.push(sidePanel.kind); });
  // the keys go to the tool that was asked for (Ctrl+Shift+F: the search box), once it is drawn
  $effect(() => {
    if (!sidePanel.focus) return;
    const kind = sidePanel.kind;
    let tries = 0;
    const t = setInterval(() => {
      const box = body?.querySelector<HTMLInputElement>(`[data-side-kind="${kind}"] input`);
      if (box) { box.focus(); box.select(); }
      if (box || ++tries > 20) clearInterval(t);
    }, 50);
    return () => clearInterval(t);
  });
  // a plugin's tool is its block (a dotted type: the block waits for its plugin and redraws with it)
  const tool = (el: HTMLElement, kind: SideId) => ({ destroy: mountBlock(el, SIDEBAR_FILE, `type: ${kind.startsWith(TOOL) ? kind.slice(TOOL.length) : paneBlockType(kind as PaneKind)}`, "side") });

  // the top edge is the handle; the tab list above keeps at least KEEP px
  const KEEP = 140;
  let root = $state<HTMLElement>();
  const room = () => (root?.parentElement?.clientHeight ?? 800) - KEEP;
  function drag(e: PointerEvent) {
    const from = e.clientY, start = root!.offsetHeight, grip = e.currentTarget as HTMLElement;
    grip.setPointerCapture(e.pointerId);
    const move = (m: PointerEvent) => sizeSide(start + from - m.clientY, room());
    grip.addEventListener("pointermove", move);
    grip.addEventListener("pointerup", () => grip.removeEventListener("pointermove", move), { once: true });
  }
  function nudge(e: KeyboardEvent) {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    sizeSide(sidePanel.height + (e.key === "ArrowUp" ? 24 : -24), room());
  }
</script>

<section class="side-panel" class:shown aria-label="Side panel" data-testid="side-panel" bind:this={root} style:height={shown ? `${sidePanel.height}px` : undefined}>
  {#if shown}
    <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
    <div class="sp-grip" role="separator" aria-orientation="horizontal" aria-label="Side panel height" aria-valuenow={sidePanel.height} tabindex="0"
      title="Drag to resize the side panel" onpointerdown={drag} onkeydown={nudge}></div>
  {/if}
  <SideHead />
  {#if opened.length}
    <div class="sp-body" bind:this={body} hidden={!shown}>
      {#each opened as k (k)}
        {#if k.startsWith(TOOL)}
          <!-- a plugin's tool: the same heading and margins as the built-in ones, whatever the plugin draws -->
          <div class="sp-tool side-pane" data-side-kind={k} hidden={sidePanel.kind !== k}>
            <div class="side-head"><span class="side-title">{sideTools.find((t) => toolId(t.type) === k)?.title ?? k.slice(TOOL.length)}</span></div>
            <div class="sp-plugin scroll" use:tool={k}></div>
          </div>
        {:else}<div class="sp-tool" data-side-kind={k} hidden={sidePanel.kind !== k} use:tool={k}></div>{/if}
      {/each}
    </div>
  {/if}
</section>

<style>
  .side-panel { position: relative; flex: none; display: flex; flex-direction: column; min-height: 0; border-top: 1px solid var(--border); }
  .side-panel.shown { max-height: calc(100% - 140px); } /* a small window: the tab list keeps some room */
  .sp-grip { position: absolute; top: -3px; left: 0; right: 0; height: 6px; cursor: row-resize; z-index: 2; touch-action: none; }
  .sp-grip:hover, .sp-grip:focus-visible { background: var(--accent); opacity: .5; outline: none; }
  .sp-body { flex: 1; min-height: 0; }
  .sp-tool { height: 100%; }
  .sp-tool[hidden] { display: none; } /* over .side-pane's display: flex */
  .sp-plugin { flex: 1; min-height: 0; overflow: auto; padding: 0 12px 10px; font-size: calc(13px * var(--ui-scale, 1)); }
  /* the pane fills the panel: no embed frame, no fixed embed height */
  .sp-tool :global(.block-pop) { display: none; } /* "open as tab" = the heading's move button */
  .sp-tool :global(.side-pane) { background: none; } /* part of the bar, not a card on it */
  .sp-tool :global(.block-body) { height: 100% !important; max-height: none; border: 0; border-radius: 0; background: none; resize: none; }
</style>
