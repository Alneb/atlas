<script lang="ts">
  // Graph of notes (Obsidian's graph view): a small force layout on a canvas — repulsion between
  // all notes, springs along links, a pull to the centre. Hover highlights a note and its
  // neighbours; click opens it; wheel zooms, drag pans; "Local" shows only the active note's
  // neighbourhood; the filter dims what does not match. Colour = top-level folder.
  import { onMount } from "svelte";
  import { shownName, shownPath } from "../lib/paths";
  import { api } from "../lib/api";
  import { on } from "../lib/bus";
  import { openPath } from "../lib/dock";
  import { editors, lastEditorId } from "../lib/registry";
  import type { PaneProps } from "../lib/dock";
  import type { Graph } from "../lib/types";

  let { panel: _panel }: PaneProps<"graph"> = $props();
  let canvas: HTMLCanvasElement;
  let wrap: HTMLDivElement;
  let graph = $state<Graph | null>(null);
  let filter = $state("");
  let local = $state(false);
  let depth = $state(1);
  let hover = $state<number | null>(null);
  let tip = $state(""); // the hovered note, for the caption (the layout arrays are not reactive)
  let count = $state({ nodes: 0, edges: 0 });

  type N = { i: number; x: number; y: number; vx: number; vy: number; deg: number; name: string; path: string };
  let nodes: N[] = [];
  let edges: [number, number][] = [];
  let adj: Set<number>[] = [];
  let view = { x: 0, y: 0, k: 1 };
  let heat = 1; // the layout cools down, then stops (no CPU when nothing moves)
  let raf = 0;

  // colour group = the note's own folder (top-level folders lump every note together)
  const top = (p: string) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "·");

  /** The subgraph to show: everything, or the neighbourhood of the active note (Local). */
  function build() {
    if (!graph) return;
    let keep = graph.nodes.map((_, i) => i);
    if (local) {
      const id = lastEditorId();
      const path = id ? editors.get(id)?.path : undefined;
      const start = graph.nodes.findIndex((n) => n.path === path);
      if (start >= 0) {
        const nb: Set<number>[] = graph.nodes.map(() => new Set());
        for (const [a, b] of graph.edges) { nb[a].add(b); nb[b].add(a); }
        const seen = new Set([start]);
        let frontier = [start];
        for (let d = 0; d < depth; d++) frontier = frontier.flatMap((i) => [...nb[i]].filter((j) => !seen.has(j) && seen.add(j)));
        keep = [...seen];
      }
    }
    const remap = new Map(keep.map((g, i) => [g, i]));
    const old = new Map(nodes.map((n) => [n.path, n]));
    nodes = keep.map((g, i) => {
      const p = graph!.nodes[g].path;
      const prev = old.get(p);
      const a = (i / keep.length) * Math.PI * 2, r = 40 + Math.sqrt(keep.length) * 12;
      return prev ? { ...prev, i } : { i, x: Math.cos(a) * r, y: Math.sin(a) * r, vx: 0, vy: 0, deg: 0, name: shownName(p), path: p };
    });
    edges = graph.edges.filter(([a, b]) => remap.has(a) && remap.has(b)).map(([a, b]) => [remap.get(a)!, remap.get(b)!]);
    adj = nodes.map(() => new Set());
    for (const [a, b] of edges) { adj[a].add(b); adj[b].add(a); nodes[a].deg++; nodes[b].deg++; }
    count = { nodes: nodes.length, edges: edges.length };
    heat = 1;
    kick();
  }

  /** One step of the force layout. Repulsion only reaches 500 px, so nodes are bucketed in a grid of that size
   *  and each meets only its 3×3 neighbourhood — O(n) per step instead of every pair (was 2 s a tab cycle). */
  const REACH = 500;
  function stepLayout() {
    const rep = 2600, spring = 0.02, len = 46, grav = 0.012;
    const grid = new Map<number, N[]>();
    const cell = (x: number, y: number) => (Math.floor(x / REACH) + 4096) * 8192 + (Math.floor(y / REACH) + 4096);
    for (const a of nodes) { const k = cell(a.x, a.y); const b = grid.get(k); if (b) b.push(a); else grid.set(k, [a]); }
    for (const a of nodes) {
      const cx = Math.floor(a.x / REACH), cy = Math.floor(a.y / REACH);
      for (let gx = cx - 1; gx <= cx + 1; gx++) for (let gy = cy - 1; gy <= cy + 1; gy++) {
        for (const b of grid.get((gx + 4096) * 8192 + (gy + 4096)) ?? []) {
          if (b.i <= a.i) continue; // each pair once
          let dx = a.x - b.x, dy = a.y - b.y;
          const d2 = dx * dx + dy * dy + 0.01;
          if (d2 > REACH * REACH) continue; // far apart: negligible
          const f = rep / d2, d = Math.sqrt(d2);
          dx /= d; dy /= d;
          a.vx += dx * f; a.vy += dy * f; b.vx -= dx * f; b.vy -= dy * f;
        }
      }
    }
    for (const [ia, ib] of edges) {
      const a = nodes[ia], b = nodes[ib];
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.sqrt(dx * dx + dy * dy) || 1, f = (d - len) * spring;
      a.vx += (dx / d) * f; a.vy += (dy / d) * f; b.vx -= (dx / d) * f; b.vy -= (dy / d) * f;
    }
    for (const a of nodes) {
      a.vx -= a.x * grav; a.vy -= a.y * grav;
      const cap = 12 * heat;
      a.x += Math.max(-cap, Math.min(cap, a.vx * heat)); a.y += Math.max(-cap, Math.min(cap, a.vy * heat));
      a.vx *= 0.5; a.vy *= 0.5;
    }
    heat *= 0.985;
  }

  const PALETTE = ["--green", "--accent", "--yellow", "--purple", "--cyan", "--red", "--accent-strong", "--text-muted"];
  /** The theme's colours, read once a frame (getComputedStyle per edge was most of a frame's cost). */
  function themeColours() {
    const st = getComputedStyle(document.documentElement), css = (v: string) => st.getPropertyValue(v).trim();
    return { palette: PALETTE.map(css), accent: css("--accent"), border: css("--border-strong"), text: css("--text"), font: css("--font-ui") || "sans-serif" };
  }

  function draw() {
    const dpr = window.devicePixelRatio || 1, w = wrap.clientWidth, h = wrap.clientHeight;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
    const c = canvas.getContext("2d")!;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    c.translate(w / 2 + view.x, h / 2 + view.y);
    c.scale(view.k, view.k);
    const q = filter.trim().toLowerCase();
    const match = (n: N) => !q || n.path.toLowerCase().includes(q);
    const lit = (i: number) => hover === null || i === hover || adj[hover]?.has(i);
    const folders = [...new Set(nodes.map((n) => top(n.path)))].sort();
    const col = themeColours();
    c.lineWidth = 1 / view.k;
    for (const [a, b] of edges) {
      const on = hover !== null && (a === hover || b === hover);
      c.strokeStyle = on ? col.accent : col.border;
      c.globalAlpha = on ? 0.9 : hover === null ? 0.5 : 0.15;
      c.beginPath(); c.moveTo(nodes[a].x, nodes[a].y); c.lineTo(nodes[b].x, nodes[b].y); c.stroke();
    }
    for (const n of nodes) {
      c.globalAlpha = (lit(n.i) ? 1 : 0.18) * (match(n) ? 1 : 0.2);
      c.fillStyle = col.palette[Math.max(0, folders.indexOf(top(n.path))) % PALETTE.length];
      c.beginPath(); c.arc(n.x, n.y, 3 + Math.sqrt(n.deg) * 1.6, 0, Math.PI * 2); c.fill();
    }
    // labels: the hovered note and its neighbours, or every note when zoomed in
    c.font = `${12 / view.k}px ${col.font}`;
    c.fillStyle = col.text;
    c.textAlign = "center";
    for (const n of nodes) {
      const show = hover !== null ? lit(n.i) : view.k > 1.6 || (q && match(n));
      if (!show) continue;
      c.globalAlpha = match(n) ? 1 : 0.3;
      c.fillText(n.name, n.x, n.y - (6 + Math.sqrt(n.deg) * 1.6));
    }
    c.globalAlpha = 1;
  }

  /** Out of the page (a background tab) nothing runs: the resize observer kicks again when it is back. */
  const shown = () => wrap?.isConnected && wrap.clientWidth > 0;
  function frame() {
    raf = 0;
    if (!shown()) return;
    if (heat > 0.02) { for (let k = 0; k < 2; k++) stepLayout(); kick(); }
    draw();
  }
  function kick() { if (!raf) raf = requestAnimationFrame(frame); }

  function toWorld(e: MouseEvent) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left - r.width / 2 - view.x) / view.k, y: (e.clientY - r.top - r.height / 2 - view.y) / view.k };
  }
  function pick(e: MouseEvent): number | null {
    const p = toWorld(e);
    let best: number | null = null, bd = (10 / view.k) ** 2;
    for (const n of nodes) { const d = (n.x - p.x) ** 2 + (n.y - p.y) ** 2; if (d < bd) { bd = d; best = n.i; } }
    return best;
  }
  let drag: { x: number; y: number; moved: boolean } | null = null;
  function down(e: MouseEvent) { drag = { x: e.clientX, y: e.clientY, moved: false }; }
  function move(e: MouseEvent) {
    if (drag) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
      view.x += dx; view.y += dy; drag.x = e.clientX; drag.y = e.clientY;
      kick();
      return;
    }
    const h = pick(e);
    if (h !== hover) {
      hover = h;
      tip = h === null ? "" : `${shownPath(nodes[h].path)} · ${nodes[h].deg} links — click to open`;
      kick();
    }
  }
  function up(e: MouseEvent) {
    if (drag && !drag.moved) { const h = pick(e); if (h !== null) openPath(nodes[h].path); }
    drag = null;
  }
  function wheel(e: WheelEvent) {
    e.preventDefault();
    const k = Math.min(6, Math.max(0.15, view.k * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
    const r = canvas.getBoundingClientRect(), mx = e.clientX - r.left - r.width / 2, my = e.clientY - r.top - r.height / 2;
    view.x = mx - ((mx - view.x) / view.k) * k; view.y = my - ((my - view.y) / view.k) * k; view.k = k;
    kick();
  }

  async function load() { graph = await api.graph(); build(); }

  $effect(() => { void local; void depth; build(); });
  $effect(() => { void filter; kick(); });

  onMount(() => {
    void load();
    const ro = new ResizeObserver(() => kick());
    ro.observe(wrap);
    let t: ReturnType<typeof setTimeout> | undefined;
    // a note changed: reload now if shown, else once the tab is back (stale)
    let stale = false;
    const ro2 = new ResizeObserver(() => { if (stale && shown()) { stale = false; void load(); } });
    ro2.observe(wrap);
    const off = on("fs", (e) => {
      if (!e.paths.some((p) => /\.md$/i.test(p))) return;
      if (!shown()) { stale = true; return; }
      clearTimeout(t); t = setTimeout(load, 800);
    });
    return () => { ro.disconnect(); ro2.disconnect(); off(); clearTimeout(t); if (raf) cancelAnimationFrame(raf); };
  });
</script>

<div class="graph-pane">
  <header>
    <span class="title">Graph</span>
    <span class="meta">{count.nodes} notes · {count.edges} links</span>
    <input class="filter" placeholder="Highlight notes by name or folder…" bind:value={filter} spellcheck="false" aria-label="Filter notes" />
    <label class="toggle"><input type="checkbox" bind:checked={local} /> Local (active note)</label>
    {#if local}<label class="toggle">depth <input type="number" min="1" max="4" bind:value={depth} aria-label="Depth" /></label>{/if}
    <button class="btn" onclick={() => { view = { x: 0, y: 0, k: 1 }; heat = 1; kick(); }}>Re-center</button>
  </header>
  <div class="canvas-wrap" bind:this={wrap}>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <canvas bind:this={canvas} onmousedown={down} onmousemove={move} onmouseup={up} onmouseleave={() => { drag = null; hover = null; tip = ""; kick(); }} onwheel={wheel}
      aria-label="Graph of {count.nodes} notes" data-testid="graph-canvas"></canvas>
    {#if tip}<div class="tip">{tip}</div>{/if}
  </div>
</div>

<style>
  .graph-pane { height: 100%; display: flex; flex-direction: column; background: var(--bg); }
  header { display: flex; align-items: center; gap: 12px; padding: 8px 12px; border-bottom: 1px solid var(--border); flex-wrap: wrap; font-size: calc(12.5px * var(--ui-scale, 1)); }
  .title { color: var(--heading); font-weight: 600; }
  .meta { color: var(--text-muted); }
  .filter { flex: 1; min-width: 180px; font: inherit; color: var(--text); background: var(--bg-elev); border: 1px solid var(--border-strong); border-radius: var(--radius-sm); padding: 4px 8px; }
  .filter:focus { outline: none; border-color: var(--accent); }
  .toggle { display: inline-flex; gap: 5px; align-items: center; color: var(--text-muted); }
  .toggle input[type="number"] { width: 46px; font: inherit; color: var(--text); background: var(--bg-elev); border: 1px solid var(--border-strong); border-radius: 4px; padding: 1px 4px; }
  .btn { border: 1px solid var(--border-strong); padding: 3px 10px; border-radius: var(--radius-sm); }
  .btn:hover { background: var(--bg-hover); }
  .canvas-wrap { position: relative; flex: 1; min-height: 0; }
  canvas { position: absolute; inset: 0; width: 100%; height: 100%; cursor: grab; }
  canvas:active { cursor: grabbing; }
  .tip { position: absolute; left: 12px; bottom: 10px; font-size: calc(12px * var(--ui-scale, 1)); color: var(--text-muted); background: var(--bg-elev); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 3px 8px; pointer-events: none; }
</style>
