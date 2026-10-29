<script lang="ts">
  // Year (Apple's idea): twelve small months, each day shaded by how busy it is; a click opens that day.
  import { addDays, sameDay, startOfWeek } from "./api";
  import { onDay } from "./layout";
  import type { Cal } from "./store.svelte";

  let { cal }: { cal: Cal } = $props();
  const year = $derived(cal.cursor.getFullYear());
  const counts = $derived.by(() => {
    const m = new Map<string, number>();
    for (let d = new Date(year, 0, 1); d.getFullYear() === year; d = addDays(d, 1)) m.set(d.toDateString(), onDay(cal.events, d).length);
    return m;
  });
  const most = $derived(Math.max(1, ...counts.values()));
  function grid(month: number): Date[] {
    const s = startOfWeek(new Date(year, month, 1), cal.first);
    return Array.from({ length: 42 }, (_, i) => addDays(s, i));
  }
  const heads = $derived(Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(new Date(), cal.first), i).toLocaleDateString(undefined, { weekday: "narrow" })));
</script>

<div class="year">
  {#each Array.from({ length: 12 }, (_, m) => m) as m (m)}
    <section>
      <button class="mname" onclick={() => cal.go(new Date(year, m, 1), "month")}>{new Date(year, m, 1).toLocaleDateString(undefined, { month: "long" })}</button>
      <div class="days">
        {#each heads as h, i (i)}<span class="h">{h}</span>{/each}
        {#each grid(m) as d (d.getTime())}
          {@const n = d.getMonth() === m ? (counts.get(d.toDateString()) ?? 0) : 0}
          {#if d.getMonth() === m}
            <button class="d" class:today={sameDay(d, cal.now)} style:--k={n / most} title="{d.toLocaleDateString()}: {n} event{n === 1 ? '' : 's'}" onclick={() => cal.go(d, "day")}>{d.getDate()}</button>
          {:else}<span></span>{/if}
        {/each}
      </div>
    </section>
  {/each}
</div>

<style>
  .year { height: 100%; overflow-y: auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 18px 24px; padding: 16px 20px 40px; align-content: start; }
  .mname { all: unset; cursor: pointer; font-weight: 650; color: var(--heading); margin-bottom: 6px; display: block; }
  .mname:hover { color: var(--accent-strong); }
  .days { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
  .h { font-size: 0.7em; color: var(--text-faint); text-align: center; }
  .d { all: unset; cursor: pointer; text-align: center; font-size: 0.78em; padding: 3px 0; border-radius: var(--radius-sm); font-variant-numeric: tabular-nums; color: var(--text-muted);
    background: color-mix(in srgb, var(--accent) calc(var(--k) * 55%), transparent); }
  .d:hover { outline: 1px solid var(--accent); }
  .d:focus-visible { outline: 2px solid var(--accent); }
  .d.today { background: var(--accent); color: var(--accent-fg); font-weight: 700; }
</style>
