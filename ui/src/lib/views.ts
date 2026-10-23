// Row views (docs/guides/MALLEABLE.md R2/R4): a view draws rows — tasks, notes — into a host. The core
// turns a block's YAML into rows (/api/view); list, table and calendar draw them, and plugins add
// more (`atlas.registerView`). Everything else a block can be lives in lib/blocks.ts.
import { errText } from "./text";
import { mount, unmount } from "svelte";
import { api } from "./api";
import { toast } from "./state.svelte";
import type { ViewRow } from "./gen/ViewRow";
import ListView from "../components/views/ListView.svelte";
import TasksView from "../components/views/TasksView.svelte";
import CalendarView from "../components/views/CalendarView.svelte";
import TreeView from "../components/views/TreeView.svelte";

/** `options`: the block's own YAML, parsed (a tree's `by:`). */
export interface ViewData { type: string; rows: ViewRow[]; options?: Record<string, unknown>; refresh?: () => void }
/** Draws `d` into `host`; returns the cleanup. */
export type ViewRenderer = (host: HTMLElement, d: ViewData) => () => void;

const tick = (d: ViewData) => (r: ViewRow) => {
  if (!r.path || !r.line) return;
  api.tickTask(r.path, r.line).then(() => d.refresh?.(), (e) => toast("Could not tick the task", errText(e), "error"));
};
const svelte = (C: typeof ListView | typeof CalendarView, extra: Record<string, unknown> = {}): ViewRenderer => (host, d) => {
  const app = mount(C as typeof ListView, { target: host, props: { rows: d.rows, ontick: tick(d), ...extra } });
  return () => void unmount(app);
};

const registry = new Map<string, ViewRenderer>([
  ["list", svelte(ListView)],
  ["table", svelte(ListView, { table: true })],
  ["calendar", svelte(CalendarView)],
  // (`tasks` is taken: it is Today's "Open tasks" part, a block of its own)
  ["task-list", svelte(TasksView as unknown as typeof ListView)],
  ["tree", (host, d) => {
    const app = mount(TreeView, { target: host, props: { rows: d.rows, by: typeof d.options?.by === "string" ? d.options.by : "up" } });
    return () => void unmount(app);
  }],
]);

/** Adds (or replaces) a row view — plugins call this through their API. */
export function registerView(type: string, r: ViewRenderer): () => void {
  registry.set(type, r);
  return () => { if (registry.get(type) === r) registry.delete(type); };
}
export const rowViewTypes = () => [...registry.keys()];

export function renderView(host: HTMLElement, d: ViewData): () => void {
  const r = registry.get(d.type);
  if (!r) {
    const p = document.createElement("p");
    p.className = "view-error";
    p.textContent = `No block or view called “${d.type}”. Row views: ${rowViewTypes().join(", ")}.`;
    host.replaceChildren(p);
    return () => {};
  }
  return r(host, d);
}
