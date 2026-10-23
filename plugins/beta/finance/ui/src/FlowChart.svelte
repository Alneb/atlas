<script lang="ts">
  // Where the money came from and where it went in a period (model.flow): income on the left, spending on the right,
  // joined through one column, each band as wide as its amount. Labels name every node with its amount (so no colour
  // carries meaning alone); hovering a band shows its share; a click on a spending node opens its transactions.
  import { label } from "./api";
  import type { Flow } from "./model";

  let { flow, color, format, onpick }: { flow: Flow; color: (group: string) => string; format: (n: number) => string; onpick?: (group: string) => void } = $props();

  let w = $state(640);
  const gap = 6, node = 10, minH = 2;
  const rows = $derived(Math.max(flow.ins.length, flow.outs.length));
  const h = $derived(Math.max(200, rows * 30));
  const labelW = $derived(Math.min(170, w * 0.28));
  const x0 = $derived(labelW), x1 = $derived(w / 2 - node / 2), x2 = $derived(w - labelW - node);
  let hover = $state<string | null>(null);

  /** Stacks a side's values into [y, height] spans over the chart's height, gaps between. */
  function stack(xs: [string, number][]) {
    const free = h - gap * Math.max(0, xs.length - 1);
    let y = 0;
    return xs.map(([k, v]) => { const hh = Math.max(minH, (v / (flow.total || 1)) * free); const s = { k, v, y, h: hh }; y += hh + gap; return s; });
  }
  const left = $derived(stack(flow.ins));
  const right = $derived(stack(flow.outs));
  /** Label heights: each at its node's middle, pushed down so two never overlap (thin nodes sit close together). */
  function spread(xs: { y: number; h: number }[]) {
    let last = -Infinity;
    return xs.map((s) => (last = Math.max(s.y + s.h / 2, last + 15)));
  }
  const leftY = $derived(spread(left));
  const rightY = $derived(spread(right));
  // the middle column holds both sides' bands without gaps, centred
  const mid = $derived.by(() => {
    const scale = (h - gap * Math.max(0, rows - 1)) / (flow.total || 1);
    const tot = flow.total * scale, top = (h - tot) / 2;
    const place = (xs: [string, number][]) => { let y = top; return xs.map(([k, v]) => { const s = { k, y, h: Math.max(minH, v * scale) }; y += s.h; return s; }); };
    return { top, h: tot, ins: place(flow.ins), outs: place(flow.outs) };
  });
  const band = (ax: number, ay: number, ah: number, bx: number, by: number, bh: number) => {
    const c = (ax + bx) / 2;
    return `M${ax},${ay}C${c},${ay} ${c},${by} ${bx},${by}L${bx},${by + bh}C${c},${by + bh} ${c},${ay + ah} ${ax},${ay + ah}Z`;
  };
  const name = (k: string) => (k.includes(":") ? label(k) : k);
  const share = (v: number) => `${Math.round((v / (flow.total || 1)) * 100)}%`;
  const fill = (k: string) => (k === "Saved" || k === "From savings" ? "var(--fin-saved)" : k.startsWith("Income") ? "var(--fin-income)" : color(k));
</script>

<div class="flow" bind:clientWidth={w}>
  {#if flow.total > 0}
    <svg width={w} height={Math.max(h, ...leftY, ...rightY) + 10} role="img" aria-label="Money in and out by category">
      {#each left as s, i (s.k)}
        {@const m = mid.ins[i]}
        <path class="band" class:dim={hover && hover !== s.k} d={band(x0 + node, s.y, s.h, x1, m.y, m.h)} style:fill={fill(s.k)} onpointerenter={() => (hover = s.k)} onpointerleave={() => (hover = null)} role="presentation"><title>{name(s.k)}: {format(s.v)} ({share(s.v)})</title></path>
        <rect class="node" x={x0} y={s.y} width={node} height={s.h} rx="2" style:fill={fill(s.k)} />
        <text class="lab" x={x0 - 8} y={leftY[i]} text-anchor="end" dominant-baseline="middle"><tspan class="n">{name(s.k)}</tspan><tspan class="v" dx="6">{format(s.v)}</tspan></text>
      {/each}
      {#each right as s, i (s.k)}
        {@const m = mid.outs[i]}
        <path class="band" class:dim={hover && hover !== s.k} d={band(x1 + node, m.y, m.h, x2, s.y, s.h)} style:fill={fill(s.k)} onpointerenter={() => (hover = s.k)} onpointerleave={() => (hover = null)} role="presentation"><title>{name(s.k)}: {format(s.v)} ({share(s.v)})</title></path>
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <rect class="node" class:pick={!!onpick && s.k.startsWith("Expenses")} x={x2} y={s.y} width={node} height={s.h} rx="2" style:fill={fill(s.k)} onclick={() => s.k.startsWith("Expenses") && onpick?.(s.k)} role="presentation" />
        <text class="lab" x={x2 + node + 8} y={rightY[i]} dominant-baseline="middle"><tspan class="n">{name(s.k)}</tspan><tspan class="v" dx="6">{format(s.v)} · {share(s.v)}</tspan></text>
      {/each}
      <rect class="mid" x={x1} y={mid.top} width={node} height={mid.h} rx="2" />
    </svg>
  {:else}
    <div class="atlas-empty">No income or spending in this period.</div>
  {/if}
</div>

<style>
  .flow { min-width: 0; }
  svg { display: block; overflow: visible; }
  .band { opacity: 0.32; transition: opacity 120ms; }
  .band:hover { opacity: 0.6; }
  .band.dim { opacity: 0.12; }
  .node.pick { cursor: pointer; }
  .mid { fill: var(--text-faint); }
  .lab { font-size: 12px; }
  .lab .n { fill: var(--text); font-weight: 500; }
  .lab .v { fill: var(--text-muted); font-variant-numeric: tabular-nums; }
  @media (prefers-reduced-motion: reduce) { .band { transition: none; } }
</style>
