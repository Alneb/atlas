// Where events go: timed ones in a day column side by side when they overlap (clusters of overlapping events share
// the width, each in the first free column — what every calendar does), all-day ones as bars over a row of days.
import { DAY, addDays, evEnd, evStart, laneEvent, startOfDay, type Ev } from "./api";

export interface Placed { e: Ev; top: number; bottom: number; col: number; cols: number; startsBefore: boolean; endsAfter: boolean }

/** The timed events of one day (clipped to it), in minutes from its midnight, with their column. */
export function dayColumns(events: Ev[], day: Date): Placed[] {
  const d0 = startOfDay(day).getTime(), d1 = addDays(startOfDay(day), 1).getTime();
  const items = events
    .filter((e) => !laneEvent(e))
    .map((e) => ({ e, s: evStart(e).getTime(), t: Math.max(evEnd(e).getTime(), evStart(e).getTime() + 15 * 60_000) }))
    .filter((x) => x.s < d1 && x.t > d0)
    .sort((a, b) => a.s - b.s || b.t - a.t);
  const out: Placed[] = [];
  let cluster: (Placed & { t: number })[] = [];
  let clusterEnd = -Infinity;
  const flush = () => {
    const cols = Math.max(1, ...cluster.map((c) => c.col + 1));
    for (const c of cluster) out.push({ e: c.e, top: c.top, bottom: c.bottom, col: c.col, cols, startsBefore: c.startsBefore, endsAfter: c.endsAfter });
    cluster = [];
  };
  for (const x of items) {
    if (x.s >= clusterEnd) flush();
    const s = Math.max(x.s, d0), t = Math.min(x.t, d1);
    const used = new Set(cluster.filter((c) => c.t > x.s).map((c) => c.col));
    let col = 0;
    while (used.has(col)) col++;
    cluster.push({ e: x.e, top: (s - d0) / 60_000, bottom: (t - d0) / 60_000, col, cols: 1, startsBefore: x.s < d0, endsAfter: x.t > d1, t: x.t });
    clusterEnd = Math.max(clusterEnd, x.t);
  }
  flush();
  return out;
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
