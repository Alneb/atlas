import { test, expect } from "@playwright/test";
import { dayColumns, INSET, STACK_MIN, type Placed } from "../../plugins/stable/dav/ui/src/layout";
import type { Ev } from "../../plugins/stable/dav/ui/src/api";

// The Calendar's week / day layout (plugins/stable/dav/ui/src/layout.ts `dayColumns`): columns only where events
// start together and overlap, widened across free columns; an event starting later is drawn over a running one,
// indented, instead of taking a narrow column of its own.
const DAY = new Date(2030, 0, 7);
const ev = (summary: string, from: string, to: string): Ev => ({
  uid: summary, summary, start: `2030-01-07T${from}:00`, end: `2030-01-07T${to}:00`, all_day: false,
  recurring: false, free: false, calendar: "work/home", calendar_name: "Work", writable: true,
});
const layout = (...evs: Ev[]) => {
  const out = dayColumns(evs, DAY);
  return Object.fromEntries(out.map((p) => [p.e.summary, p])) as Record<string, Placed>;
};
const near = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

test("the layout's constants are a title line and a visible indent", () => {
  expect(STACK_MIN).toBe(30);
  expect(INSET).toBeGreaterThan(8);
});

test("events that do not overlap take the whole width", () => {
  const p = layout(ev("A", "09:00", "10:00"), ev("B", "10:00", "11:00"), ev("C", "13:00", "13:30"));
  for (const k of ["A", "B", "C"]) {
    expect(p[k].depth).toBe(0);
    expect(p[k].box).toEqual({ x: 0, xpx: 0, w: 1, wpx: 0 });
  }
  expect(p.A.top).toBe(9 * 60);
  expect(p.B.bottom).toBe(11 * 60);
});

test("two events at the same time share the width in two columns", () => {
  const p = layout(ev("A", "10:00", "11:00"), ev("B", "10:00", "11:00"));
  near(p.A.box.x, 0); near(p.A.box.w, 0.5);
  near(p.B.box.x, 0.5); near(p.B.box.w, 0.5);
  expect(p.A.depth + p.B.depth).toBe(0);
});

test("a long event keeps the whole width; short ones during it are drawn over it, indented", () => {
  const p = layout(ev("Long", "15:00", "23:00"), ev("Talk", "17:00", "18:00"), ev("Call", "19:30", "20:00"));
  expect(p.Long.box).toEqual({ x: 0, xpx: 0, w: 1, wpx: 0 });
  for (const k of ["Talk", "Call"]) {
    expect(p[k].depth).toBe(1);
    near(p[k].box.x, 0); near(p[k].box.w, 1);
    expect(p[k].box.xpx).toBe(INSET);
    expect(p[k].box.wpx).toBe(-INSET);
  }
});

test("two short events at once over a long one split the indented width between them", () => {
  const p = layout(ev("Long", "15:00", "23:00"), ev("A", "17:00", "18:00"), ev("B", "17:00", "18:00"));
  expect(p.A.depth).toBe(1); expect(p.B.depth).toBe(1);
  // left = x·100% + xpx: A from the indent, B from the middle of what is left after it
  near(p.A.box.x, 0); expect(p.A.box.xpx).toBe(INSET);
  near(p.A.box.w, 0.5); expect(p.A.box.wpx).toBe(-INSET / 2);
  near(p.B.box.x, 0.5); expect(p.B.box.xpx).toBe(INSET / 2);
  near(p.B.box.w, 0.5); expect(p.B.box.wpx).toBe(-INSET / 2);
});

test("an event starting during a nested one cascades one indent further", () => {
  const p = layout(ev("Long", "15:00", "23:00"), ev("A", "17:00", "19:00"), ev("B", "18:00", "18:30"));
  expect(p.B.depth).toBe(2);
  expect(p.B.box.xpx).toBe(2 * INSET);
  near(p.B.box.w, 1);
});

test("a chain A∩B, B∩C (not A∩C) of events starting together: C reuses A's column", () => {
  const p = layout(ev("A", "09:00", "09:30"), ev("B", "09:15", "10:00"), ev("C", "09:30", "10:00"));
  for (const k of ["A", "B", "C"]) expect(p[k].depth).toBe(0);
  near(p.A.box.x, 0); near(p.A.box.w, 0.5);
  near(p.B.box.x, 0.5); near(p.B.box.w, 0.5);
  near(p.C.box.x, 0); near(p.C.box.w, 0.5);
});

test("an event widens to the right across columns where nothing overlaps it", () => {
  // Y (the longer, column 0), X (column 1), Z (column 2) start together; W starts as X and Z have ended: X's column,
  // widened over Z's, which holds nothing at its time
  const p = layout(ev("X", "09:00", "09:20"), ev("Y", "09:00", "09:40"), ev("Z", "09:05", "09:15"), ev("W", "09:20", "09:35"));
  for (const k of ["X", "Y", "Z", "W"]) expect(p[k].depth).toBe(0);
  near(p.Y.box.x, 0); near(p.Y.box.w, 1 / 3);
  near(p.X.box.x, 1 / 3); near(p.X.box.w, 1 / 3);
  near(p.Z.box.x, 2 / 3); near(p.Z.box.w, 1 / 3);
  near(p.W.box.x, 1 / 3); near(p.W.box.w, 2 / 3);
});

test("a short event in the first column widens over a later column it does not overlap", () => {
  // B (the longer, column 0), A (column 1) and C (column 2) start together; E, once A and B have ended, goes in
  // column 0 and overlaps only C → widens over A's column
  const p = layout(ev("A", "09:00", "09:20"), ev("B", "09:00", "09:25"), ev("C", "09:05", "10:00"), ev("E", "09:25", "09:50"));
  expect(p.E.depth).toBe(0);
  near(p.E.box.x, 0); near(p.E.box.w, 2 / 3);
});

test("a later event takes a column freed beside a running one rather than an indent over it", () => {
  // Planning (column 0) runs on; Interview's and Sync's columns are free at 15:00 → Talk sits there, widened over both
  const p = layout(ev("Planning", "14:00", "16:00"), ev("Interview", "14:00", "15:00"), ev("Sync", "14:10", "14:40"), ev("Talk", "15:00", "16:30"));
  expect(p.Talk.depth).toBe(0);
  near(p.Planning.box.w, 1 / 3);
  near(p.Talk.box.x, 1 / 3); near(p.Talk.box.w, 2 / 3);
  // with no free column (a lone long event), it is drawn over, indented
  const q = layout(ev("Planning", "14:00", "16:00"), ev("Talk", "15:00", "16:30"));
  expect(q.Talk.depth).toBe(1);
  expect(q.Planning.box).toEqual({ x: 0, xpx: 0, w: 1, wpx: 0 });
});

test("events clipped to the day: one from the night before starts at the top", () => {
  const night: Ev = { ...ev("Night", "00:00", "02:00"), start: "2030-01-06T22:00:00" };
  const p = layout(night, ev("Early", "01:00", "01:30"));
  expect(p.Night.top).toBe(0);
  expect(p.Night.startsBefore).toBe(true);
  expect(p.Early.depth).toBe(1);
});

test("many events stay fast (a pure layout)", () => {
  const evs: Ev[] = [];
  for (let i = 0; i < 2000; i++) {
    const m = (i * 7) % (23 * 60), d = 15 + ((i * 13) % 120);
    const hm = (x: number) => `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`;
    evs.push({ ...ev(`E${i}`, hm(m), hm(Math.min(23 * 60 + 59, m + d))), uid: `E${i}` });
  }
  const t0 = performance.now();
  const out = dayColumns(evs, DAY);
  const ms = performance.now() - t0;
  expect(out.length).toBe(2000);
  expect(ms).toBeLessThan(500);
  for (const p of out) { expect(p.box.w).toBeGreaterThan(0); expect(p.box.x + p.box.w).toBeLessThanOrEqual(1 + 1e-9); }
});
