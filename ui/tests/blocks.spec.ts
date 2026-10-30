import { test, expect, type APIRequestContext } from "@playwright/test";
import { openFile } from "./open";

// docs/refactor/REFACTOR-blocks.md: one registry. A pane (Library, an editor, a table file) is a block that
// sits in a page or a note; any block opens as a tab of its own.
const H = { "x-atlas": "1" };
const put = (r: APIRequestContext, path: string, text: string) => r.put("/api/file", { headers: H, data: { path, text } });

test("panes embed in a page, and an embedded pane opens as its own tab", async ({ page, request }) => {
  await put(request, "Desk.page", "title: Desk\nrows:\n  - columns:\n      - [{ view: library, height: 300 }]\n      - [{ view: editor, path: notes/sub/related.md }]\n  - [{ view: file-table, path: data/sweep.tsv }]\n  - [{ view: pdf }]\n");
  await page.goto("/");
  await openFile(page, "Desk.page");
  const desk = page.locator(".atlas-pane-page .page");
  // the Library, with its real papers
  await expect(desk.locator(".atlas-pane-library")).toContainText("More Is Different");
  // the same editor as in a tab: live preview renders the note, wikilink included
  await expect(desk.locator(".atlas-pane-editor .cm-content")).toContainText("See the hubbard model.");
  // a data file as a table
  await expect(desk.locator(".atlas-pane-table")).toContainText("E_kin");
  // a block that lacks what it needs says so, in place
  await expect(desk.locator(".view-error")).toContainText("needs `path:`");
  // open the embedded Library as a tab: the real Library pane
  await desk.locator(".atlas-block", { has: page.locator(".atlas-pane-library") }).hover();
  await desk.locator(".atlas-block", { has: page.locator(".atlas-pane-library") }).locator("> .block-pop").click();
  await expect.poll(() => page.evaluate(() => fetch("/api/ui/state", { headers: { "x-atlas": "1" } }).then((r) => r.json()).then((s) => s.active?.kind))).toBe("library");
});

test("a pane block inside a note, and a row view opened as a tab", async ({ page, request }) => {
  await put(request, "notes/desk.md", "# Desk\n\n- [ ] ship blocks 📅 2026-10-20\n\n```view\ntype: calendar\n```\n\nPapers:\n\n```view\ntype: library\nheight: 260\n```\n");
  await page.goto("/");
  await openFile(page, "desk.md");
  const note = page.locator(".cm-content");
  await expect(note.locator(".atlas-pane-library")).toContainText("More Is Different");
  const cal = note.locator(".atlas-block", { has: page.locator(".atlas-view-calendar") });
  await expect(cal).toContainText("ship blocks");
  await cal.hover();
  await cal.locator("> .block-pop").click();
  // the calendar alone in a tab, still reading the note it came from
  const tab = page.locator(".atlas-pane-block");
  await expect(tab.locator(".atlas-view-calendar")).toContainText("ship blocks");
  await expect(tab.locator(".block-pop")).toHaveCount(0);
});
