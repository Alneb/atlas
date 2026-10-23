<script lang="ts">
  // This month against its budget, one bar per category (DESIGN-finance "Budget"): the fill is what was spent, the
  // tick the budget (a pinned target, else the usual month), the faint mark where the month's pace puts it today.
  // Over-budget categories come first (the engine's order) and are drawn warm.
  import { label, money, monthName, num, type Budget, type BudgetLine } from "./api";
  let { budget, cur, limit = 99, onpin }: { budget: Budget; cur: string; limit?: number; onpin?: (l: BudgetLine) => void } = $props();
  const goal = (l: BudgetLine) => num(l.target ?? l.usual);
  const lines = $derived(budget.lines.filter((l) => num(l.spent) >= 0.5 || goal(l) >= 0.5).slice(0, limit));
  const top = $derived(Math.max(1, ...lines.map((l) => Math.max(num(l.spent), goal(l)))));
  const spent = $derived(lines.reduce((t, l) => t + num(l.spent), 0));
  const total = $derived(lines.reduce((t, l) => t + goal(l), 0));
  const pace = $derived(num(budget.elapsed));
</script>

<div class="spending">
  <div class="head">
    <span class="title">{monthName(budget.month)}{#if pace < 1}<span class="faint"> · {Math.round(pace * 100)} % through</span>{/if}</span>
    <span class="total">{money(spent, cur, { whole: true })} <span class="faint">of {money(total, cur, { whole: true })}</span></span>
  </div>
  {#each lines as l (l.account)}
    {@const g = goal(l)}
    {@const s = num(l.spent)}
    {@const over = s > g * 1.05 && s - g > 1}
    <div class="row" title="{l.account}: {money(s, cur)} this month; {l.target ? `target ${money(num(l.target), cur)} (pinned on its note)` : `${money(num(l.usual), cur)} in a usual month (the median of the months before, or the mean for a category of only some months)`}">
      <span class="name">{label(l.account)}{#if l.target}<span class="pin" title="pinned target">◆</span>{/if}</span>
      <span class="bar">
        <span class="fill" class:over style:width="{(100 * Math.max(s, 0)) / top}%"></span>
        {#if pace < 1 && g > 0}<span class="pace" style:left="{(100 * g * pace) / top}%"></span>{/if}
        <span class="tick" style:left="{(100 * g) / top}%"></span>
      </span>
      <span class="num" class:over>{money(s, cur, { whole: true })}<span class="faint">&nbsp;/ {Math.round(g)}</span></span>
      {#if onpin}<button class="pinbtn" title="Pin a target for {label(l.account)}" onclick={() => onpin(l)}>{l.target ? "edit" : "pin"}</button>{/if}
    </div>
  {:else}
    <div class="atlas-empty">No spending this month.</div>
  {/each}
  {#if budget.unpriced.length}<div class="faint">Not counted, no price into {cur} yet: {budget.unpriced.join(", ")}.</div>{/if}
</div>

<style>
  .spending { display: grid; gap: 6px; }
  .head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; margin-bottom: 2px; }
  .title { font-weight: 600; }
  .total { font-variant-numeric: tabular-nums; }
  .faint { color: var(--text-faint); font-size: 0.9em; font-weight: 400; }
  .row { display: grid; grid-template-columns: minmax(80px, 11em) 1fr 8em auto; align-items: center; gap: 10px; }
  .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-muted); }
  .pin { color: var(--accent); margin-left: 4px; font-size: 0.75em; }
  .bar { position: relative; height: 10px; border-radius: 5px; background: var(--bg-hover); }
  .fill { position: absolute; inset: 0 auto 0 0; border-radius: 5px; background: var(--accent); opacity: 0.75; }
  .fill.over { background: var(--yellow); opacity: 0.9; }
  .tick { position: absolute; top: -3px; bottom: -3px; width: 2px; margin-left: -1px; background: var(--text-muted); border-radius: 1px; }
  .pace { position: absolute; top: 1px; bottom: 1px; width: 2px; margin-left: -1px; background: var(--text-faint); opacity: 0.6; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .num.over { font-weight: 600; }
  .pinbtn { all: unset; cursor: pointer; color: var(--text-faint); font-size: 0.82em; padding: 0 4px; }
  .pinbtn:hover { color: var(--accent); }
  @media (max-width: 700px) { .row { grid-template-columns: minmax(70px, 8em) 1fr 6.5em; } .pinbtn { display: none; } }
</style>
