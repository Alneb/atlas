<script lang="ts">
  // Image viewer: fetched through the API (header-guarded) as a blob URL. Fit by default; Ctrl+wheel (a touchpad pinch
  // arrives as one: atlas-app pinch_to_wheel) zooms around the pointer, the wheel or a drag pans, a double-click goes
  // fit ⇄ 100 %.
  import { onMount } from "svelte";
  import { blobUrl } from "../lib/raw";
  import type { PaneProps } from "../lib/dock";

  let { spec }: PaneProps<"image"> = $props();
  let src = $state("");
  let error = $state("");
  let frame = $state<HTMLDivElement>();
  let natural = $state({ w: 0, h: 0 });
  /** The view: scale and offset of the picture's top-left corner in the frame. `fit`: follows the frame's size. */
  let view = $state({ s: 1, x: 0, y: 0, fit: true });
  const MIN = 0.05, MAX = 40;

  function fitView(): void {
    if (!frame || !natural.w) return;
    const W = frame.clientWidth, H = frame.clientHeight, pad = 24;
    const s = Math.min((W - 2 * pad) / natural.w, (H - 2 * pad) / natural.h);
    view = { s, x: (W - natural.w * s) / 2, y: (H - natural.h * s) / 2, fit: true };
  }

  /** Zoom to scale `s` keeping the picture's point under (px, py) where it is. */
  function zoomAt(s: number, px: number, py: number): void {
    const to = Math.min(MAX, Math.max(MIN, s)), k = to / view.s;
    view = { s: to, x: px - (px - view.x) * k, y: py - (py - view.y) * k, fit: false };
  }

  function onWheel(e: WheelEvent): void {
    e.preventDefault();
    const r = frame!.getBoundingClientRect();
    if (e.ctrlKey) return zoomAt(view.s * Math.exp(-e.deltaY * 0.0025), e.clientX - r.left, e.clientY - r.top);
    view = { ...view, x: view.x - e.deltaX, y: view.y - e.deltaY, fit: false };
  }

  let drag = $state<{ x: number; y: number } | null>(null);
  function onDown(e: PointerEvent): void {
    if (e.button !== 0) return;
    drag = { x: e.clientX - view.x, y: e.clientY - view.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onMove(e: PointerEvent): void {
    if (drag) view = { ...view, x: e.clientX - drag.x, y: e.clientY - drag.y, fit: false };
  }
  function onDouble(e: MouseEvent): void {
    if (!view.fit) return fitView();
    const r = frame!.getBoundingClientRect();
    zoomAt(1, e.clientX - r.left, e.clientY - r.top);
  }

  onMount(() => {
    blobUrl(spec.path).then((u) => (src = u), (err) => (error = String(err)));
  });
  $effect(() => {
    const f = frame;
    if (!f) return;
    // a non-passive listener: the wheel is the picture's, never the page's scroll or the app's back swipe
    f.addEventListener("wheel", onWheel, { passive: false });
    const ro = new ResizeObserver(() => { if (view.fit) fitView(); });
    ro.observe(f);
    return () => { f.removeEventListener("wheel", onWheel); ro.disconnect(); };
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="image-pane checker" bind:this={frame} data-wheel onpointerdown={onDown} onpointermove={onMove} onpointerup={() => (drag = null)} ondblclick={onDouble}>
  {#if error}
    <div class="pane-empty"><p class="muted">Could not load image.</p><p class="faint small">{error}</p></div>
  {:else if src}
    <img {src} alt={spec.path} draggable="false" class:grab={!!drag}
      style:transform="translate({view.x}px, {view.y}px) scale({view.s})"
      onload={(e) => { const i = e.currentTarget as HTMLImageElement; natural = { w: i.naturalWidth, h: i.naturalHeight }; fitView(); }} />
  {/if}
  {#if natural.w}<div class="dims">{natural.w} × {natural.h} · {Math.round(view.s * 100)} % · Ctrl+wheel zooms · double-click: {view.fit ? "100 %" : "fit"}</div>{/if}
</div>

<style>
  .image-pane { height: 100%; overflow: hidden; position: relative; box-sizing: border-box; cursor: grab; touch-action: none; user-select: none; }
  .checker { background-color: var(--bg); background-image: linear-gradient(45deg, var(--bg-alt) 25%, transparent 25%), linear-gradient(-45deg, var(--bg-alt) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, var(--bg-alt) 75%), linear-gradient(-45deg, transparent 75%, var(--bg-alt) 75%);
    background-size: 20px 20px; background-position: 0 0, 0 10px, 10px -10px, -10px 0; }
  img { position: absolute; left: 0; top: 0; transform-origin: 0 0; max-width: none; image-rendering: auto; box-shadow: var(--shadow-sm); }
  img.grab { cursor: grabbing; }
  .dims { position: absolute; bottom: 10px; right: 14px; font-size: calc(11.5px * var(--ui-scale, 1)); color: var(--text-faint); background: var(--bg-elev); padding: 2px 8px; border-radius: 99px; border: 1px solid var(--border); pointer-events: none; }
</style>
