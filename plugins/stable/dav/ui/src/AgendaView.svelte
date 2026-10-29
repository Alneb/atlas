<script lang="ts">
  // Agenda (Google's "schedule"): the coming days as a list grouped by day, only days with something; also the
  // search's results (each event once, at its next occurrence). The one view beside the day at phone width.
  import { addDays, evEnd, evStart, notePath, sameDay, startOfDay, timeText, type Ev } from "./api";
  import { onDay } from "./layout";
  import type { Cal } from "./store.svelte";
  import Icon from "./Icon.svelte";

  let { cal, events, from, to, selected, onselect, search = false }: {
    cal: Cal; events: Ev[]; from: Date; to: Date; selected: Ev | null; search?: boolean;
    onselect: (e: Ev, at: DOMRect) => void;
  } = $props();

  const groups = $derived.by(() => {
    if (search) {
      const by = new Map<number, Ev[]>();
      for (const e of events) { const k = startOfDay(evStart(e)).getTime(); by.set(k, [...(by.get(k) ?? []), e]); }
      return [...by.entries()].map(([k, evs]) => ({ day: new Date(k), evs }));
    }
    const out: { day: Date; evs: Ev[] }[] = [];
    for (let d = from; d <= to; d = addDays(d, 1)) {
      const evs = onDay(events, d).sort((a, b) => Number(!a.all_day) - Number(!b.all_day) || evStart(a).getTime() - evStart(b).getTime());
      if (evs.length) out.push({ day: d, evs });
    }
    return out;
  });
  const color = (e: Ev) => e.color ?? cal.colorOf(e.calendar);
  const isSel = (e: Ev) => selected !== null && selected.uid === e.uid && selected.rid === e.rid && selected.calendar === e.calendar;
  function when(e: Ev, d: Date): string {
    if (e.all_day) return "All day";
    const s = evStart(e), en = evEnd(e);
    const a = sameDay(s, d) ? timeText(s, cal.h12) : "…";
    const b = sameDay(en, d) || (en.getTime() - startOfDay(d).getTime() <= 86_400_000 && en.getHours() === 0 && en.getMinutes() === 0) ? timeText(en, cal.h12) : "…";
    return `${a} – ${b}`;
  }
</script>

<div class="agenda">
  {#if !groups.length}
    <div class="empty">{search ? "No event matches." : "Nothing in the coming days."}</div>
  {/if}
  {#each groups as g (g.day.getTime())}
    <section class="day" class:today={sameDay(g.day, cal.now)}>
      <button class="date" onclick={() => cal.go(g.day, "day")} title="Open this day">
        <span class="n">{g.day.getDate()}</span>
        <span class="w">{g.day.toLocaleDateString(undefined, { weekday: "short" })}<br />{g.day.toLocaleDateString(undefined, { month: "short", year: g.day.getFullYear() === cal.now.getFullYear() ? undefined : "numeric" })}</span>
      </button>
      <ul>
        {#each g.evs as e (e.calendar + e.uid + (e.rid ?? ""))}
          <li>
            <button class="row" class:sel={isSel(e)} class:cancel={e.status === "CANCELLED"} style:--c={color(e)} onclick={(ev) => onselect(e, (ev.currentTarget as HTMLElement).getBoundingClientRect())}>
              <span class="dot" aria-hidden="true"></span>
              <span class="time">{when(e, g.day)}</span>
              <span class="what">{e.summary || "(no title)"}{#if e.location}<span class="loc">{" · "}{e.location}</span>{/if}</span>
              {#if e.recurring}<span class="ic" title="Repeats"><Icon name="repeat" size={13} /></span>{/if}
              {#if notePath(e)}<span class="ic" title="From a note"><Icon name="note" size={13} /></span>{/if}
              <span class="cal">{e.calendar_name}</span>
            </button>
          </li>
        {/each}
      </ul>
    </section>
  {/each}
</div>

<style>
  .agenda { height: 100%; overflow-y: auto; padding: 6px 0 40px; }
  .empty { padding: 40px; text-align: center; color: var(--text-faint); }
  .day { display: grid; grid-template-columns: 92px 1fr; gap: 8px; padding: 6px 14px; border-bottom: 1px solid var(--border); }
  .date { all: unset; cursor: pointer; display: flex; gap: 8px; align-items: flex-start; padding: 4px 0; color: var(--text-muted); }
  .n { font-size: 1.5em; font-weight: 650; color: var(--heading); min-width: 1.6em; text-align: right; font-variant-numeric: tabular-nums; line-height: 1.1; }
  .w { font-size: 0.75em; text-transform: uppercase; letter-spacing: 0.04em; line-height: 1.35; }
  .today .n { color: var(--accent-strong); }
  .date:focus-visible, .row:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 1px; min-width: 0; }
  .row { all: unset; box-sizing: border-box; cursor: pointer; display: flex; align-items: center; gap: 10px; width: 100%; padding: 6px 8px; border-radius: var(--radius-sm); min-width: 0; }
  .row:hover { background: var(--bg-hover); }
  .row.sel { background: color-mix(in srgb, var(--c) 16%, var(--bg)); }
  .dot { width: 9px; height: 9px; border-radius: 50%; background: var(--c); flex: none; }
  .time { flex: none; width: 11.5em; white-space: nowrap; color: var(--text-muted); font-variant-numeric: tabular-nums; font-size: 0.9em; }
  .what { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text); }
  .loc { color: var(--text-muted); }
  .cancel .what { text-decoration: line-through; opacity: 0.7; }
  .ic { color: var(--text-faint); flex: none; }
  .cal { flex: none; color: var(--text-faint); font-size: 0.8em; max-width: 12em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  @container (max-width: 560px) {
    .day { grid-template-columns: 1fr; gap: 0; padding: 6px 10px; }
    .date { padding-bottom: 0; }
    .time { width: auto; min-width: 5.5em; }
    .cal { display: none; }
  }
</style>
