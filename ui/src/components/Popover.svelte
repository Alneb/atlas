<script lang="ts">
  // A panel anchored under the button that opened it (Obsidian's toolbar menus): moved to <body> so no pane or editor
  // widget clips it, kept inside the window, closed by Escape, a click outside (not on its button) or a phone's Back.
  import type { Snippet } from "svelte";
  import { closable } from "../lib/back";

  let { anchor, label, onclose, children, width = 380 }: {
    anchor: HTMLElement;
    label: string;
    onclose: () => void;
    children: Snippet;
    /** The panel's width in px, at most the window's less a margin. */
    width?: number;
  } = $props();

  let el = $state<HTMLDivElement>();
  let at = $state<{ left: number; top: number; maxH: number } | null>(null);
  const EDGE = 8;

  function place() {
    const r = anchor.getBoundingClientRect();
    const w = Math.min(width, innerWidth - 2 * EDGE);
    // right-aligned to its button when there is no room to the right (a toolbar's last buttons)
    const left = Math.max(EDGE, Math.min(r.left, innerWidth - w - EDGE));
    const top = r.bottom + 4;
    at = { left, top, maxH: Math.max(160, innerHeight - top - EDGE) };
  }

  $effect(() => {
    if (!el) return;
    document.body.appendChild(el);
    place();
    const node = el;
    const outside = (e: MouseEvent) => {
      const t = e.target as Node;
      // a menu or a dropdown opened from inside the panel lives elsewhere in <body>: a click there is not outside
      if (node.contains(t) || anchor.contains(t) || (t as Element).closest?.(".ctx-menu, [role=listbox], [role=menu], .backdrop")) return;
      onclose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      e.stopPropagation();
      onclose();
      anchor.focus();
    };
    const onResize = () => place();
    document.addEventListener("mousedown", outside, true);
    window.addEventListener("keydown", key);
    window.addEventListener("resize", onResize);
    const off = closable(onclose);
    return () => {
      document.removeEventListener("mousedown", outside, true);
      window.removeEventListener("keydown", key);
      window.removeEventListener("resize", onResize);
      off();
      node.remove();
    };
  });
</script>

<div class="popover" role="dialog" aria-label={label} bind:this={el}
  style:left={at ? `${at.left}px` : "-9999px"} style:top={at ? `${at.top}px` : "0"}
  style:width="min({width}px, calc(100vw - {2 * EDGE}px))" style:max-height={at ? `${at.maxH}px` : undefined}>
  {@render children()}
</div>

<style>
  .popover { position: fixed; z-index: 60; display: flex; flex-direction: column; overflow: auto; padding: 8px;
    background: var(--bg-elev); border: 1px solid var(--border-strong); border-radius: var(--radius-lg, 10px); box-shadow: var(--shadow-pop);
    font-family: var(--font-ui); font-size: calc(12.5px * var(--ui-scale, 1)); color: var(--text); }
</style>
