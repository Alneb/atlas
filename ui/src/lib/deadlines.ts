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
      text = /^type:\s*deadlines\s*$/m.test(doc.text) ? null : `${doc.text.replace(/\n*$/, "\n\n")}${MD_BOX}`;
    }
    if (text === null) { toast("Home already has the deadlines box", path); openPath(path); return; }
    await api.putFile(path, text, doc.mtime);
    toast("Deadlines box added", `${path}: move or remove it like any block.`, "success");
    openPath(path);
  } catch (e) { toast("Could not add the deadlines box", errText(e), "error"); }
}
