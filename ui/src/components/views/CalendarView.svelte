<script lang="ts">
  // The `calendar` view: a month grid (Monday first) of dated items; ‹ › change month, undated items
  // are listed under it. A click opens the item (a task at its line); a checkbox ticks a task.
  import type { ViewRow } from "../../lib/gen/ViewRow";
  import { openPath } from "../../lib/dock";
  import ListView from "./ListView.svelte";
  let { rows, ontick }: { rows: ViewRow[]; ontick: (r: ViewRow) => void } = $props();

  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const today = iso(new Date());
  // start on the month of the next dated item (else the last one, else now)
  const dated = $derived(rows.filter((r) => r.date).sort((a, b) => a.date!.localeCompare(b.date!)));
  const pick = () => { const d = dated.find((r) => r.date! >= today) ?? dated[dated.length - 1]; return d ? new Date(d.date! + "T00:00") : new Date(); };
  // svelte-ignore state_referenced_locally -- the first month only seeds the navigation
  let month = $state(new Date(pick().getFullYear(), pick().getMonth(), 1));
  const byDay = $derived.by(() => { const m = new Map<string, ViewRow[]>(); for (const r of dated) { if (!m.has(r.date!)) m.set(r.date!, []); m.get(r.date!)!.push(r); } return m; });
  const days = $derived.by(() => {
    const first = new Date(month), lead = (first.getDay() + 6) % 7;
    const start = new Date(first); start.setDate(1 - lead);
    return Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  });
  const title = $derived(month.toLocaleDateString(undefined, { month: "long", year: "numeric" }));
  const step = (n: number) => (month = new Date(month.getFullYear(), month.getMonth() + n, 1));
  const undated = $derived(rows.filter((r) => !r.date));
</script>

<div class="cal atlas-view-calendar">
  <header>
    <button onclick={() => step(-1)} aria-label="Previous month">‹</button>
    <span class="t">{title}</span>
    <button onclick={() => step(1)} aria-label="Next month">›</button>
  </header>
  <div class="grid">
    {#each ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as w}<div class="wd">{w}</div>{/each}
    {#each days as d (iso(d))}
      <div class="day" class:out={d.getMonth() !== month.getMonth()} class:today={iso(d) === today}>
        <span class="n">{d.getDate()}</span>
        {#each byDay.get(iso(d)) ?? [] as r (`${r.path}:${r.line}:${r.title}`)}
          <div class="item" class:done={r.done}>
            {#if r.done === false}<input type="checkbox" aria-label="Done: {r.title}" onchange={() => ontick(r)} />{/if}
            <button onclick={() => r.path && openPath(r.path, r.line ?? undefined)} title="{r.title} — {r.path}">{r.title}</button>
          </div>
        {/each}
      </div>
    {/each}
  </div>
  {#if undated.length}<div class="undated"><span class="h">No date</span><ListView rows={undated} {ontick} /></div>{/if}
</div>

<style>
  .cal { font-size: calc(12.5px * var(--ui-scale, 1)); }
  header { display: flex; align-items: center; gap: 8px; padding: 4px 6px; }
  header .t { font-weight: 600; color: var(--heading); text-transform: capitalize; min-width: 9em; text-align: center; }
  header button { width: 24px; height: 22px; border-radius: 4px; color: var(--text-muted); }
  header button:hover { background: var(--bg-hover); color: var(--text); }
  .grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 1px; background: var(--border); border: 1px solid var(--border); border-radius: 6px; overflow: hidden; }
  .wd { background: var(--bg-alt); color: var(--text-faint); font-size: .85em; text-align: center; padding: 2px 0; }
  .day { background: var(--bg); min-height: 62px; padding: 2px 3px; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .day.out { background: var(--bg-alt); }
  .day.out .n { opacity: .45; }
  .day.today .n { background: var(--accent); color: var(--accent-fg); border-radius: 999px; padding: 0 5px; }
  .n { align-self: flex-end; font-size: .85em; color: var(--text-muted); font-variant-numeric: tabular-nums; }
  .item { display: flex; align-items: center; gap: 3px; background: var(--accent-soft); border-radius: 4px; padding: 0 3px; min-width: 0; }
  .item button { color: var(--text); text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; flex: 1; font-size: .92em; }
  .item.done { opacity: .55; }
  .item.done button { text-decoration: line-through; }
  .item input { margin: 0; width: 11px; height: 11px; accent-color: var(--accent); }
  .undated { margin-top: 6px; }
  .undated .h { font-size: .85em; text-transform: uppercase; letter-spacing: .06em; color: var(--text-faint); padding: 0 8px; }
</style>
