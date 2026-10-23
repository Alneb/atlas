<script lang="ts">
  // How one column's numbers spread: a histogram with a chosen number of bins, the count of a bin on hover.
  let { values, label, bins = 30 }: { values: number[]; label: string; bins?: number } = $props();
  const W = 760, H = 260, L = 52, R = 16, T = 12, B = 40;
  const fmt = (v: number) => (Math.abs(v) >= 1e4 || (Math.abs(v) < 1e-3 && v !== 0) ? v.toExponential(2) : String(+v.toPrecision(4)));
  const hist = $derived.by(() => {
    let lo = Infinity, hi = -Infinity, n = 0;
    for (const v of values) if (Number.isFinite(v)) { n++; if (v < lo) lo = v; if (v > hi) hi = v; }
    if (!n) return null;
    if (hi === lo) { lo -= 0.5; hi += 0.5; }
    const k = Math.max(1, Math.min(200, Math.round(bins))), w = (hi - lo) / k, counts = new Array<number>(k).fill(0);
    for (const v of values) if (Number.isFinite(v)) counts[Math.min(k - 1, Math.floor((v - lo) / w))]++;
    return { lo, hi, w, counts, max: Math.max(...counts), n };
  });
  let hover = $state<number | null>(null);
</script>

<figure class="hist">
  {#if !hist}<p class="none">No numbers in {label}.</p>{:else}
    {@const h = hist}
    {@const bw = (W - L - R) / h.counts.length}
    <svg viewBox="0 0 {W} {H}" role="img" aria-label="Histogram of {label}" onmouseleave={() => (hover = null)}>
      <line class="axis" x1={L} x2={W - R} y1={H - B} y2={H - B} />
      <text class="tick" x={L} y={H - B + 16} text-anchor="start">{fmt(h.lo)}</text>
      <text class="tick" x={W - R} y={H - B + 16} text-anchor="end">{fmt(h.hi)}</text>
      <text class="tick" x={L - 6} y={T + 8} text-anchor="end">{h.max}</text>
      <text class="label" x={(L + W - R) / 2} y={H - 6} text-anchor="middle">{label}</text>
      {#each h.counts as c, i}
        {@const bh = (c / (h.max || 1)) * (H - T - B)}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <rect x={L + i * bw + 0.5} y={H - B - bh} width={Math.max(0.5, bw - 1)} height={bh} class:on={hover === i} onmouseenter={() => (hover = i)} />
      {/each}
    </svg>
    <figcaption>{#if hover !== null}<span class="at">{fmt(h.lo + hover * h.w)} – {fmt(h.lo + (hover + 1) * h.w)}: {h.counts[hover]} of {h.n}</span>{:else}<span class="at">{h.n} values in {h.counts.length} bins</span>{/if}</figcaption>
  {/if}
</figure>

<style>
  .hist { margin: 0; padding: 8px 12px 4px; }
  svg { width: 100%; max-width: 980px; height: auto; display: block; font-family: var(--font-ui); }
  rect { fill: color-mix(in srgb, var(--accent) 70%, transparent); }
  rect.on { fill: var(--accent); }
  .axis { stroke: var(--text-faint); }
  .tick { fill: var(--text-muted); font-size: 11px; font-variant-numeric: tabular-nums; }
  .label { fill: var(--text); font-size: 12px; }
  figcaption { font-size: calc(12px * var(--ui-scale, 1)); color: var(--text-muted); padding: 2px 0 6px; font-variant-numeric: tabular-nums; }
  .none { color: var(--text-faint); padding: 8px 0; }
</style>
