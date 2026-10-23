<script lang="ts">
  // The Overview, summary before detail: what you have and how it moved, what needs you, where the money came from and
  // went in the chosen period, and net worth over real months. Every number opens what it sums.
  import { call, label, measure, money, num, type Diagnostic, type PluginApi, type Summary, type Unit, type WealthMonth } from "./api";
  import { flow, inPeriod, totals, type Period, type Row } from "./model";
  import FlowChart from "./FlowChart.svelte";
  import WealthChart from "./WealthChart.svelte";
  import Capture from "./Capture.svelte";
  import Import from "./Import.svelte";

  let { atlas, summary, rows, diags, cur, period = $bindable(), periods, color, onshow, ontab, onaccount, onchange }: {
    atlas: PluginApi; summary: Summary; rows: Row[]; diags: Diagnostic[]; cur: string; period: Period; periods: Period[];
    color: (g: string) => string; onshow: (query: string) => void; ontab: (tab: "review" | "spending" | "sources") => void;
    onaccount: (account: string) => void; onchange: () => void;
  } = $props();

  // net worth in the chosen unit (EUR, CAD, gold…): the summary's, or asked for
  const start = (): Unit => summary.units.find((u) => u.unit === summary.unit) ?? { unit: summary.unit, name: summary.unit, money: true };
  let unit = $state<Unit>(start());
  let other = $state<WealthMonth[] | null>(null);
  $effect(() => {
    const u = unit;
    if (u.unit === summary.unit) { other = null; return; }
    call<{ months: WealthMonth[] }>(atlas, "wealth", { unit: u.unit }).then((r) => { if (unit === u) other = r.months; }).catch(() => (other = null));
  });
  const worth = $derived((other ?? summary.net_worth).map((m) => ({ month: m.month, value: num(m.total) })));
  const now = $derived(worth.at(-1)?.value ?? 0);
  const ago = (n: number) => worth.at(-1 - n)?.value;
  const fmtU = (n: number, whole = false) => measure(n, unit, { whole });
  const delta = (n: number | undefined) => (n === undefined ? null : now - n);

  const inside = $derived(rows.filter((t) => inPeriod(t, period)));
  const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);
  const spent = $derived(sum(totals(inside, "Expenses")));
  const came = $derived(sum(totals(inside, "Income")));
  const theFlow = $derived(flow(inside));
  const guesses = $derived(rows.filter((t) => t.tags.includes("guess")).length);
  const errors = $derived(diags.filter((d) => d.severity === "error"));
  const cash = $derived(summary.accounts.filter((a) => a.account.startsWith("Assets") && !a.closed && Object.values(a.balances).some((v) => Math.abs(num(v)) > 0.005)));
  const fmt = (n: number) => money(n, cur, { whole: true });
</script>

<div class="overview">
  <section class="hero">
    <div class="big">
      <span class="k">Net worth</span>
      <span class="n">{fmtU(now, true)}</span>
      <span class="deltas">
        {#each [[1, "since last month"], [12, "in a year"]] as [n, words] (n)}
          {@const d = delta(ago(Number(n)))}
          {#if d !== null}<span class:up={d > 0} class:down={d < 0}>{d > 0 ? "▲" : d < 0 ? "▼" : "•"} {measure(Math.abs(d), unit, { whole: true })} {words}</span>{/if}
        {/each}
      </span>
    </div>
    <div class="stat"><span class="k">{period.name}: spent</span><button class="n link" onclick={() => ontab("spending")}>{fmt(spent)}</button></div>
    <div class="stat"><span class="k">came in</span><span class="n">{fmt(came)}</span></div>
    <div class="stat"><span class="k">{came >= spent ? "saved" : "drawn from savings"}</span><span class="n" class:up={came > spent} class:down={came < spent}>{fmt(Math.abs(came - spent))}{#if came > 0}<small>&nbsp;· {Math.round(((came - spent) / came) * 100)}%</small>{/if}</span></div>
  </section>

  {#if summary.review || errors.length || guesses || summary.sources.some((s) => s.error)}
    <section class="attention" aria-label="Needs you">
      {#if summary.review}<button onclick={() => ontab("review")}><b>{summary.review}</b> to review</button>{/if}
      {#if guesses}<button onclick={() => onshow("#guess")}><b>{guesses}</b> booked by judgement (#guess): confirm or fix</button>{/if}
      {#each errors.slice(0, 3) as d, i (i)}<button class="err" onclick={() => atlas.open(d.path, d.line)}>{d.message}</button>{/each}
      {#if errors.length > 3}<span>and {errors.length - 3} more errors</span>{/if}
      {#each summary.sources.filter((s) => s.error) as s (s.path)}<button class="err" onclick={() => ontab("sources")}>{s.bank}: {s.error}</button>{/each}
    </section>
  {/if}

  <section class="panel">
    <header>
      <h3>Where the money came from and went</h3>
      <div class="seg" role="radiogroup" aria-label="Period">
        {#each periods as p (p.name)}<button role="radio" aria-checked={period.name === p.name} class:on={period.name === p.name} onclick={() => (period = p)}>{p.name}</button>{/each}
      </div>
    </header>
    <FlowChart flow={theFlow} {color} format={fmt} onpick={(g) => onshow(g.toLowerCase())} />
  </section>

  <div class="two">
    <section class="panel">
      <header>
        <h3>Net worth</h3>
        {#if summary.units.length > 1}
          <select aria-label="Measured in" onchange={(e) => (unit = summary.units[(e.currentTarget as HTMLSelectElement).selectedIndex])}>
            {#each summary.units as u (u.unit)}<option selected={u.unit === unit.unit}>{u.name}</option>{/each}
          </select>
        {/if}
      </header>
      <WealthChart points={worth} format={fmtU} />
    </section>
    <section class="panel">
      <header><h3>Accounts</h3></header>
      <ul class="accts">
        {#each cash as a (a.account)}
          <li><button onclick={() => onaccount(a.account)}><span>{label(a.account)}</span><span class="v">{Object.entries(a.balances).filter(([, v]) => Math.abs(num(v)) > 0.005).map(([c, v]) => (/^[A-Z]{3}$/.test(c) ? money(num(v), c) : `${num(v)} ${c}`)).join(" · ")}</span></button></li>
        {/each}
      </ul>
    </section>
  </div>

  <div class="two">
    <section class="panel"><Capture {atlas} {onchange} /></section>
    <section class="panel"><Import {atlas} {onchange} /></section>
  </div>
</div>

<style>
  .overview { display: flex; flex-direction: column; gap: 16px; max-width: 1180px; }
  .hero { display: flex; flex-wrap: wrap; gap: 12px 40px; align-items: flex-end; padding: 4px 2px 8px; }
  .big { display: flex; flex-direction: column; gap: 2px; margin-right: auto; }
  .k { font-size: 0.78em; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); font-weight: 600; }
  .big .n { font-size: 2.3em; font-weight: 650; color: var(--heading); font-variant-numeric: tabular-nums; line-height: 1.1; }
  .deltas { display: flex; gap: 14px; font-size: 0.9em; color: var(--text-muted); flex-wrap: wrap; }
  .stat { display: flex; flex-direction: column; gap: 2px; }
  .stat .n { font-size: 1.35em; font-weight: 600; font-variant-numeric: tabular-nums; color: var(--text); }
  .stat small { font-size: 0.7em; color: var(--text-muted); font-weight: 500; }
  .up { color: var(--green) !important; }
  .down { color: var(--red) !important; }
  .link { all: unset; cursor: pointer; border-bottom: 1px dashed var(--border-strong); }
  .link:hover { color: var(--accent) !important; }
  .link:focus-visible { outline: 2px solid var(--accent); }
  .attention { display: flex; flex-wrap: wrap; gap: 8px; padding: 10px 12px; border-radius: var(--radius); background: var(--highlight-bg); }
  .attention button { all: unset; cursor: pointer; padding: 3px 10px; border-radius: 999px; background: var(--bg-elev); border: 1px solid var(--border-strong); font-size: 0.9em; }
  .attention button:hover { border-color: var(--accent); }
  .attention button:focus-visible { outline: 2px solid var(--accent); }
  .attention .err { color: var(--red); }
  .attention span { font-size: 0.9em; align-self: center; }
  .panel { background: var(--bg-elev); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 14px 16px; min-width: 0; }
  .panel header { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; }
  h3 { margin: 0; font-size: 0.78em; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); font-weight: 600; }
  .seg { display: flex; flex-wrap: wrap; border: 1px solid var(--border-strong); border-radius: var(--radius); overflow: hidden; }
  .seg button { all: unset; cursor: pointer; padding: 4px 9px; font-size: 0.85em; color: var(--text-muted); }
  .seg button + button { border-left: 1px solid var(--border); }
  .seg button:hover { background: var(--bg-hover); color: var(--text); }
  .seg button.on { background: var(--accent-soft); color: var(--accent-strong); font-weight: 600; }
  .seg button:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  select { font: inherit; font-size: 0.88em; color: var(--text); background: var(--bg); border: 1px solid var(--border-strong); border-radius: var(--radius-sm); padding: 3px 6px; }
  .two { display: grid; grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); gap: 16px; }
  @container (max-width: 820px) { .two { grid-template-columns: minmax(0, 1fr); } }
  .accts { list-style: none; margin: 0; padding: 0; }
  .accts button { all: unset; box-sizing: border-box; cursor: pointer; width: 100%; display: flex; justify-content: space-between; gap: 12px; padding: 7px 4px; border-bottom: 1px solid var(--border); }
  .accts button:hover { background: var(--bg-hover); }
  .accts button:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  .accts .v { font-family: var(--font-mono); font-size: 0.9em; font-variant-numeric: tabular-nums; text-align: right; }
</style>
