<script lang="ts">
  // Week, work week and day (DESIGN-calendar §2): the all-day lane on top, the hours down the side in the user's
  // locale, the now-line, overlapping events side by side. Drag on empty space makes an event, drag an event moves it
  // (across days too), drag its lower edge resizes it — 15-minute steps; Esc cancels; a click selects.
  import { onMount } from "svelte";
  import { addDays, evEnd, evStart, sameDay, startOfDay, timeText, notePath, type Ev } from "./api";
  import { dayColumns, laneBars } from "./layout";
  import type { Cal } from "./store.svelte";

  let { cal, days, selected, onselect, oncreate }: {
    cal: Cal; days: Date[]; selected: Ev | null;
    onselect: (e: Ev, at: DOMRect) => void;
    oncreate: (start: Date, end: Date, allDay: boolean, at: DOMRect) => void;
  } = $props();

  const HOUR = 48;
  const SNAP = 15;
  let scroller: HTMLDivElement | undefined = $state();
  let cols: HTMLDivElement | undefined = $state();

  const placed = $derived(days.map((d) => dayColumns(cal.events, d)));
  const bars = $derived(laneBars(cal.events, days));
  const laneRows = $derived(Math.max(1, ...bars.map((b) => b.row + 1)));
  const hours = Array.from({ length: 24 }, (_, h) => h);
  // 00–23 on the 24-hour clock (the 00 line is the top edge, left unlabelled)
  const hourLabel = (h: number) => (h === 0 ? "" : cal.h12 ? new Date(2000, 0, 1, h).toLocaleTimeString(undefined, { hour: "numeric", hour12: true }) : String(h).padStart(2, "0"));
  const nowMin = $derived(cal.now.getHours() * 60 + cal.now.getMinutes());
  const isSel = (e: Ev) => selected !== null && selected.uid === e.uid && selected.rid === e.rid && selected.calendar === e.calendar;
  const color = (e: Ev) => e.color ?? cal.colorOf(e.calendar);

  onMount(() => {
    const h = Number(cal.settings.day_start ?? 8);
    const today = days.some((d) => sameDay(d, cal.now));
    // today: the now-line in the upper third; else the morning
    const at = today ? Math.max(0, (nowMin / 60 - 2)) : h;
    if (scroller) scroller.scrollTop = Math.max(0, at * HOUR - 8);
  });

  // ----- dragging

  type Drag = { kind: "create" | "move" | "resize"; e?: Ev; day: number; from: number; to: number; grab: number; x0: number; y0: number; moved: boolean; len: number };
  let drag = $state<Drag | null>(null);

  const snap = (m: number) => Math.round(m / SNAP) * SNAP;
  function where(ev: PointerEvent): { day: number; min: number } {
    const r = cols!.getBoundingClientRect();
    const day = Math.min(days.length - 1, Math.max(0, Math.floor(((ev.clientX - r.left) / r.width) * days.length)));
    const min = Math.min(24 * 60, Math.max(0, ((ev.clientY - r.top) / HOUR) * 60));
    return { day, min };
  }

  function down(ev: PointerEvent, kind: Drag["kind"], e?: Ev, top = 0, bottom = 0) {
    if (ev.button !== 0) return;
    ev.stopPropagation();
    const p = where(ev);
    if (kind === "create") {
      const m = Math.floor(p.min / SNAP) * SNAP;
      drag = { kind, day: p.day, from: m, to: m + 60, grab: m, x0: ev.clientX, y0: ev.clientY, moved: false, len: 60 };
    } else {
      drag = { kind, e, day: p.day, from: top, to: bottom, grab: p.min - top, x0: ev.clientX, y0: ev.clientY, moved: false, len: bottom - top };
    }
    (ev.currentTarget as HTMLElement).setPointerCapture?.(ev.pointerId);
    document.body.style.userSelect = "none";
  }

  function move(ev: PointerEvent) {
    if (!drag) return;
    if (!drag.moved && Math.hypot(ev.clientX - drag.x0, ev.clientY - drag.y0) < 4) return;
    const p = where(ev);
    const d = drag;
    d.moved = true;
    if (d.kind === "create") {
      const m = snap(p.min);
      [d.from, d.to] = m >= d.grab ? [d.grab, Math.max(d.grab + SNAP, m)] : [m, d.grab + SNAP];
    } else if (d.kind === "move") {
      const top = snap(p.min - d.grab);
      d.day = p.day;
      d.from = Math.max(0, Math.min(24 * 60 - SNAP, top));
      d.to = d.from + d.len;
    } else {
      d.to = Math.max(d.from + SNAP, snap(p.min));
    }
    drag = { ...d };
  }

  async function up(ev: PointerEvent) {
    const d = drag;
    drag = null;
    document.body.style.userSelect = "";
    if (!d) return;
    const t = (day: number, min: number) => new Date(days[day].getFullYear(), days[day].getMonth(), days[day].getDate(), 0, min);
    if (d.kind === "create") {
      // the popover points at the new slot
      const r = cols!.getBoundingClientRect(), w = r.width / days.length;
      oncreate(t(d.day, d.from), t(d.day, d.to), false, new DOMRect(r.left + d.day * w, r.top + (d.from / 60) * HOUR, w, ((d.to - d.from) / 60) * HOUR));
      return;
    }
    const rect = ((ev.target as HTMLElement).closest(".ev") ?? (ev.target as HTMLElement)).getBoundingClientRect();
    const e = d.e!;
    if (!d.moved) { onselect(e, rect); return; }
    if (!e.writable) { cal.toast(`${e.calendar_name || "This calendar"} is read-only`, "error"); return; }
    const start = t(d.day, d.from), end = t(d.day, d.to);
    const scope = await cal.askScope(e, d.kind === "move" ? "Move" : "Change");
    if (!scope) return;
    const pad = (n: number) => String(n).padStart(2, "0");
    const w = (x: Date) => `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}T${pad(x.getHours())}:${pad(x.getMinutes())}`;
    await cal.change(e, { start: w(start), end: w(end), from_start: e.start }, scope, d.kind === "move" ? "Moved" : "Resized");
  }

  function key(ev: KeyboardEvent) {
    if (drag && ev.key === "Escape") { drag = null; document.body.style.userSelect = ""; ev.stopPropagation(); }
  }

  function laneClick(ev: MouseEvent, day: number) {
    if ((ev.target as HTMLElement).closest(".bar")) return;
    const d = days[day];
    oncreate(startOfDay(d), addDays(startOfDay(d), 1), true, (ev.currentTarget as HTMLElement).getBoundingClientRect());
  }
</script>

<svelte:window onkeydown={key} />

<div class="tg" style:--n={days.length} style:--hour="{HOUR}px">
  <div class="head">
    <div class="gutter tz" title="Times in your zone">{Intl.DateTimeFormat().resolvedOptions().timeZone.split("/").pop()?.replace("_", " ")}</div>
    {#each days as d, i (i)}
      <button class="dayhead" class:today={sameDay(d, cal.now)} onclick={() => cal.go(d, "day")} title="Open this day">
        <span class="wd">{d.toLocaleDateString(undefined, { weekday: "short" })}</span>
        <span class="num">{d.getDate()}</span>
      </button>
    {/each}
  </div>
  <div class="lane" style:--rows={laneRows}>
    <div class="gutter label">all-day</div>
    <div class="lanecols">
      {#each days as _d, i (i)}<div class="lanecell" role="button" tabindex="-1" aria-label="New all-day event" style:grid-column={i + 1} onclick={(ev) => laneClick(ev, i)} onkeydown={() => {}}></div>{/each}
      {#each bars as b (b.e.calendar + b.e.uid + (b.e.rid ?? "") + b.from)}
        <button class="bar ev" class:sel={isSel(b.e)} class:clipl={b.clippedStart} class:clipr={b.clippedEnd} class:cancel={b.e.status === "CANCELLED"} style:--c={color(b.e)}
          style:grid-column="{b.from + 1} / {b.to + 2}" style:grid-row={b.row + 1}
          onclick={(ev) => onselect(b.e, (ev.currentTarget as HTMLElement).getBoundingClientRect())} title={b.e.summary}>
          {#if notePath(b.e)}<span class="dot" aria-hidden="true"></span>{/if}{b.e.summary || "(no title)"}
        </button>
      {/each}
    </div>
  </div>
  <div class="scroll" bind:this={scroller}>
    <div class="body">
      <div class="gutter hours">
        {#each hours as h (h)}<div class="hl" style:top="{h * HOUR}px">{hourLabel(h)}</div>{/each}
      </div>
      <div class="cols" bind:this={cols} role="grid" tabindex="-1" aria-label="Hours" onpointermove={move} onpointerup={up} onpointercancel={() => (drag = null)}>
        {#each days as d, i (i)}
          <div class="col" class:today={sameDay(d, cal.now)} class:weekend={d.getDay() === 0 || d.getDay() === 6} role="gridcell" tabindex="-1" onpointerdown={(ev) => down(ev, "create")}>
            {#each placed[i] as p (p.e.calendar + p.e.uid + (p.e.rid ?? ""))}
              {@const short = p.bottom - p.top < 40}
              <div class="ev" class:sel={isSel(p.e)} class:short class:ro={!p.e.writable} class:cancel={p.e.status === "CANCELLED"} class:free={p.e.free}
                class:ghosted={drag?.e === p.e && drag.moved}
                style:--c={color(p.e)} style:top="{(p.top / 60) * HOUR}px" style:height="{Math.max(14, ((p.bottom - p.top) / 60) * HOUR - 2)}px"
                style:left="calc({(p.col / p.cols) * 100}% + 1px)" style:width="calc({(1 / p.cols) * 100}% - 3px)"
                role="button" tabindex="0" aria-label="{p.e.summary}, {timeText(evStart(p.e), cal.h12)}"
                onpointerdown={(ev) => (p.startsBefore || p.endsAfter ? ev.stopPropagation() : down(ev, "move", p.e, p.top, p.bottom))}
                onclick={(ev) => { if (p.startsBefore || p.endsAfter) onselect(p.e, (ev.currentTarget as HTMLElement).getBoundingClientRect()); }}
                onkeydown={(ev) => { if (ev.key === "Enter") onselect(p.e, (ev.currentTarget as HTMLElement).getBoundingClientRect()); }}>
                <span class="t">{p.e.summary || "(no title)"}</span>
                <span class="when">{timeText(evStart(p.e), cal.h12)}{short ? "" : ` – ${timeText(evEnd(p.e), cal.h12)}`}</span>
                {#if !short && p.e.location}<span class="loc">{p.e.location}</span>{/if}
                {#if p.e.writable && !p.endsAfter}<div class="grip" role="separator" aria-label="Change the end" onpointerdown={(ev) => down(ev, "resize", p.e, p.top, p.bottom)}></div>{/if}
              </div>
            {/each}
            {#if drag && drag.moved && drag.day === i}
              <div class="ev slot-ghost" style:--c={drag.e ? color(drag.e) : "var(--accent)"} style:top="{(drag.from / 60) * HOUR}px" style:height="{((drag.to - drag.from) / 60) * HOUR - 2}px" style:left="1px" style:width="calc(100% - 3px)">
                <span class="t">{drag.e?.summary ?? "New event"}</span>
                <span class="when">{timeText(new Date(2000, 0, 1, 0, drag.from), cal.h12)} – {timeText(new Date(2000, 0, 1, 0, drag.to), cal.h12)}</span>
              </div>
            {/if}
            {#if sameDay(d, cal.now)}<div class="now" style:top="{(nowMin / 60) * HOUR}px" aria-hidden="true"></div>{/if}
          </div>
        {/each}
      </div>
    </div>
  </div>
</div>

<style>
  .tg { display: grid; grid-template-rows: auto auto 1fr; height: 100%; min-height: 0; --gutter: 56px; }
  .head, .lane { display: grid; grid-template-columns: var(--gutter) 1fr; border-bottom: 1px solid var(--border); }
  .head { grid-template-columns: var(--gutter) repeat(var(--n), 1fr); }
  .gutter { color: var(--text-faint); font-size: 0.75em; }
  .tz { align-self: end; padding: 0 6px 6px; font-size: 0.68em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dayhead { all: unset; cursor: pointer; display: flex; align-items: baseline; justify-content: center; gap: 6px; padding: 6px 2px; color: var(--text-muted); border-left: 1px solid var(--border); min-width: 0; }
  .dayhead:hover { background: var(--bg-hover); }
  .dayhead:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  .wd { font-size: 0.78em; text-transform: uppercase; letter-spacing: 0.04em; }
  .num { font-size: 1.25em; font-weight: 600; color: var(--heading); font-variant-numeric: tabular-nums; min-width: 1.8em; text-align: center; border-radius: 999px; }
  .dayhead.today .wd { color: var(--accent-strong); }
  .dayhead.today .num { background: var(--accent); color: var(--accent-fg); }
  .label { align-self: center; padding: 0 6px; text-align: right; }
  .lanecols { display: grid; grid-template-columns: repeat(var(--n), 1fr); grid-auto-rows: 22px; row-gap: 2px; padding: 3px 0; min-height: 26px; max-height: 120px; overflow-y: auto; }
  .lanecell { grid-row: 1 / span var(--rows); border-left: 1px solid var(--border); cursor: cell; }
  .bar { all: unset; box-sizing: border-box; cursor: pointer; z-index: 1; margin: 0 3px; padding: 0 8px; border-radius: var(--radius-sm); background: color-mix(in srgb, var(--c) 26%, var(--bg)); color: var(--text); font-size: 0.82em; line-height: 22px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; gap: 6px; border-left: 3px solid var(--c); }
  .bar.clipl { border-top-left-radius: 0; border-bottom-left-radius: 0; margin-left: 0; }
  .bar.clipr { border-top-right-radius: 0; border-bottom-right-radius: 0; margin-right: 0; }
  .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--c); flex: none; }
  .scroll { overflow-y: auto; min-height: 0; position: relative; }
  .body { position: relative; display: grid; grid-template-columns: var(--gutter) 1fr; height: calc(24 * var(--hour)); }
  .hours { position: relative; }
  .hl { position: absolute; right: 8px; transform: translateY(-50%); font-variant-numeric: tabular-nums; white-space: nowrap; }
  .cols { display: grid; grid-template-columns: repeat(var(--n), 1fr); position: relative; touch-action: pan-y; }
  .col { position: relative; border-left: 1px solid var(--border); cursor: cell; min-width: 0;
    background-image: repeating-linear-gradient(to bottom, var(--border) 0 1px, transparent 1px var(--hour)), repeating-linear-gradient(to bottom, transparent 0 calc(var(--hour) / 2), color-mix(in srgb, var(--border) 45%, transparent) calc(var(--hour) / 2) calc(var(--hour) / 2 + 1px), transparent calc(var(--hour) / 2 + 1px) var(--hour)); }
  .col.weekend { background-color: color-mix(in srgb, var(--bg-alt) 70%, transparent); }
  .ev { position: absolute; box-sizing: border-box; cursor: pointer; border-radius: var(--radius-sm); padding: 2px 6px; overflow: hidden; display: flex; flex-direction: column; gap: 0; font-size: 0.8em; line-height: 1.25;
    background: color-mix(in srgb, var(--c) 24%, var(--bg)); border-left: 3px solid var(--c); color: var(--text); box-shadow: 0 0 0 1px var(--bg); touch-action: none; z-index: 1; }
  .ev:hover { background: color-mix(in srgb, var(--c) 34%, var(--bg)); }
  .ev:focus-visible, .ev.sel, .bar.sel, .bar:focus-visible { outline: 2px solid var(--c); outline-offset: 1px; z-index: 3; }
  .ev.short { flex-direction: row; gap: 6px; align-items: baseline; }
  .ev.short .t { flex: 0 1 auto; min-width: 2.5em; }
  .ev.short .when { flex: 0 100 auto; min-width: 0; }
  .ev.ro { cursor: default; }
  .ev.free { background: color-mix(in srgb, var(--c) 10%, var(--bg)); }
  .ev.cancel .t, .bar.cancel { text-decoration: line-through; opacity: 0.7; }
  .ev.ghosted { opacity: 0.35; }
  .t { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .when, .loc { color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-variant-numeric: tabular-nums; }
  .grip { position: absolute; left: 0; right: 0; bottom: 0; height: 7px; cursor: ns-resize; }
  .slot-ghost { z-index: 4; pointer-events: none; box-shadow: var(--shadow-md, 0 4px 16px rgba(0,0,0,.25)); background: color-mix(in srgb, var(--c) 40%, var(--bg)); }
  .now { position: absolute; left: -1px; right: 0; height: 2px; background: var(--red); z-index: 5; pointer-events: none; }
  .now::before { content: ""; position: absolute; left: -5px; top: -4px; width: 10px; height: 10px; border-radius: 50%; background: var(--red); }
  @media (prefers-reduced-motion: no-preference) { .ev { transition: opacity 120ms var(--ease); } }
</style>
