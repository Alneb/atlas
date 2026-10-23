<script lang="ts">
  // What the money is spent on: spending by month on a date axis,
  // the categories of the chosen period ranked, each against its usual month, and inside each one who was paid.
  // A month bar picks that month; a category shows its own months; "transactions" opens them in the list.
  import { label, money } from "./api";
  import { addMonths, byMonth, inPeriod, payees, totals, type Period, type Row } from "./model";
  import MonthBars from "./MonthBars.svelte";

  let { rows, cur, period = $bindable(), periods, color, onshow }: {
    rows: Row[]; cur: string; period: Period; periods: Period[]; color: (g: string) => string; onshow: (query: string) => void;
  } = $props();

  let focus = $state<string | null>(null);
  const fmt = (n: number, whole = false) => money(n, cur, { whole });
  const months = $derived(byMonth(rows));
  const series = $derived(months.map((m) => ({ month: m.month, value: focus ? (m.by.get(focus) ?? 0) : m.total })));
  const inside = $derived(rows.filter((t) => inPeriod(t, period)));
  const spanMonths = $derived(Math.max(1, months.filter((m) => m.month >= period.from && m.month <= period.to).length));
  const ranked = $derived([...totals(inside, "Expenses")].filter(([, v]) => Math.abs(v) > 0.005).sort((a, b) => b[1] - a[1]));
  const total = $derived(ranked.reduce((s, [, v]) => s + v, 0));
  const biggest = $derived(Math.max(1, ...ranked.map(([, v]) => v)));
  /** A category's usual month: its average over the 6 months before the period. */
  function usual(g: string): number {
    const before = months.filter((m) => m.month < period.from && m.month >= addMonths(period.from, -6));
    return before.length ? before.reduce((s, m) => s + (m.by.get(g) ?? 0), 0) / before.length : 0;
  }
  const pickMonth = (m: string) => (period = { from: m, to: m, name: new Date(`${m}-01T12:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" }) });
</script>

<div class="spend">
  <div class="bar">
    <div class="seg" role="radiogroup" aria-label="Period">
      {#each periods as p (p.name)}<button role="radio" aria-checked={period.name === p.name} class:on={period.name === p.name} onclick={() => (period = p)}>{p.name}</button>{/each}
    </div>
    {#if !periods.some((p) => p.name === period.name)}<span class="chip">{period.name}</span>{/if}
  </div>

  <section>
    <h3>{focus ? label(focus) : "Spending"} by month <span class="faint">{focus ? "" : "click a month to look at it"}</span>{#if focus}<button class="link" onclick={() => (focus = null)}>all categories</button>{/if}</h3>
    <MonthBars months={series} format={fmt} fill={focus ? color(focus) : "var(--accent)"} selected={period} onpick={pickMonth} />
  </section>

  <section>
    <h3>{period.name}: {fmt(total)} spent <span class="faint">{spanMonths > 1 ? `· ${fmt(total / spanMonths)} a month` : ""}</span></h3>
    <ol class="cats">
      {#each ranked as [g, v] (g)}
        {@const u = usual(g) * spanMonths}
        {@const open = focus === g}
        <li class:open>
          <button class="cat" onclick={() => (focus = open ? null : g)} aria-expanded={open}>
            <span class="swatch" style:background={color(g)}></span>
            <span class="name">{label(g)}</span>
            <span class="track"><span class="fill" style:width="{(v / biggest) * 100}%" style:background={color(g)}></span>{#if u > 0}<span class="usual" style:left="{Math.min(100, (u / biggest) * 100)}%" title="usual: {fmt(u)}"></span>{/if}</span>
            <span class="v">{fmt(v)}</span>
            <span class="pct">{Math.round((v / (total || 1)) * 100)}%</span>
            <span class="vs" class:up={u > 0 && v > u * 1.15} class:down={u > 0 && v < u * 0.85}>{u > 0 ? `${v >= u ? "+" : "−"}${fmt(Math.abs(v - u), true)} vs usual` : "new"}</span>
          </button>
          {#if open}
            <div class="who">
              <table>
                <thead><tr><th>Paid to</th><th class="n">Times</th><th class="n">Total</th></tr></thead>
                <tbody>
                  {#each payees(inside, g).slice(0, 12) as p (p.payee)}
                    <tr><td><button class="link" onclick={() => onshow(`${g.toLowerCase()} ${p.payee.toLowerCase().split(/\s+/)[0]}`)}>{p.payee}</button></td><td class="n">{p.count}</td><td class="n">{fmt(p.total)}</td></tr>
                  {/each}
                </tbody>
              </table>
              <button class="atlas-btn" onclick={() => onshow(g.toLowerCase())}>All {label(g)} transactions</button>
            </div>
          {/if}
        </li>
      {:else}
        <li class="atlas-empty">Nothing spent in this period.</li>
      {/each}
    </ol>
  </section>
</div>

<style>
  .spend { display: flex; flex-direction: column; gap: 18px; max-width: 980px; }
  .bar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .seg { display: flex; flex-wrap: wrap; border: 1px solid var(--border-strong); border-radius: var(--radius); overflow: hidden; }
  .seg button { all: unset; cursor: pointer; padding: 6px 10px; font-size: 0.9em; color: var(--text-muted); }
  .seg button + button { border-left: 1px solid var(--border); }
  .seg button:hover { background: var(--bg-hover); color: var(--text); }
  .seg button.on { background: var(--accent-soft); color: var(--accent-strong); font-weight: 600; }
  .seg button:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  .chip { padding: 3px 10px; border-radius: 999px; background: var(--accent-soft); color: var(--accent-strong); font-size: 0.88em; font-weight: 600; }
  h3 { margin: 0 0 8px; font-size: 0.78em; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); font-weight: 600; display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
  .faint { color: var(--text-faint); text-transform: none; letter-spacing: 0; font-weight: 400; }
  .link { all: unset; cursor: pointer; color: var(--accent); text-transform: none; letter-spacing: 0; font-weight: 400; }
  .link:focus-visible { outline: 2px solid var(--accent); }
  .cats { list-style: none; margin: 0; padding: 0; }
  .cats li { border-bottom: 1px solid var(--border); }
  .cat { all: unset; box-sizing: border-box; cursor: pointer; width: 100%; display: grid; grid-template-columns: 10px minmax(7em, 1fr) minmax(80px, 2fr) 7.5em 3em 9.5em; gap: 10px; align-items: center; padding: 8px 6px; }
  .cat:hover { background: var(--bg-hover); }
  .cat:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  .open .cat { background: var(--bg-hover); }
  .swatch { width: 10px; height: 10px; border-radius: 3px; }
  .name { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .track { position: relative; height: 10px; background: var(--bg-hover); border-radius: 3px; }
  .fill { position: absolute; inset: 0 auto 0 0; border-radius: 3px; }
  .usual { position: absolute; top: -3px; bottom: -3px; width: 2px; background: var(--text); border-radius: 1px; }
  .v, .pct, .vs { text-align: right; font-variant-numeric: tabular-nums; }
  .v { font-family: var(--font-mono); font-size: 0.92em; }
  .pct { color: var(--text-muted); font-size: 0.88em; }
  .vs { color: var(--text-faint); font-size: 0.82em; }
  .vs.up { color: var(--red); }
  .vs.down { color: var(--green); }
  .who { padding: 4px 6px 12px 26px; display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
  table { border-collapse: collapse; width: 100%; max-width: 560px; font-size: 0.9em; }
  th { text-align: left; color: var(--text-muted); font-weight: 500; font-size: 0.85em; padding: 2px 8px 4px 0; }
  td { padding: 3px 8px 3px 0; border-top: 1px solid var(--border); }
  .n { text-align: right; font-variant-numeric: tabular-nums; }
  @container (max-width: 700px) { .cat { grid-template-columns: 10px minmax(6em, 1fr) minmax(60px, 1fr) 7em; } .pct, .vs { display: none; } }
</style>
