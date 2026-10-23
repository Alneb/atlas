<script lang="ts">
  // The drawing's toolbar as a notepad (pen mode, the Boox; "similar options as the regular boox
  // app"): three pens (ballpoint, fountain, highlighter) in three widths, eraser, select, hand, undo/redo, the paper,
  // Excalidraw's full tools on demand, fullscreen — big targets, heavy lines. Fingers do the rest on the page
  // (draw-notepad.ts: pan, pinch, 2-finger tap = undo, 3 = redo).
  import { onMount } from "svelte";
  import Icon from "./Icon.svelte";
  import type { Notepad, NoteState } from "../lib/draw-excalidraw";
  import { PAPERS, PENS, WIDTHS, type NoteTool, type Paper, type PenKind } from "../lib/draw-notepad";
  import type { IconName } from "../lib/panes";
  import { holdPen } from "../lib/pen-target";

  let { pad, full = $bindable(false), onFullscreen, onZen }: { pad: Notepad; full?: boolean; onFullscreen: () => void; onZen?: () => void } = $props();
  let st = $state<NoteState>({ tool: "pen", width: WIDTHS[0].width, kind: "fountain", paper: "blank", page: 0, pages: 0, cols: 4, held: true });
  let open = $state<"paper" | "more" | null>(null);
  // a menu opens under its button, outside the bar: inside, the bar's transform made `fixed` local and its sideways
  // scroll clipped it, so the menu scrolled the bar instead of lying over the canvas
  let bar = $state<HTMLDivElement>();
  let at = $state<{ left?: number; right?: number; top: number }>({ left: 0, top: 0 });
  let anchor: HTMLElement | null = null;
  // under its button; one on the right half opens leftwards from the button's right edge, so it never runs off the pane
  function place(): void {
    const b = anchor?.getBoundingClientRect(), host = bar?.offsetParent?.getBoundingClientRect();
    if (!b || !host) return;
    const top = b.bottom - host.top + 6;
    at = b.left + b.width / 2 > host.left + host.width / 2 ? { right: host.right - b.right, top } : { left: b.left - host.left, top };
  }
  function toggle(which: "paper" | "more", e: MouseEvent) {
    if (open === which) { open = null; return; }
    anchor = e.currentTarget as HTMLElement;
    place();
    open = which;
  }
  // the bar scrolled sideways (a narrow pane): the open menu follows its button, closed once the button is out of sight.
  // Closing on every scroll lost a menu opened by a tap that also scrolled the bar (the scroll event comes a frame later).
  function scrolled(): void {
    if (!open || !anchor || !bar) return;
    const b = anchor.getBoundingClientRect(), v = bar.getBoundingClientRect();
    if (b.right < v.left || b.left > v.right) open = null;
    else place();
  }
  onMount(() => pad.watch((s) => (st = s)));
  // a menu over the drawing takes the pen's taps: the phone's native pen is off while one is open (pen-target.ts)
  $effect(() => { if (open) return holdPen(); });

  const pens: { kind: PenKind; icon: IconName }[] = [{ kind: "fountain", icon: "pen" }, { kind: "ballpoint", icon: "ballpoint" }, { kind: "highlighter", icon: "highlighter" }];
  const tools: { tool: Exclude<NoteTool, "pen">; icon: IconName; label: string }[] = [
    { tool: "eraser", icon: "eraser", label: "Eraser (whole strokes)" },
    { tool: "select", icon: "pointer", label: "Select, move, resize" },
    { tool: "hand", icon: "hand", label: "Move the page" },
  ];
  const paperName: Record<Paper, string> = { blank: "Blank", lines: "Lines", grid: "Grid", dots: "Dots", fine: "Fine grid", graph: "Graph", staff: "Music staves" };
  // "More": a short list of Excalidraw's own tools, its whole
  // interface only as the last line
  const more: { tool: NoteTool; label: string }[] = [
    { tool: "text", label: "Text" }, { tool: "rectangle", label: "Rectangle" }, { tool: "ellipse", label: "Ellipse" },
    { tool: "arrow", label: "Arrow" }, { tool: "line", label: "Line" }, { tool: "image", label: "Picture…" },
  ];
  const moreOn = $derived(more.some((m) => m.tool === st.tool));
</script>

<div class="bar" role="toolbar" aria-label="Notepad" data-testid="notepad-bar" bind:this={bar} onscroll={scrolled}>
  {#each pens as p (p.kind)}
    <button class:on={st.tool === "pen" && st.kind === p.kind} title={PENS[p.kind].label} aria-label={PENS[p.kind].label} onclick={() => pad.pen(p.kind, st.width)}><Icon name={p.icon} size={22} /></button>
  {/each}
  <span class="sep"></span>
  {#each WIDTHS as w (w.name)}
    <button class="w" class:on={st.tool === "pen" && st.width === w.width} title="{w.name} line" aria-label="{w.name} line" onclick={() => pad.pen(st.kind, w.width)}>
      <span class="dot" style:height="{Math.max(2, w.width * 5)}px"></span>
    </button>
  {/each}
  <span class="sep"></span>
  {#each tools as t (t.tool)}
    <button class:on={st.tool === t.tool} title={t.label} aria-label={t.label} onclick={() => pad.tool(t.tool)}><Icon name={t.icon} size={22} /></button>
  {/each}
  <span class="sep"></span>
  <button title="Undo (two-finger tap)" aria-label="Undo" onclick={() => pad.undo()}><Icon name="undo" size={22} /></button>
  <button title="Redo (three-finger tap)" aria-label="Redo" onclick={() => pad.redo()}><Icon name="redo" size={22} /></button>
  <span class="sep"></span>
  <!-- pages (draw-pages.ts): a notebook of fixed pages, one under the other -->
  {#if st.pages}
    <button title="Previous page" aria-label="Previous page" disabled={st.page <= 1} onclick={() => pad.page(st.page - 1)}><span class="back"><Icon name="chevron" size={20} /></span></button>
    <span class="pageno" aria-label="Page {st.page} of {st.pages}">{st.page || "–"} / {st.pages}</span>
    <button title="Next page" aria-label="Next page" disabled={st.page >= st.pages} onclick={() => pad.page(st.page + 1)}><Icon name="chevron" size={20} /></button>
    <button title="A new page under the last" aria-label="New page" onclick={() => pad.newPage()}><Icon name="plus" size={22} /></button>
  {:else}
    <button class="words" title="Make this drawing a notebook of pages" aria-label="New page" onclick={() => pad.newPage()}>+ Page</button>
  {/if}
  <span class="sep"></span>
  <!-- the paper by its name -->
  <button class="words" class:on={open === "paper"} title="The paper under the ink" aria-label="Paper" aria-expanded={open === "paper"} onclick={(e) => toggle("paper", e)}>Paper: {paperName[st.paper]}</button>
  <button class="words" class:on={open === "more" || moreOn || full} title="Text, shapes, a picture" aria-label="More tools" aria-expanded={open === "more"} onclick={(e) => toggle("more", e)}>More</button>
  <button title="Fullscreen" aria-label="Fullscreen" onclick={onFullscreen}><Icon name="maximize" size={22} /></button>
  {#if onZen}<button class="words" title="Zen: the page alone, this bar and the app's hidden (the corner button brings them back)" aria-label="Zen" onclick={onZen}>Zen</button>{/if}
</div>
{#if open === "paper"}
  <div class="drop" role="menu" style:left={at.left === undefined ? undefined : `${at.left}px`} style:right={at.right === undefined ? undefined : `${at.right}px`} style:top="{at.top}px">
    {#each PAPERS as p (p)}<button role="menuitemradio" aria-checked={st.paper === p} class:on={st.paper === p} onclick={() => { pad.paper(p); open = null; }}>{paperName[p]}</button>{/each}
  </div>
{/if}
    {#if open === "more"}
      <div class="drop" role="menu" style:left={at.left === undefined ? undefined : `${at.left}px`} style:right={at.right === undefined ? undefined : `${at.right}px`} style:top="{at.top}px">
        {#each more as m (m.tool)}<button role="menuitemradio" aria-checked={st.tool === m.tool} class:on={st.tool === m.tool} onclick={() => { pad.tool(m.tool); open = null; }}>{m.label}</button>{/each}
        <span class="rule"></span>
        <button role="menuitem" onclick={() => { pad.link(); open = null; }}>Link to a note…</button>
        <button role="menuitem" onclick={() => { pad.copyEmbed(); open = null; }}>Copy this page's embed</button>
        {#if st.pages > 1}
          <!-- the pages as a grid, the Boox Notepad's "Arrange the pages in a grid" -->
          <span class="rule"></span>
          <span class="label">Pages side by side</span>
          <div class="cols">
            {#each [1, 2, 3, 4] as n (n)}<button role="menuitemradio" aria-checked={st.cols === n} aria-label="{n} side by side" class:on={st.cols === n} onclick={() => { pad.arrange(n); open = null; }}>{n}</button>{/each}
          </div>
        {/if}
        <span class="rule"></span>
        <button role="menuitemcheckbox" aria-checked={st.held} class:on={st.held} title="On: one page at a time, the view held on it. Off: the canvas moves and zooms freely" onclick={() => { pad.holdPages(!st.held); open = null; }}>{st.held ? "Pages held in place ✓" : "Pages held in place"}</button>
        <button role="menuitemcheckbox" aria-checked={full} aria-label="All tools" class:on={full} onclick={() => { full = !full; open = null; }}>{full ? "Hide Excalidraw's tools" : "All of Excalidraw's tools"}</button>
      </div>
    {/if}

<style>
  .bar {
    position: absolute; z-index: 5; top: 8px; left: 50%; transform: translateX(-50%);
    display: flex; align-items: center; gap: 4px; padding: 4px; max-width: calc(100% - 16px); overflow-x: auto;
    background: var(--bg); border: 2px solid var(--text); border-radius: 12px;
  }
  button {
    display: inline-flex; align-items: center; justify-content: center;
    min-width: 48px; height: 48px; padding: 0 6px; border: 2px solid transparent; border-radius: 9px; background: transparent; color: var(--text);
    flex: none; /* never squeezed below its words: "Paper: Lines" ran into "More" on the Boox */
  }
  button.on { border-color: var(--text); background: var(--bg-hover); }
  button.w { min-width: 40px; }
  .dot { display: block; width: 22px; border-radius: 99px; background: currentColor; }
  .sep { width: 2px; align-self: stretch; margin: 6px 2px; background: var(--border-strong, var(--text)); }
  /* beside the bar in the pane, placed under its button (toggle): over the canvas, never inside the scrolling bar */
  .drop { position: absolute; z-index: 6; max-height: calc(100% - 80px); overflow-y: auto; display: flex; flex-direction: column; padding: 4px; gap: 2px; background: var(--bg); border: 2px solid var(--text); border-radius: 10px; }
  .drop .label { padding: 4px 14px 0; font-size: calc(13px * var(--ui-scale, 1)); color: var(--text-muted, var(--text)); }
  .drop .cols { display: flex; gap: 2px; }
  .drop .cols button { flex: 1; min-width: 44px; justify-content: center; padding: 0; }
  .drop button { justify-content: flex-start; padding: 0 14px; font-size: calc(15px * var(--ui-scale, 1)); white-space: nowrap; flex: none; }
  .drop .rule { height: 2px; margin: 4px 6px; background: var(--border-strong, var(--text)); }
  .pageno { min-width: 52px; text-align: center; font-size: calc(15px * var(--ui-scale, 1)); font-variant-numeric: tabular-nums; }
  button:disabled { opacity: .35; }
  .back { display: inline-flex; transform: rotate(180deg); }
  button.words { padding: 0 12px; font-size: calc(14px * var(--ui-scale, 1)); white-space: nowrap; }
</style>
