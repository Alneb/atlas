<script lang="ts">
  // Net worth at each month's end measured in a unit of your choice — any currency, or an asset (gold, BTC, a fund):
  // the engine converts every holding at that month's price (`wealth`). Drawn by Atlas's own plot.
  import { call, measure, num, type PluginApi, type Summary, type Unit, type WealthMonth } from "./api";
  let { atlas, summary }: { atlas: PluginApi; summary: Summary } = $props();
  const first = () => summary.units.find((u) => u.unit === summary.unit) ?? { unit: summary.unit, name: summary.unit, money: true };
  let unit = $state<Unit>(first());
  let other = $state<WealthMonth[] | null>(null); // the series in a unit other than the summary's
  let error = $state("");
  const months = $derived(unit.unit === summary.unit || !other ? summary.net_worth : other);

  async function pick(u: Unit) {
    try {
      other = u.unit === summary.unit ? null : (await call<{ months: WealthMonth[] }>(atlas, "wealth", { unit: u.unit })).months;
      unit = u;
      error = "";
    } catch (e) { error = (e as Error).message; }
  }

  // x in months before the last one (0 = its end): the core's plot rounds fractional years into repeated labels.
  const points = $derived(months.map((m, i, all) => ({ x: i - (all.length - 1), y: num(m.total) })));
  const lastMonth = $derived(months.at(-1));
  const last = $derived(points.at(-1)?.y ?? 0);
  const year = $derived(points.length > 12 ? last - points[points.length - 13].y : null);
  const shares = $derived(Object.entries(lastMonth?.by ?? {}).map(([c, v]) => [c, num(v)] as const).filter(([, v]) => Math.abs(v) > 0).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])));
  const big = $derived(Math.abs(last) >= 1000 && unit.money);
  function plot(host: HTMLElement) {
    // In thousands for money: the core's plot writes 15000 as 1.5e+4 (its science habit).
    const k = big ? 1000 : 1;
    return { destroy: atlas.plot(host, { x: points.map((p) => p.x), ys: [points.map((p) => p.y / k)], xLabel: `months before ${lastMonth?.month ?? ""}`, yLabels: [`${big ? "k " : ""}${unit.unit}`] }) };
  }
</script>

<div class="nw">
  <div class="top">
    <div class="big">{measure(last, unit)}</div>
    <div class="units" role="radiogroup" aria-label="Measure in">
      {#each summary.units as u (u.unit)}
        <button role="radio" aria-checked={u.unit === unit.unit} class:on={u.unit === unit.unit} title={u.name} onclick={() => pick(u)}>{u.unit}</button>
      {/each}
    </div>
  </div>
  {#if year !== null}<div class="delta" class:neg={year < 0}>{measure(year, unit, { sign: true })} over twelve months</div>{/if}
  {#if error}<div class="atlas-notice error">{error}</div>{/if}
  {#if lastMonth?.unpriced.length}<div class="faint">Without a price in {unit.unit} yet: {lastMonth.unpriced.join(", ")} (Investments → Update prices).</div>{/if}
  {#if shares.length > 1}
    <div class="shares">
      {#each shares as [c, v] (c)}<span><b>{c}</b> {measure(v, unit, { whole: unit.money })} <span class="faint">{Math.round((100 * v) / (last || 1))} %</span></span>{/each}
    </div>
  {/if}
  {#if points.length > 1}{#key points}<div class="plot" use:plot></div>{/key}{/if}
</div>

<style>
  .top { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
  .big { font-size: 1.9em; font-weight: 650; font-variant-numeric: tabular-nums; letter-spacing: -0.01em; }
  .units { display: flex; gap: 2px; background: var(--bg-hover); padding: 2px; border-radius: var(--radius-sm); flex-wrap: wrap; }
  .units button { all: unset; cursor: pointer; padding: 2px 9px; border-radius: var(--radius-sm); color: var(--text-muted); font-size: 0.88em; font-variant-numeric: tabular-nums; }
  .units button.on { background: var(--bg); color: var(--text); box-shadow: 0 1px 2px rgb(0 0 0 / 0.12); }
  .delta { color: var(--green); font-variant-numeric: tabular-nums; }
  .delta.neg { color: var(--red); }
  .faint { color: var(--text-faint); font-size: 0.9em; }
  .shares { display: flex; flex-wrap: wrap; gap: 4px 16px; margin-top: 6px; font-variant-numeric: tabular-nums; color: var(--text-muted); }
  .shares b { color: var(--text); font-weight: 600; }
  .plot { margin-top: 10px; max-width: 980px; }
</style>
