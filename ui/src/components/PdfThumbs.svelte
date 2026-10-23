<script lang="ts">
  // Page thumbnails for the PDF pane: rendered lazily as they scroll into view (a 113-page paper must not render 113
  // canvases up front), one at a time so the page being read is never starved; the current page is marked and kept in view.
  import type { PDFDocumentProxy } from "pdfjs-dist";
  import { thumbCache } from "../lib/pdf";
  let { doc, current, dark, onpick }: { doc: PDFDocumentProxy; current: number; dark: boolean; onpick: (n: number) => void } = $props();
  const WIDTH = 132;
  let list: HTMLElement;
  const done = new Set<number>();
  const cache = () => thumbCache(doc);

  // the pages waiting to render, newest wish first (what scrolled into view last is what is looked at)
  const waiting: [number, HTMLCanvasElement][] = [];
  let busy = false;

  async function render(n: number, canvas: HTMLCanvasElement) {
    const page = await doc.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: (WIDTH * devicePixelRatio) / base.width });
    canvas.width = vp.width;
    canvas.height = vp.height;
    await page.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport: vp }).promise;
    canvas.dataset.rendered = "1";
    createImageBitmap(canvas).then((b) => cache().set(n, b), () => {});
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
    if (b) { // drawn before: at once, no pdf.js
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
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); want(n, canvas); } }, { root: list, rootMargin: "300px" });
    io.observe(canvas);
    return { destroy: () => { io.disconnect(); canvas.width = canvas.height = 0; } }; // WebKit keeps a detached canvas drawn
  }

  $effect(() => { list?.querySelector(`[data-page="${current}"]`)?.scrollIntoView({ block: "nearest" }); });
</script>

<nav class="thumbs scroll" bind:this={list} aria-label="Pages" class:dark>
  {#each Array.from({ length: doc.numPages }, (_, i) => i + 1) as n (n)}
    <button class="thumb" class:on={n === current} data-page={n} onclick={() => onpick(n)} aria-label="Page {n}">
      <canvas use:lazy={n} style:width="{WIDTH}px"></canvas>
      <span class="n">{n}</span>
    </button>
  {/each}
</nav>

<style>
  .thumbs { width: 172px; flex: none; border-right: 1px solid var(--border); overflow: auto; padding: 10px 0; background: var(--bg-elev); display: flex; flex-direction: column; align-items: center; gap: 10px; }
  .thumb { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 4px; border-radius: var(--radius-sm); border: 2px solid transparent; }
  .thumb:hover { background: var(--bg-hover); }
  .thumb.on { border-color: var(--accent); }
  canvas { background: white; min-height: 60px; box-shadow: 0 1px 3px rgba(0,0,0,.25); }
  .dark canvas { filter: invert(.88) hue-rotate(180deg); }
  .n { font-size: calc(11px * var(--ui-scale, 1)); color: var(--text-muted); font-variant-numeric: tabular-nums; }
</style>
