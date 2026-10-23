<script lang="ts">
  // A quick plot of table columns (no library): one X column, any number of Y columns, as lines or points, either axis
  // on a log scale, nice ticks, a legend, and a hover readout of the nearest point. For a first look at a run's table;
  // publication figures stay in Python.
  let { x: xIn, ys: ysIn, xLabel, yLabels, mode = "line", logX = false, logY = false }: {
    x: number[]; ys: number[][]; xLabel: string; yLabels: string[]; mode?: "line" | "points"; logX?: boolean; logY?: boolean;
  } = $props();
  // a log axis plots log10 of the values; zero and below have no place on it
  const lg = (on: boolean) => (a: number[]) => (on ? a.map((v) => (v > 0 ? Math.log10(v) : NaN)) : a);
  const x = $derived(lg(logX)(xIn));
  const ys = $derived(ysIn.map(lg(logY)));

  const W = 760, H = 320, L = 64, R = 16, T = 14, B = 42;
  const COLORS = ["var(--accent)", "var(--green)", "var(--yellow)", "var(--purple)", "var(--red)", "var(--cyan)"];

  /** 1-2-5 ticks covering [lo, hi]. */
  function ticks(lo: number, hi: number, n = 6): number[] {
    if (!(hi > lo)) { hi = lo + 1; lo -= 1; }
    const raw = (hi - lo) / n, mag = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 5, 10].map((k) => k * mag).find((s) => s >= raw)!;
    const out: number[] = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
    return out;
  }
  const fmt = (v: number) => (Math.abs(v) >= 1e4 || (Math.abs(v) < 1e-3 && v !== 0) ? v.toExponential(1) : String(+v.toPrecision(4)));

  // ranges by loops: Math.min(...a) on a run's 10⁵–10⁶ rows is slow and can overflow the stack
  function range(arrs: number[][]): [number, number] | null {
    let lo = Infinity, hi = -Infinity;
    for (const a of arrs) for (const v of a) if (Number.isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; }
    return lo <= hi ? [lo, hi] : null;
  }
  const xrr = $derived(range([x]));
  const yrr = $derived(range(ys));
  const xr = $derived(xrr ?? ([0, 1] as [number, number]));
  const yr = $derived(yrr ?? ([0, 1] as [number, number]));
  /** On a log axis: the powers of ten in range when there are two or more, else ticks on the exponent. */
  const decades = (lo: number, hi: number, n: number) => {
    const out: number[] = [];
    for (let k = Math.ceil(lo); k <= Math.floor(hi); k++) out.push(k);
    return out.length >= 2 && out.length <= 12 ? out : ticks(lo, hi, n);
  };
  const xt = $derived(logX ? decades(xr[0], xr[1], 6) : ticks(xr[0], xr[1]));
  const yt = $derived(logY ? decades(yr[0], yr[1], 5) : ticks(yr[0], yr[1], 5));
  /** a value as shown: the real one on a log axis (10^v) */
  const shown = (v: number, log: boolean) => fmt(log ? 10 ** v : v);
  const x0 = $derived(Math.min(xt[0], xr[0])), x1 = $derived(Math.max(xt[xt.length - 1], xr[1]));
  const y0 = $derived(Math.min(yt[0], yr[0])), y1 = $derived(Math.max(yt[yt.length - 1], yr[1]));
  const sx = (v: number) => L + ((v - x0) / (x1 - x0 || 1)) * (W - L - R);
  const sy = (v: number) => H - B - ((v - y0) / (y1 - y0 || 1)) * (H - T - B);
  // points joined in ROW order, as the table has them: a sweep up then down (hysteresis) must stay
  // two branches — sorting by x zig-zagged between them
  const order = $derived(x.map((_, i) => i).filter((i) => Number.isFinite(x[i])));
  // what is drawn: at most ~MAX points, in row order — per bucket its first point and the rows
  // holding each series' min and max, so peaks and both sweep branches survive (big runs froze
  // the desktop app: one SVG path of 10⁶ points, and a full scan on every mouse move)
  const MAX = 3000;
  const drawn = $derived.by(() => {
    if (order.length <= MAX) return order;
    const per = Math.ceil(order.length / (MAX / (1 + 2 * Math.max(1, ys.length))));
    const keep = new Set<number>();
    for (let b = 0; b < order.length; b += per) {
      keep.add(order[b]);
      for (const y of ys) {
        let lo = -1, hi = -1;
        for (let k = b; k < Math.min(b + per, order.length); k++) {
          const i = order[k], v = y[i];
          if (!Number.isFinite(v)) continue;
          if (lo < 0 || v < y[lo]) lo = i;
          if (hi < 0 || v > y[hi]) hi = i;
        }
        if (lo >= 0) keep.add(lo);
        if (hi >= 0) keep.add(hi);
      }
    }
    return order.filter((i) => keep.has(i));
  });
  const paths = $derived(ys.map((y) => drawn.filter((i) => Number.isFinite(y[i])).map((i, k) => `${k ? "L" : "M"}${sx(x[i]).toFixed(1)},${sy(y[i]).toFixed(1)}`).join("")));

  let hover = $state<number | null>(null);
  let pending = 0;
  function move(e: MouseEvent) {
    const r = (e.currentTarget as SVGElement).getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    if (pending) cancelAnimationFrame(pending);
    pending = requestAnimationFrame(() => { // one scan per frame, over the drawn points only
      pending = 0;
      let best = -1, d = Infinity;
      for (const i of drawn) { const dd = Math.abs(sx(x[i]) - px); if (dd < d) { d = dd; best = i; } }
      hover = best >= 0 ? best : null;
    });
  }
</script>

<figure class="plot">
  {#if !xrr || !yrr}
    <p class="none">No numeric values to plot in these columns.</p>
  {:else}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <svg viewBox="0 0 {W} {H}" role="img" aria-label="{yLabels.join(', ')} against {xLabel}" onmousemove={move} onmouseleave={() => (hover = null)}>
      {#each yt as v}<line class="grid" x1={L} x2={W - R} y1={sy(v)} y2={sy(v)} /><text class="tick" x={L - 6} y={sy(v) + 4} text-anchor="end">{shown(v, logY)}</text>{/each}
      {#each xt as v}<line class="grid" y1={T} y2={H - B} x1={sx(v)} x2={sx(v)} /><text class="tick" x={sx(v)} y={H - B + 16} text-anchor="middle">{shown(v, logX)}</text>{/each}
      <line class="axis" x1={L} x2={W - R} y1={H - B} y2={H - B} /><line class="axis" x1={L} x2={L} y1={T} y2={H - B} />
      <text class="label" x={(L + W - R) / 2} y={H - 6} text-anchor="middle">{xLabel}</text>
      {#if mode === "line"}{#each paths as d, k}<path {d} fill="none" stroke={COLORS[k % COLORS.length]} stroke-width="1.8" />{/each}{/if}
      {#each ys as y, k}
        {#each mode === "points" ? drawn : order.length <= 400 ? order : [] as i}{#if Number.isFinite(y[i])}<circle cx={sx(x[i])} cy={sy(y[i])} r="2.4" fill={COLORS[k % COLORS.length]} />{/if}{/each}
      {/each}
      {#if hover !== null}
        <line class="cursor" x1={sx(x[hover])} x2={sx(x[hover])} y1={T} y2={H - B} />
        {#each ys as y, k}{#if Number.isFinite(y[hover])}<circle cx={sx(x[hover])} cy={sy(y[hover])} r="4.5" fill="none" stroke={COLORS[k % COLORS.length]} stroke-width="2" />{/if}{/each}
      {/if}
    </svg>
    <figcaption>
      {#each yLabels as l, k}<span class="key"><i style:background={COLORS[k % COLORS.length]}></i>{hover !== null ? `${l} = ${fmt(ysIn[k][hover])}` : l}</span>{/each}
      {#if hover !== null}<span class="at">at {xLabel} = {fmt(xIn[hover])}</span>{/if}
    </figcaption>
  {/if}
</figure>

<style>
  .plot { margin: 0; padding: 8px 12px 4px; }
  svg { width: 100%; max-width: 980px; height: auto; display: block; font-family: var(--font-ui); }
  .grid { stroke: var(--border); stroke-width: 1; }
  .axis { stroke: var(--text-faint); stroke-width: 1; }
  .cursor { stroke: var(--text-muted); stroke-dasharray: 3 3; }
  .tick { fill: var(--text-muted); font-size: 11px; font-variant-numeric: tabular-nums; }
  .label { fill: var(--text); font-size: 12px; }
  figcaption { display: flex; flex-wrap: wrap; gap: 14px; font-size: calc(12px * var(--ui-scale, 1)); color: var(--text); padding: 2px 0 6px; }
  .key { display: inline-flex; align-items: center; gap: 6px; font-variant-numeric: tabular-nums; }
  .key i { width: 14px; height: 3px; border-radius: 2px; display: inline-block; }
  .at { color: var(--text-muted); }
  .none { color: var(--text-faint); padding: 8px 0; }
</style>
