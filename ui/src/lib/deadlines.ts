// Deadlines (docs/design/DESIGN-calendar-tasks-nudges.md §2.4): the core's `from: deadlines` view — dated tasks, notes
// with `due:`, the calendar plugin's deadline calendars — shown three ways from that one query: the `deadlines` block
// (Home's box, lib/blocks.ts), the Deadlines page (a `.page` made once, then the user's) and the Today chips.
// This module holds the two actions: open the page, and add the box to an existing home document.
import { errText } from "./text";
import { api } from "./api";
import { open, openPath } from "./dock";
import { homeDoc } from "./actions";
import { toast } from "./state.svelte";
import { parsePage, writePage, newBlock, insertBlock, insertRow, type PageModel } from "./page-doc";

export const DEADLINES_PAGE = "Deadlines.page";

/** The Deadlines page as it is first written; after that it is the user's file and never rewritten. */
export const DEADLINES_TEMPLATE = `# What must be done by a day: tasks with 📅, notes with due:, and the calendars Settings → Plugins → Calendar
# marks as deadline calendars. Reorder, remove or add blocks and save — it updates at once.
title: Deadlines
rows:
  - columns:
      - [{ view: deadlines, title: Deadlines }]
      - [{ view: calendar, from: deadlines, title: The month }]
    widths: [3, 2]
`;

/** Opens the Deadlines page, writing it from the template when the vault has none (never over one). */
export async function openDeadlines(): Promise<void> {
  try {
    await api.createFile(DEADLINES_PAGE, DEADLINES_TEMPLATE);
  } catch { /* already there: it is the user's now */ }
  open({ kind: "page", path: DEADLINES_PAGE, title: "Deadlines" });
}

/** Where the box goes on a page: above the open tasks when the page has them, else as a row under the greeting
 *  (or first). False when the page already has one. */
export function placeDeadlines(m: PageModel): boolean {
  const all = m.rows.flatMap((r) => r.columns.flat());
  if (all.some((b) => b.type === "deadlines")) return false;
  const box = newBlock("deadlines");
  for (const [row, r] of m.rows.entries())
    for (const [col, c] of r.columns.entries()) {
      const index = c.findIndex((b) => b.type === "tasks");
      if (index >= 0) { insertBlock(m, { row, col, index }, box); return true; }
    }
  const greeting = m.rows.findIndex((r) => r.columns.some((c) => c.some((b) => b.type === "greeting" || b.type === "capture")));
  insertRow(m, greeting < 0 ? 0 : greeting + 1, box);
  return true;
}

/** Whether a home document already shows the deadlines: a `.page` with the block, a note with the `view` block. */
export function hasDeadlinesBox(path: string, text: string): boolean {
  if (!path.endsWith(".page")) return MD_HAS.test(text);
  try { return parsePage(text).model.rows.some((r) => r.columns.flat().some((b) => b.type === "deadlines")); } catch { return true; } // unreadable: never offered
}
const MD_HAS = /^type:\s*deadlines\s*$/m;

const OFFERED = "atlas-deadlines-offered";
/** Deadlines have no tile of their own: they are Home's. A home document without the box is offered it once per
 *  vault and device, with one click to add it (the home is the user's file, so it is changed only on that click). */
export async function offerOnHome(path: string): Promise<void> {
  const key = `${OFFERED}:${path}`;
  try { if (localStorage.getItem(key)) return; } catch { return; }
  const doc = await api.file(path).catch(() => null);
  if (!doc || hasDeadlinesBox(path, doc.text)) return;
  try { localStorage.setItem(key, "1"); } catch { /* offered again next time */ }
  toast("What is due is on Home now", "Deadlines no longer have their own button: add their box to your home document.", "info", 12000,
    { label: "Add the box", run: () => void addDeadlinesToHome() });
}

const MD_BOX = "```view\ntype: deadlines\n```\n";

/** Settings → Home & Today, "Add the deadlines box": the home document is the user's, so it is changed only here,
 *  when asked, and then opened to show where the box went. */
export async function addDeadlinesToHome(): Promise<void> {
  const { path } = await homeDoc();
  if (!path) { toast("No home file", "Set Home screen to a .page or .md file first; Atlas creates it from a template that has the box."); return; }
  try {
    const doc = await api.file(path);
    let text: string | null;
    if (path.endsWith(".page")) {
      const { model, doc: yaml } = parsePage(doc.text);
      text = placeDeadlines(model) ? writePage(model, yaml) : null;
    } else {
      text = MD_HAS.test(doc.text) ? null : `${doc.text.replace(/\n*$/, "\n\n")}${MD_BOX}`;
    }
    if (text === null) { toast("Home already has the deadlines box", path); openPath(path); return; }
    await api.putFile(path, text, doc.mtime);
    toast("Deadlines box added", `${path}: move or remove it like any block.`, "success");
    openPath(path);
  } catch (e) { toast("Could not add the deadlines box", errText(e), "error"); }
}
