<script lang="ts">
  // The Investments tab (DESIGN-finance "UI: Investments"): what is held in lots with cost, value and gain; the gains
  // realised per year; the money-weighted return (XIRR); the money held in other currencies with what the rate's
  // moves made of it and the rate's history; the prices in use, and fetching new ones (`prices`, also run daily).
  import { call, label, money, num, type Invest, type PluginApi } from "./api";
  let { atlas, cur }: { atlas: PluginApi; cur: string } = $props();
  let data = $state<Invest | null>(null);
  let error = $state("");
  let busy = $state(false);
  let open = $state<string | null>(null);

  export async function load() {
    try { data = await call<Invest>(atlas, "invest"); error = ""; } catch (e) { error = (e as Error).message; }
  }
  load();

  async function update() {
    busy = true;
    try {
      const r = await call<{ summary: string; errors: string[] }>(atlas, "prices", {});
      atlas.toast("Prices", r.errors.length ? `${r.summary}: ${r.errors.join("; ")}` : r.summary, r.errors.length ? "error" : undefined);
      await load();
    } catch (e) { atlas.toast("Prices not fetched", (e as Error).message, "error"); } finally { busy = false; }
  }

  const value = $derived(data?.holdings.reduce((t, h) => t + num(h.value), 0) ?? 0);
  const cost = $derived(data?.holdings.reduce((t, h) => t + num(h.cost), 0) ?? 0);
  const realised = $derived(data?.realised.reduce((t, r) => t + num(r.gain), 0) ?? 0);
  const fmtUnits = (s: string) => Number(s).toLocaleString(undefined, { maximumFractionDigits: 6 });
  const age = (d: string) => Math.round((Date.now() - new Date(`${d}T12:00:00`).getTime()) / 86400000);
  function plot(host: HTMLElement, h: [string, string][]) {
    const xs = h.map((_, i) => i - (h.length - 1));
    return { destroy: atlas.plot(host, { x: xs, ys: [h.map(([, r]) => num(r))], xLabel: `months before ${h.at(-1)?.[0] ?? ""}`, yLabels: [cur] }) };
  }
</script>

{#if error}
  <div class="atlas-notice error">{error}<div class="actions"><button class="atlas-btn" onclick={load}>Try again</button></div></div>
{:else if !data}
  <div class="atlas-empty">Reading the lots…</div>
{:else}
  <div class="grid">
    <section class="card tiles wide">
      <div class="tile"><span class="n">{money(value, cur, { whole: true })}</span><span>held in lots</span></div>
      <div class="tile"><span class="n" class:neg={value - cost < 0} class:pos={value - cost > 0}>{money(value - cost, cur, { sign: true, whole: true })}</span><span>unrealised</span></div>
      <div class="tile"><span class="n" class:pos={realised > 0}>{money(realised, cur, { sign: true, whole: true })}</span><span>realised, all years</span></div>
      <div class="tile"><span class="n">{data.xirr === null ? "—" : `${(data.xirr * 100).toFixed(1)} %`}</span><span>a year (XIRR, money-weighted)</span></div>
    </section>

    <section class="card wide">
      <h3>Holdings</h3>
      {#each data.holdings as h (h.account + h.commodity)}
        <button class="hold" onclick={() => (open = open === h.commodity ? null : h.commodity)}>
          <span class="name">{h.name ?? h.commodity}<span class="faint"> · {label(h.account)}</span></span>
          <span class="num">{fmtUnits(h.units)} {h.commodity}</span>
          <span class="num">{h.value ? money(num(h.value), cur) : "no price"}</span>
          <span class="num" class:neg={num(h.gain) < 0} class:pos={num(h.gain) > 0}>{h.gain ? money(num(h.gain), cur, { sign: true }) : ""}</span>
          <span class="faint small">{h.price ? `${num(h.price.price)} ${cur} on ${h.price.date}${age(h.price.date) > 7 ? ` (${age(h.price.date)} days old)` : ""}` : "no price: Update prices"}</span>
        </button>
        {#if open === h.commodity}
          <table class="lots">
            <thead><tr><th>bought</th><th class="num">units</th><th class="num">cost</th></tr></thead>
            <tbody>{#each h.lots as x, i (i)}<tr><td>{x.date}</td><td class="num">{fmtUnits(x.units)}</td><td class="num">{x.cost ?? "unknown"}</td></tr>{/each}</tbody>
          </table>
        {/if}
      {:else}
        <div class="atlas-empty">Nothing held in lots now (funds, stocks). Gains realised before are below.</div>
      {/each}
      {#if data.realised.length}
        <div class="realised">{#each data.realised as r (r.year)}<span><b>{r.year}</b> {money(num(r.gain), cur, { sign: true })}</span>{/each}<span class="faint">realised gains (the booked Income:Gains)</span></div>
      {/if}
    </section>

    <section class="card wide">
      <h3>Currencies <span class="faint">money held in other currencies, in {cur}</span></h3>
      {#each data.currencies as c (c.currency)}
        <div class="fx">
          <div class="fxhead">
            <span class="name"><b>{money(num(c.amount), c.currency)}</b></span>
            <span class="num">{c.value ? money(num(c.value), cur) : "no rate yet"}</span>
            <span class="faint">{c.rate ? `1 ${c.currency} = ${num(c.rate).toFixed(4)} ${cur}` : ""}</span>
            <span class="num" class:neg={num(c.fx_gain) < 0} class:pos={num(c.fx_gain) > 0} title="its value now against what each amount was worth in {cur} the day it came in">{c.fx_gain ? `${money(num(c.fx_gain), cur, { sign: true })} from the rate` : ""}</span>
          </div>
          {#if c.history.length > 1}{#key c.history}<div class="plot" use:plot={c.history}></div>{/key}{/if}
        </div>
      {:else}
        <div class="atlas-empty">Everything is in {cur}.</div>
      {/each}
    </section>

    <section class="card wide">
      <h3>Prices <span class="faint">finance/prices/, kept sparse; fetched daily</span></h3>
      <div class="quotes">
        {#each data.prices as q (q.base + q.quote)}<span title="{q.base} in {q.quote}"><b>{q.base}</b> {num(q.price).toLocaleString(undefined, { maximumFractionDigits: 4 })} {q.quote} <span class="faint">{q.date}</span></span>{/each}
      </div>
      <button class="atlas-btn" disabled={busy} onclick={update}>{busy ? "Fetching…" : "Update prices"}</button>
    </section>
  </div>
{/if}

<style>
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 14px; }
  .card { background: var(--bg-elev); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px 16px; min-width: 0; }
  .wide { grid-column: 1 / -1; }
  h3 { margin: 0 0 10px; font-size: 0.82em; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); font-weight: 600; }
  .faint { color: var(--text-faint); font-weight: 400; text-transform: none; letter-spacing: 0; }
  .small { font-size: 0.85em; }
  .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
  .tile { display: flex; flex-direction: column; gap: 2px; padding: 4px 6px; color: var(--text-muted); }
  .tile .n { font-size: 1.5em; font-weight: 650; color: var(--text); font-variant-numeric: tabular-nums; }
  .pos { color: var(--green) !important; }
  .neg { color: var(--red) !important; }
  .hold { all: unset; cursor: pointer; display: grid; grid-template-columns: 1fr auto auto 7em; gap: 2px 14px; padding: 6px 8px; border-radius: var(--radius-sm); width: 100%; box-sizing: border-box; }
  .hold:hover { background: var(--bg-hover); }
  .hold .small { grid-column: 1 / -1; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .lots { margin: 0 0 8px 16px; border-collapse: collapse; font-variant-numeric: tabular-nums; font-size: 0.92em; }
  .lots th { text-align: left; font-weight: 500; color: var(--text-faint); padding: 2px 10px; }
  .lots td { padding: 2px 10px; border-top: 1px solid var(--border); }
  .realised { display: flex; flex-wrap: wrap; gap: 4px 16px; margin-top: 8px; font-variant-numeric: tabular-nums; }
  .fx { padding: 4px 0 10px; border-bottom: 1px solid var(--border); }
  .fx:last-child { border-bottom: 0; }
  .fxhead { display: flex; flex-wrap: wrap; gap: 6px 18px; align-items: baseline; }
  .plot { margin-top: 8px; max-width: 980px; }
  .quotes { display: flex; flex-wrap: wrap; gap: 4px 18px; margin-bottom: 10px; font-variant-numeric: tabular-nums; }
  @media (max-width: 700px) { .hold { grid-template-columns: 1fr auto; } }
</style>
