<script lang="ts">
  // The Budget tab (DESIGN-finance "Budget = your normal month"): this month per category against its usual month or
  // a pinned target, the savings rate month by month, and the recurring payments with their next date. Every number
  // is the engine's (`budget`, in summary); pinning a target writes the category's note (`set_target`).
  import { call, label, money, monthName, num, type Budget, type BudgetLine, type PluginApi } from "./api";
  import Spending from "./Spending.svelte";
  let { atlas, budget, cur, onchange }: { atlas: PluginApi; budget: Budget; cur: string; onchange: () => void } = $props();

  function pin(l: BudgetLine) {
    const usual = Math.round(num(l.usual));
    const items = [
      { value: `${usual} ${cur}`, title: `${money(usual, cur, { whole: true })}, the usual month`, detail: "pin it as it is" },
      ...(l.target ? [{ value: "", title: "Unpin", detail: `back to the usual month (${money(usual, cur, { whole: true })})` }] : []),
    ];
    atlas.pick({
      placeholder: `Monthly target for ${label(l.account)} (e.g. 250)`, tag: "Finance", items,
      typed: (s) => `Pin ${/[A-Za-z]/.test(s) ? s : `${s} ${cur}`} a month`,
      onpick: async (v) => {
        const target = v && !/[A-Za-z]/.test(v) ? `${v} ${cur}` : v;
        try {
          const r = await call<{ path: string }>(atlas, "set_target", { account: l.account, target });
          atlas.toast(target ? "Target pinned" : "Target unpinned", `${label(l.account)}: ${target || "the usual month"} (${r.path})`);
          onchange();
        } catch (e) { atlas.toast("Not pinned", (e as Error).message, "error"); }
      },
    });
  }

  const months = $derived(budget.months.slice(0, 12));
  const top = $derived(Math.max(1, ...months.map((m) => Math.max(num(m.income) + num(m.unknown_in), num(m.spent) + num(m.unknown_out)))));
  const perMonth = $derived(budget.recurring.filter((r) => num(r.per_month) > 0).reduce((t, r) => t + num(r.per_month), 0));
  const inMonth = $derived(-budget.recurring.filter((r) => num(r.per_month) < 0).reduce((t, r) => t + num(r.per_month), 0));
  const rate = (m: (typeof months)[number]) => (m.rate ?? m.rate_all);
</script>

<div class="grid">
  <section class="card wide"><Spending {budget} {cur} onpin={pin} /></section>

  <section class="card">
    <h3>Saved per month <span class="faint">income − spending, the uncategorised drawn hatched</span></h3>
    {#each months as m (m.month)}
      {@const inc = num(m.income)}
      {@const sp = num(m.spent)}
      {@const r = rate(m)}
      <div class="mrow" title="{monthName(m.month)}: income {money(inc, cur)} (+{money(num(m.unknown_in), cur)} uncategorised), spent {money(sp, cur)} (+{money(num(m.unknown_out), cur)} uncategorised)">
        <span class="mname">{m.month}</span>
        <span class="pair">
          <span class="in" style:width="{(100 * inc) / top}%"></span><span class="in hatch" style:width="{(100 * num(m.unknown_in)) / top}%"></span>
          <br />
          <span class="out" style:width="{(100 * sp) / top}%"></span><span class="out hatch" style:width="{(100 * num(m.unknown_out)) / top}%"></span>
        </span>
        <span class="rate" class:neg={r !== null && num(r) < 0}>{r === null ? "—" : `${Math.round(num(r) * 100)} %`}{#if m.rate === null && m.rate_all !== null}<span class="faint">*</span>{/if}</span>
      </div>
    {/each}
    <div class="faint legend"><span class="sw in"></span> income <span class="sw out"></span> spending · * counting the uncategorised as income and spending</div>
  </section>

  <section class="card">
    <h3>Recurring <span class="faint">{money(perMonth, cur, { whole: true })} a month out{#if inMonth > 0}, {money(inMonth, cur, { whole: true })} in{/if}</span></h3>
    {#each budget.recurring as r (r.path + r.line)}
      <button class="rec" onclick={() => atlas.open(r.path, r.line)} title="{r.count} times, last {r.last}">
        <span class="payee">{r.payee}<span class="faint"> · {label(r.account)}</span></span>
        <span class="num" class:income={num(r.amount) < 0}>{money(Math.abs(num(r.amount)), cur)}<span class="faint">&nbsp;{r.period}</span></span>
        <span class="next faint">next {r.next}</span>
      </button>
    {:else}
      <div class="atlas-empty">Nothing comes back regularly yet: three payments at a steady period and amount make a recurring one.</div>
    {/each}
  </section>
</div>

<style>
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 14px; }
  .card { background: var(--bg-elev); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px 16px; min-width: 0; }
  .wide { grid-column: 1 / -1; }
  h3 { margin: 0 0 10px; font-size: 0.82em; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); font-weight: 600; }
  .faint { color: var(--text-faint); font-weight: 400; text-transform: none; letter-spacing: 0; }
  .mrow { display: grid; grid-template-columns: 5.5em 1fr 5em; gap: 8px; align-items: center; padding: 2px 0; }
  .mname { color: var(--text-muted); font-variant-numeric: tabular-nums; }
  .pair { line-height: 0; }
  .pair span { display: inline-block; height: 6px; vertical-align: top; }
  .in { background: var(--green); opacity: 0.8; border-radius: 3px 0 0 3px; }
  .out { background: var(--accent); opacity: 0.8; border-radius: 3px 0 0 3px; }
  .hatch { opacity: 0.35; border-radius: 0 3px 3px 0; background-image: repeating-linear-gradient(45deg, transparent 0 2px, var(--bg-elev) 2px 4px); }
  .rate { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .rate.neg { color: var(--red); }
  .legend { margin-top: 8px; font-size: 0.85em; }
  .sw { display: inline-block; width: 10px; height: 6px; border-radius: 2px; margin: 0 2px 0 6px; }
  .rec { all: unset; cursor: pointer; display: grid; grid-template-columns: 1fr auto; gap: 0 10px; padding: 5px 8px; border-radius: var(--radius-sm); }
  .rec:hover { background: var(--bg-hover); }
  .payee { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .num.income { color: var(--green); }
  .next { grid-column: 1 / -1; font-size: 0.85em; }
</style>
