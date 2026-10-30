<script lang="ts">
  // Page thumbnails for the PDF pane: rendered lazily as they scroll into view (a 113-page paper must not render 113
  // canvases up front), one at a time so the page being read is never starved; the current page is marked and kept in view.
  import { dpr, pageBitmap, paint, thumbCache } from "../lib/pdf-pages";
  import type { EngineName } from "../lib/pdf-engine";
  // `engine`: the reader's, so a document's thumbnails come from the engine that reads it; `rotation` and `sizeOf` (a
  // page's size in points): each thumbnail turned as the reader turns the pages, its slot sized before it is drawn
  let { pages, path, engine, current, dark, rotation = 0, sizeOf, onpick }: { pages: number; path: string; engine: EngineName; current: number; dark: boolean; rotation?: number; sizeOf: (n: number) => [number, number]; onpick: (n: number) => void } = $props();
  const WIDTH = 132;
  /** The slot (the turned page, WIDTH wide) and the canvas before its turn, in CSS px. */
  function boxOf(n: number): { slotH: number; cw: number; ch: number } {
    const [w, h] = sizeOf(n), a = h / w, turned = (rotation / 90) % 2 === 1;
    return turned ? { slotH: WIDTH / a, cw: WIDTH / a, ch: WIDTH } : { slotH: WIDTH * a, cw: WIDTH, ch: WIDTH * a };
  }
  let list: HTMLElement;
  const done = new Set<number>();
  const cache = () => thumbCache(path, engine);

  // the pages waiting to render, newest wish first (what scrolled into view last is what is looked at)
  const waiting: [number, HTMLCanvasElement][] = [];
  let busy = false;

  async function render(n: number, canvas: HTMLCanvasElement) {
    const b = await pageBitmap(path, n, WIDTH * dpr(), "width", engine);
    if (canvas.isConnected) paint(canvas, b, true);
    canvas.dataset.rendered = "1";
    cache().set(n, b);
  }

  async function drain() {
    if (busy) return;
    busy = true;
    while (waiting.length) {
      const [n, canvas] = waiting.pop()!;
      if (!canvas.isConnected) { done.delete(n); continue; }
      try { await render(n, canvas); } catch { done.delete(n); } // a page that failed renders on its next look
    }
    busy = false;
  }

  function want(n: number, canvas: HTMLCanvasElement) {
    if (done.has(n)) return;
    done.add(n);
    const b = cache().get(n);
    if (b) { // drawn before: at once
      canvas.width = b.width;
      canvas.height = b.height;
      canvas.getContext("2d")!.drawImage(b, 0, 0);
      canvas.dataset.rendered = "1";
      return;
    }
    waiting.push([n, canvas]);
    void drain();
  }

  function lazy(canvas: HTMLCanvasElement, n: number) {
    // the strip itself as the root (`list` is not bound yet when the first ones mount: the viewport then, whose margin
    // the strip clips away); kept observing, so a page whose drawing failed is drawn on its next look (`want` skips the rest)
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) want(n, canvas); }, { root: canvas.closest<HTMLElement>(".thumbs"), rootMargin: "300px" });
    io.observe(canvas);
    return { destroy: () => { io.disconnect(); canvas.width = canvas.height = 0; } }; // WebKit keeps a detached canvas drawn
  }

  $effect(() => { list?.querySelector(`[data-page="${current}"]`)?.scrollIntoView({ block: "nearest" }); });
</script>

<nav class="thumbs scroll" bind:this={list} aria-label="Pages" class:dark>
  {#each Array.from({ length: pages }, (_, i) => i + 1) as n (n)}
    {@const b = boxOf(n)}
    <button class="thumb" class:on={n === current} data-page={n} onclick={() => onpick(n)} aria-label="Page {n}">
      <span class="slot" style:width="{WIDTH}px" style:height="{b.slotH}px">
        <canvas use:lazy={n} style:width="{b.cw}px" style:height="{b.ch}px" style:transform="translate(-50%, -50%) rotate({rotation}deg)"></canvas>
      </span>
      <span class="n">{n}</span>
    </button>
  {/each}
</nav>

<style>
  .thumbs { width: 172px; flex: none; border-right: 1px solid var(--border); overflow: auto; padding: 10px 0; background: var(--bg-elev); display: flex; flex-direction: column; align-items: center; gap: 10px; }
  .thumb { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 4px; border-radius: var(--radius-sm); border: 2px solid transparent; }
  .thumb:hover { background: var(--bg-hover); }
  .thumb.on { border-color: var(--accent); }
  .slot { position: relative; display: block; flex: none; }
  canvas { position: absolute; left: 50%; top: 50%; background: white; box-shadow: 0 1px 3px rgba(0,0,0,.25); } /* literal: a sheet of paper */
  .dark canvas { filter: invert(.88) hue-rotate(180deg); }
  .n { font-size: calc(11px * var(--ui-scale, 1)); color: var(--text-muted); font-variant-numeric: tabular-nums; }
</style>
