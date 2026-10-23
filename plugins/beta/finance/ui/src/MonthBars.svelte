<script lang="ts">
  // One value per calendar month as bars on a date axis (Jan 2025 …), the selected months marked, a tooltip on hover.
  let { months, format, fill = "var(--accent)", selected = null, onpick }: {
    months: { month: string; value: number }[]; format: (n: number, whole?: boolean) => string; fill?: string;
    selected?: { from: string; to: string } | null; onpick?: (month: string) => void;
  } = $props();

  let w = $state(600);
  const h = 150, pad = { l: 56, r: 4, t: 8, b: 22 };
  let hover = $state<number | null>(null);
  const top = $derived(Math.max(1, ...months.map((m) => m.value)));
  const step = $derived(niceStep(top));
  const ceil = $derived(Math.ceil(top / step) * step);
  const slot = $derived((w - pad.l - pad.r) / Math.max(1, months.length));
  const bw = $derived(Math.max(2, Math.min(28, slot - 2)));
  const y = (v: number) => pad.t + (1 - Math.max(0, v) / ceil) * (h - pad.t - pad.b);
  const every = $derived(months.length > 30 ? 12 : months.length > 14 ? 6 : months.length > 7 ? 3 : 1);
  const short = (m: string, year: boolean) => new Date(`${m}-01T12:00:00`).toLocaleDateString(undefined, year ? { month: "short", year: "2-digit" } : { month: "short" });
  function niceStep(v: number) { const raw = v / 3, mag = 10 ** Math.floor(Math.log10(raw || 1)); return ([1, 2, 2.5, 5, 10].map((k) => k * mag).find((k) => k >= raw) ?? mag * 10); }
  const inSel = (m: string) => !!selected && m >= selected.from && m <= selected.to;
</script>

<div class="bars" bind:clientWidth={w}>
  <svg width={w} height={h} role="img" aria-label="By month">
    {#each [0, 1, 2, 3].map((k) => k * step).filter((v) => v <= ceil) as t (t)}
      <line class="grid" x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} />
      <text class="tick" x={pad.l - 6} y={y(t)} text-anchor="end" dominant-baseline="middle">{format(t, true)}</text>
    {/each}
    {#each months as m, i (m.month)}
      {@const bx = pad.l + i * slot + (slot - bw) / 2}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <g class="m" class:sel={inSel(m.month)} class:dim={!!selected && !inSel(m.month)} onpointerenter={() => (hover = i)} onpointerleave={() => (hover = null)} onclick={() => onpick?.(m.month)} role="presentation">
        <rect class="hit" x={pad.l + i * slot} y={pad.t} width={slot} height={h - pad.t - pad.b} />
        {#if m.value > 0}<path d={`M${bx},${y(0)}V${y(m.value) + 3}q0,-3 3,-3h${bw - 6}q3,0 3,3V${y(0)}Z`} style:fill={fill} />{/if}
      </g>
      {#if i % every === 0}<text class="tick" x={pad.l + i * slot + slot / 2} y={h - 6} text-anchor="middle">{short(m.month, i === 0 || m.month.endsWith("-01"))}</text>{/if}
    {/each}
  </svg>
  {#if hover !== null}
    <div class="tip" style:left="{Math.min(pad.l + hover * slot + slot, w - 150)}px">
      <span>{new Date(`${months[hover].month}-01T12:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" })}</span>
      <b>{format(months[hover].value)}</b>
    </div>
  {/if}
</div>

<style>
  .bars { position: relative; min-width: 0; }
  svg { display: block; }
  .grid { stroke: var(--border); }
  .tick { fill: var(--text-faint); font-size: 11px; font-variant-numeric: tabular-nums; }
  .hit { fill: transparent; }
  .m { cursor: pointer; }
  .m:hover .hit { fill: var(--bg-hover); }
  .m.dim path { opacity: 0.4; }
  .tip { position: absolute; top: 0; pointer-events: none; display: flex; flex-direction: column; padding: 6px 10px; border-radius: var(--radius-sm); background: var(--bg-elev); border: 1px solid var(--border-strong); box-shadow: var(--shadow-sm); font-size: 0.85em; color: var(--text-muted); white-space: nowrap; }
  .tip b { color: var(--text); font-variant-numeric: tabular-nums; }
</style>
