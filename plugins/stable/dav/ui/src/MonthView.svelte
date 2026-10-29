<script lang="ts">
  // Month (DESIGN-calendar §2): six weeks; all-day and many-day events as bars across their days, timed ones as
  // lines with their hour; what does not fit is "+n more", which opens that day. A click on a day's empty space makes
  // an all-day event there; its number opens the day.
  import { addDays, evStart, sameDay, startOfDay, timeText, type Ev } from "./api";
  import { laneBars, onDay } from "./layout";
  import { laneEvent } from "./api";
  import type { Cal } from "./store.svelte";

  let { cal, days, selected, onselect, oncreate }: {
    cal: Cal; days: Date[]; selected: Ev | null;
    onselect: (e: Ev, at: DOMRect) => void;
    oncreate: (start: Date, end: Date, allDay: boolean, at: DOMRect) => void;
  } = $props();

  const ROWS = 4; // item rows a cell shows
  const weeks = $derived(Array.from({ length: Math.ceil(days.length / 7) }, (_, w) => days.slice(w * 7, w * 7 + 7)));
  const month = $derived(cal.cursor.getMonth());
  const color = (e: Ev) => e.color ?? cal.colorOf(e.calendar);
  const isSel = (e: Ev) => selected !== null && selected.uid === e.uid && selected.rid === e.rid && selected.calendar === e.calendar;
  const key = (e: Ev) => e.calendar + e.uid + (e.rid ?? "");

  function layout(week: Date[]) {
    const bars = laneBars(cal.events, week);
    const used = Math.min(ROWS, Math.max(0, ...bars.map((b) => b.row + 1)));
    const shownBars = bars.filter((b) => b.row < ROWS - (bars.some((x) => x.row >= ROWS) ? 1 : 0));
    const cells = week.map((d, i) => {
      const timed = onDay(cal.events, d).filter((e) => !laneEvent(e)).sort((a, b) => evStart(a).getTime() - evStart(b).getTime());
      const barsHere = bars.filter((b) => b.from <= i && b.to >= i);
      const hiddenBars = barsHere.filter((b) => !shownBars.includes(b)).length;
      const room = Math.max(0, ROWS - used - 1);
      const fits = timed.length + hiddenBars <= room + 1 ? timed.slice(0, room + 1) : timed.slice(0, room);
      return { timed: fits, more: timed.length - fits.length + hiddenBars, total: timed.length + barsHere.length };
    });
    return { bars: shownBars, used, cells };
  }

  function empty(ev: MouseEvent, d: Date) {
    if ((ev.target as HTMLElement).closest("button")) return;
    oncreate(startOfDay(d), addDays(startOfDay(d), 1), true, (ev.currentTarget as HTMLElement).getBoundingClientRect());
  }
</script>

<div class="month" style:--rows={weeks.length}>
  <div class="wds">
    {#each weeks[0] ?? [] as d (d.getDay())}<div class="wd">{d.toLocaleDateString(undefined, { weekday: "short" })}</div>{/each}
  </div>
  <div class="weeks">
    {#each weeks as week, w (w)}
      {@const L = layout(week)}
      <div class="week">
        {#each week as d, i (i)}
          <div class="cell" class:other={d.getMonth() !== month} class:today={sameDay(d, cal.now)} class:weekend={d.getDay() === 0 || d.getDay() === 6}
            style:grid-column={i + 1} role="button" tabindex="-1" aria-label="New event on {d.toLocaleDateString()}" onclick={(ev) => empty(ev, d)} onkeydown={() => {}}>
            <button class="num" onclick={() => cal.go(d, "day")} title="Open this day">{d.getDate() === 1 ? d.toLocaleDateString(undefined, { day: "numeric", month: "short" }) : d.getDate()}</button>
          </div>
        {/each}
        {#each L.bars as b (key(b.e) + b.from)}
          <button class="bar" class:sel={isSel(b.e)} class:clipl={b.clippedStart} class:clipr={b.clippedEnd} style:--c={color(b.e)} style:grid-column="{b.from + 1} / {b.to + 2}" style:grid-row={b.row + 2}
            onclick={(ev) => onselect(b.e, (ev.currentTarget as HTMLElement).getBoundingClientRect())} title={b.e.summary}>{b.e.summary || "(no title)"}</button>
        {/each}
        {#each L.cells as c, i (i)}
          {#each c.timed as e, k (key(e))}
            <button class="line" class:sel={isSel(e)} class:cancel={e.status === "CANCELLED"} style:--c={color(e)} style:grid-column={i + 1} style:grid-row={L.used + 2 + k}
              onclick={(ev) => onselect(e, (ev.currentTarget as HTMLElement).getBoundingClientRect())} title="{timeText(evStart(e), cal.h12)} {e.summary}">
              <span class="dot" aria-hidden="true"></span><span class="tm">{timeText(evStart(e), cal.h12)}</span><span class="tt">{e.summary || "(no title)"}</span>
            </button>
          {/each}
          {#if c.more > 0}
            <button class="more" style:grid-column={i + 1} style:grid-row={L.used + 2 + c.timed.length} onclick={() => cal.go(week[i], "day")}>+{c.more} more</button>
          {/if}
        {/each}
      </div>
    {/each}
  </div>
</div>

<style>
  .month { display: grid; grid-template-rows: auto 1fr; height: 100%; min-height: 0; }
  .wds { display: grid; grid-template-columns: repeat(7, 1fr); border-bottom: 1px solid var(--border); }
  .wd { padding: 6px 8px; font-size: 0.75em; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-faint); }
  .weeks { display: grid; grid-template-rows: repeat(var(--rows), minmax(96px, 1fr)); min-height: 0; overflow-y: auto; }
  .week { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); grid-template-rows: 26px repeat(4, 21px) 1fr; row-gap: 1px; border-bottom: 1px solid var(--border); position: relative; min-height: 0; }
  .cell { grid-row: 1 / -1; border-left: 1px solid var(--border); padding: 2px 4px; cursor: cell; min-width: 0; }
  .cell:first-child { border-left: 0; }
  .cell.weekend { background: color-mix(in srgb, var(--bg-alt) 70%, transparent); }
  .cell.other { background: color-mix(in srgb, var(--bg-alt) 90%, transparent); }
  .cell.other .num { color: var(--text-faint); }
  .num { all: unset; cursor: pointer; font-size: 0.82em; font-weight: 600; color: var(--text-muted); padding: 1px 6px; border-radius: 999px; font-variant-numeric: tabular-nums; }
  .num:hover { background: var(--bg-hover); color: var(--text); }
  .today .num { background: var(--accent); color: var(--accent-fg); }
  .num:focus-visible, .bar:focus-visible, .line:focus-visible, .more:focus-visible { outline: 2px solid var(--accent); outline-offset: -1px; }
  .bar, .line, .more { all: unset; box-sizing: border-box; cursor: pointer; z-index: 1; min-width: 0; font-size: 0.8em; line-height: 20px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .bar { margin: 0 3px; padding: 0 7px; border-radius: var(--radius-sm); background: color-mix(in srgb, var(--c) 26%, var(--bg)); border-left: 3px solid var(--c); color: var(--text); }
  .bar.clipl { margin-left: 0; border-top-left-radius: 0; border-bottom-left-radius: 0; }
  .bar.clipr { margin-right: 0; border-top-right-radius: 0; border-bottom-right-radius: 0; }
  .line { display: flex; align-items: center; gap: 5px; margin: 0 3px; padding: 0 4px; border-radius: var(--radius-sm); color: var(--text); }
  .line:hover, .bar:hover { background: color-mix(in srgb, var(--c) 18%, var(--bg-hover)); }
  .sel { outline: 2px solid var(--c); outline-offset: -1px; }
  .cancel .tt { text-decoration: line-through; opacity: 0.7; }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--c); flex: none; }
  .tm { color: var(--text-muted); font-variant-numeric: tabular-nums; flex: none; }
  .tt { overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .more { margin: 0 3px; padding: 0 6px; color: var(--text-muted); font-weight: 600; border-radius: var(--radius-sm); }
  .more:hover { background: var(--bg-hover); color: var(--text); }
  @container (max-width: 760px) { .tm { display: none; } }
</style>
