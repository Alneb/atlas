// Where events go: timed ones in a day column, all-day ones as bars over a row of days.
//
// A day's timed events are laid out the way Google Calendar and Thunderbird do it, so titles stay readable:
// - events that start together (within `STACK_MIN` of each other) go side by side, in columns made only within a
//   cluster that really overlaps, each in the first free column (a later event reuses an earlier one's column);
// - an event that starts at least `STACK_MIN` after a running one (whose title is then visible above it) takes a
//   column freed in that one's cluster if there is one, else is drawn over it, indented by `INSET` px, to its right
//   edge: a long afternoon event keeps its width and the meetings during it cascade on top of it, instead of all of
//   them sharing narrow columns;
// - each then widens to the right across the columns where nothing overlaps it.
// The boxes are linear in the column's width (`Box`: a fraction plus pixels), so CSS draws them with one calc().
// Cost: the sort, plus per event a scan of the events running at its start and of its cluster's columns.
import { DAY, addDays, evEnd, evStart, laneEvent, startOfDay, type Ev } from "./api";

/** An event starting this many minutes after a running one is drawn over it, indented (half an hour: a title line). */
export const STACK_MIN = 30;
/** The indent, in px, of an event drawn over another. */
export const INSET = 14;

/** A horizontal box in a day column: `left = x·100% + xpx px`, `width = w·100% + wpx px`. */
export interface Box { x: number; xpx: number; w: number; wpx: number }
export interface Placed {
  e: Ev; top: number; bottom: number;
  /** how many events it is drawn over (0: on the column itself); later and deeper ones are drawn on top */
  depth: number;
  box: Box; startsBefore: boolean; endsAfter: boolean;
}

interface Node {
  e: Ev; top: number; bottom: number; startsBefore: boolean; endsAfter: boolean;
  depth: number; host: Node | null; col: number; span: number; cols: number; box: Box;
  /** the events side by side with it (its host's), and those drawn over it */
  among: Columns; over: Columns;
}

/** The timed events of one day (clipped to it), in minutes from its midnight, with their box. */
export function dayColumns(events: Ev[], day: Date, stack = STACK_MIN, inset = INSET): Placed[] {
  const d0 = startOfDay(day).getTime(), d1 = addDays(startOfDay(day), 1).getTime();
  const root = new Columns();
  const nodes: Node[] = events
    .filter((e) => !laneEvent(e))
    .map((e) => ({ e, s: evStart(e).getTime(), t: Math.max(evEnd(e).getTime(), evStart(e).getTime() + 15 * 60_000) }))
    .filter((x) => x.s < d1 && x.t > d0)
    .map((x) => ({
      e: x.e, top: (Math.max(x.s, d0) - d0) / 60_000, bottom: (Math.min(x.t, d1) - d0) / 60_000,
      startsBefore: x.s < d0, endsAfter: x.t > d1, depth: 0, host: null, col: 0, span: 1, cols: 1, box: FULL,
      among: root, over: new Columns(),
    }))
    // by start, the longer first: an event's host (below) always comes before it
    .sort((a, b) => a.top - b.top || b.bottom - a.bottom);

  // 1. where each goes, in start order: the host is the deepest running event that started `stack` minutes before or
  // earlier; with none, an event starting beside running ones goes next to the deepest of them (same host)
  let running: Node[] = [];
  for (const n of nodes) {
    running = running.filter((r) => r.bottom > n.top);
    let host: Node | null = null, beside: Node | null = null;
    for (const r of running) {
      if (r.top <= n.top - stack) { if (!host || r.depth >= host.depth) host = r; }
      else if (!beside || r.depth >= beside.depth) beside = r;
    }
    // a column freed beside the host (its cluster still running) beats an indent over it
    if (host && host.among.hasFree(n.top)) host = host.host;
    else if (!host && beside) host = beside.host;
    n.host = host;
    n.depth = host ? host.depth + 1 : 0;
    n.among = host ? host.over : root;
    n.among.add(n);
    running.push(n);
  }
  // 2. boxes, hosts first (the order of `nodes`): a host's box, indented, is the frame of the events over it
  root.finish();
  for (const n of nodes) n.over.finish();
  for (const n of nodes) {
    const f = n.host ? { x: n.host.box.x, xpx: n.host.box.xpx + inset, w: n.host.box.w, wpx: n.host.box.wpx - inset } : FULL;
    const a = n.col / n.cols, len = n.span / n.cols;
    n.box = { x: f.x + a * f.w, xpx: f.xpx + a * f.wpx, w: len * f.w, wpx: len * f.wpx };
  }
  return nodes.map((n) => ({ e: n.e, top: n.top, bottom: n.bottom, depth: n.depth, box: n.box, startsBefore: n.startsBefore, endsAfter: n.endsAfter }));
}

const FULL: Box = { x: 0, xpx: 0, w: 1, wpx: 0 };

/** Side-by-side columns for sibling events, added in start order: per cluster of overlaps, the first free column;
 * at the end of a cluster each is widened to the right up to the first column holding an event that overlaps it. */
class Columns {
  private cluster: Node[] = [];
  private ends: number[] = []; // per column: the end of its last event
  private end = -Infinity;

  /** Whether the running cluster has a column free at `t` (one of two or more: a lone event's is no gap). */
  hasFree(t: number): boolean {
    return t < this.end && this.ends.length > 1 && this.ends.some((e) => e <= t);
  }

  add(n: Node) {
    if (n.top >= this.end) this.finish();
    let col = this.ends.findIndex((t) => t <= n.top);
    if (col < 0) { col = this.ends.length; this.ends.push(n.bottom); } else this.ends[col] = n.bottom;
    n.col = col;
    this.cluster.push(n);
    this.end = Math.max(this.end, n.bottom);
  }

  finish() {
    const k = this.ends.length;
    const byCol: Node[][] = this.ends.map(() => []);
    for (const n of this.cluster) byCol[n.col].push(n);
    for (const n of this.cluster) {
      n.cols = k;
      let c = n.col + 1;
      while (c < k && !overlapsAny(byCol[c], n)) c++;
      n.span = c - n.col;
    }
    this.cluster = []; this.ends = []; this.end = -Infinity;
  }
}

/** Whether any of a column's events (by start, never overlapping each other) overlaps `n`: a binary search. */
function overlapsAny(col: Node[], n: Node): boolean {
  let lo = 0, hi = col.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (col[m].bottom <= n.top) lo = m + 1; else hi = m; }
  return lo < col.length && col[lo].top < n.bottom;
}

export interface Bar { e: Ev; from: number; to: number; row: number; clippedStart: boolean; clippedEnd: boolean }

/** The all-day (and day-long) events over `days`, as bars (first and last day index) on rows. */
export function laneBars(events: Ev[], days: Date[]): Bar[] {
  if (!days.length) return [];
  const first = startOfDay(days[0]).getTime();
  // midnights only: rounding absorbs a 23 h or 25 h day (DST)
  const index = (t: number) => Math.round((t - first) / DAY);
  const bars = events
    .filter(laneEvent)
    .map((e) => {
      const s = evStart(e).getTime();
      // an end at midnight belongs to the day before
      const t = evEnd(e).getTime() - 1;
      return { e, a: index(startOfDay(new Date(s)).getTime()), b: index(startOfDay(new Date(Math.max(s, t))).getTime()) };
    })
    .filter((x) => x.b >= 0 && x.a < days.length)
    .sort((x, y) => x.a - y.a || y.b - y.a - (x.b - x.a));
  const rows: number[] = []; // per row: the last day index taken
  return bars.map((x) => {
    const from = Math.max(0, x.a), to = Math.min(days.length - 1, x.b);
    let row = rows.findIndex((last) => last < from);
    if (row < 0) { row = rows.length; rows.push(to); } else rows[row] = to;
    return { e: x.e, from, to, row, clippedStart: x.a < 0, clippedEnd: x.b > days.length - 1 };
  });
}

/** The events touching a day (for a month cell, the agenda, the year's shading). */
export function onDay(events: Ev[], day: Date): Ev[] {
  const d0 = startOfDay(day).getTime(), d1 = addDays(startOfDay(day), 1).getTime();
  return events.filter((e) => {
    const s = evStart(e).getTime(), t = Math.max(evEnd(e).getTime(), s + 1);
    return s < d1 && t > d0;
  });
}
