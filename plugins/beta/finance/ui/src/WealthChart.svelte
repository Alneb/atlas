<script lang="ts">
  // Net worth by month on a date axis (Jan 2025, Jul 2025…), never "months before": one series, a 2px line over a
  // faint area, a crosshair and a tooltip on hover, a table for the keyboard and screen readers.
  let { points, format }: { points: { month: string; value: number }[]; format: (n: number, whole?: boolean) => string } = $props();

  let w = $state(600);
  const h = 220, pad = { l: 64, r: 12, t: 12, b: 26 };
  let hover = $state<number | null>(null);

  const lo = $derived(Math.min(0, ...points.map((p) => p.value)));
  const hi = $derived(Math.max(1, ...points.map((p) => p.value)));
  const ticks = $derived(nice(lo, hi, 4));
  const x = (i: number) => pad.l + (points.length < 2 ? 0 : (i / (points.length - 1)) * (w - pad.l - pad.r));
  const y = (v: number) => pad.t + (1 - (v - ticks[0]) / (ticks[ticks.length - 1] - ticks[0] || 1)) * (h - pad.t - pad.b);
  const line = $derived(points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(""));
  const area = $derived(points.length ? `${line}L${x(points.length - 1)},${y(ticks[0])}L${x(0)},${y(ticks[0])}Z` : "");
  // a label every 3, 6 or 12 months, on January/July so the axis reads as a calendar
  const step = $derived(points.length > 30 ? 12 : points.length > 14 ? 6 : 3);
  const labels = $derived(points.map((p, i) => ({ i, p })).filter(({ p }) => (Number(p.month.slice(5)) - 1) % step === 0));
  const short = (m: string) => new Date(`${m}-01T12:00:00`).toLocaleDateString(undefined, { month: "short", year: "numeric" });

  function nice(a: number, b: number, n: number): number[] {
    const span = b - a || 1, raw = span / n, mag = 10 ** Math.floor(Math.log10(raw));
    const s = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((k) => span / k <= n) ?? 10 * mag;
    const out = [];
    for (let v = Math.floor(a / s) * s; v <= b + s * 0.999; v += s) out.push(Math.round(v / s) * s);
    return out;
  }
  function move(e: PointerEvent) {
    const r = (e.currentTarget as SVGElement).getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left - pad.l) / (w - pad.l - pad.r)) * (points.length - 1));
    hover = points.length ? Math.max(0, Math.min(points.length - 1, i)) : null;
  }
</script>

<div class="chart" bind:clientWidth={w}>
  {#if points.length > 1}
    <svg width={w} height={h} role="img" aria-label="Net worth by month" onpointermove={move} onpointerleave={() => (hover = null)}>
      {#each ticks as t (t)}
        <line class="grid" x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} />
        <text class="tick" x={pad.l - 8} y={y(t)} text-anchor="end" dominant-baseline="middle">{format(t, true)}</text>
      {/each}
      {#each labels as { i, p } (p.month)}
        <text class="tick" x={x(i)} y={h - 6} text-anchor={i === 0 ? "start" : "middle"}>{short(p.month)}</text>
      {/each}
      <path class="area" d={area} />
      <path class="line" d={line} />
      {#if hover !== null}
        <line class="cross" x1={x(hover)} x2={x(hover)} y1={pad.t} y2={h - pad.b} />
        <circle class="dot" cx={x(hover)} cy={y(points[hover].value)} r="4.5" />
      {/if}
    </svg>
    {#if hover !== null}
      <div class="tip" style:left="{Math.min(x(hover) + 12, w - 170)}px" style:top="{Math.max(0, y(points[hover].value) - 46)}px">
        <span>{new Date(`${points[hover].month}-01T12:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" })}</span>
        <b>{format(points[hover].value)}</b>
      </div>
    {/if}
    <details class="table"><summary>As a table</summary>
      <table><tbody>{#each points as p (p.month)}<tr><td>{short(p.month)}</td><td>{format(p.value)}</td></tr>{/each}</tbody></table>
    </details>
  {:else}
    <div class="atlas-empty">One month of history so far: the line starts with the second.</div>
  {/if}
</div>

<style>
  .chart { position: relative; min-width: 0; }
  svg { display: block; touch-action: none; }
  .grid { stroke: var(--border); stroke-width: 1; }
  .tick { fill: var(--text-faint); font-size: 11px; font-variant-numeric: tabular-nums; }
  .line { fill: none; stroke: var(--accent); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
  .area { fill: var(--accent-soft); }
  .cross { stroke: var(--text-faint); stroke-width: 1; stroke-dasharray: 3 3; }
  .dot { fill: var(--accent); stroke: var(--bg-elev); stroke-width: 2; }
  .tip { position: absolute; pointer-events: none; display: flex; flex-direction: column; padding: 6px 10px; border-radius: var(--radius-sm); background: var(--bg-elev); border: 1px solid var(--border-strong); box-shadow: var(--shadow-sm); font-size: 0.85em; color: var(--text-muted); white-space: nowrap; }
  .tip b { color: var(--text); font-variant-numeric: tabular-nums; font-size: 1.1em; }
  .table { margin-top: 4px; font-size: 0.82em; color: var(--text-muted); }
  .table summary { cursor: pointer; }
  .table table { border-collapse: collapse; margin-top: 4px; }
  .table td { padding: 1px 12px 1px 0; font-variant-numeric: tabular-nums; }
</style>
