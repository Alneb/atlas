import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { openFile } from "./open";
import { caretIn, tableOps, alignOf, linesOf } from "../src/lib/editor/table-md";

// Tables edited in place: a cell's own markdown
// edited, Tab / Enter to move on, + row / + column / −, and the note's text changed only in that table.
const H = { "x-atlas": "1" };
const NOTE = "notes/tabled.md";
const read = (r: APIRequestContext) => r.get(`/api/file?path=${NOTE}`, { headers: H }).then((x) => x.json()).then((j) => j.text as string);

async function open(page: Page, request: APIRequestContext, text: string) {
  await request.put("/api/file", { headers: H, data: { path: NOTE, text } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await openFile(page, "tabled.md");
  const table = page.locator(".cm-content table.table-edit");
  await expect(table).toBeVisible();
  return table;
}

const SRC = "# Tabled\n\nbefore\n\n| Name | Year | Notes |\n| --- | ---: | --- |\n| Hubbard | 1963 | the **model** |\n| Mott | 1949 | insulators |\n\nafter\n";

test("a cell edited in place: its markdown kept, only that cell written, Tab and Enter move on", async ({ page, request }) => {
  const table = await open(page, request, SRC);
  await table.locator("td", { hasText: "model" }).click();
  const editing = table.locator(".editing");
  await expect(editing).toHaveText("the **model**"); // its own markdown, not the drawn text
  await page.keyboard.press("End");
  await page.keyboard.type(" of everything");
  await page.keyboard.press("Tab"); // → the next row's first cell
  await expect.poll(() => read(request)).toContain("| Hubbard | 1963 | the **model** of everything |");
  await expect(table.locator(".editing")).toHaveText("Mott");
  await page.keyboard.press("Escape"); // nothing changed in it
  expect(await read(request)).toBe(SRC.replace("the **model** |", "the **model** of everything |"));

  // Enter on the last row: a new row, its cell edited
  await table.locator("td", { hasText: "insulators" }).click();
  await page.keyboard.press("Enter");
  await expect(table.locator(".editing")).toHaveText("");
  await page.keyboard.type("new idea");
  await page.keyboard.press("Tab"); // past the last cell: one more row
  await expect.poll(() => read(request)).toMatch(/\| Mott \| 1949 \| insulators \|\n\|  \|  \| new idea \|\n\|  \|  \|  \|\n\nafter/);
});

test("+ column adds one, − removes a row, the rest of the note untouched", async ({ page, request }) => {
  const table = await open(page, request, SRC);
  await table.hover();
  await page.getByRole("button", { name: "Add a column" }).click();
  await expect.poll(() => read(request)).toContain("| Name | Year | Notes |  |\n| --- | ---: | --- | --- |");
  await page.keyboard.type("Field");
  await page.keyboard.press("Tab");
  await expect.poll(() => read(request)).toContain("| Name | Year | Notes | Field |");
  await page.keyboard.press("Escape");
  await table.locator("td", { hasText: "Mott" }).hover();
  await page.getByRole("button", { name: "Remove this row" }).click();
  await expect.poll(() => read(request)).not.toContain("Mott");
  const text = await read(request);
  expect(text.startsWith("# Tabled\n\nbefore\n\n| Name")).toBe(true);
  expect(text.endsWith("|\n\nafter\n")).toBe(true);
});

test("a link in a table cell opens; the rest of the cell edits; `\\|` is the alias's bar", async ({ page, request }) => {
  await request.put("/api/file", { headers: H, data: { path: "notes/cell-target.md", text: "# Cell target\n\nreached from a table\n" } });
  const table = await open(page, request, "# Tabled\n\n| Paper | Notes |\n| --- | --- |\n| [[cell-target\\|the target]] | read it |\n");
  const link = table.locator("a.internal-link", { hasText: "the target" });
  await expect(link).not.toHaveClass(/is-unresolved/); // the backslash is not part of the target
  await table.locator("td", { hasText: "read it" }).click();
  await expect(table.locator(".editing")).toHaveText("read it"); // a plain cell still edits
  await page.keyboard.press("Escape");
  await link.click();
  await expect(page.getByText("reached from a table").first()).toBeVisible(); // the linked note opened
});

// A formula in a cell: its LaTeX while it is edited, the formula again once left — unchanged (Escape, or clicking
// away: the note did not change, so nothing redraws it) or changed (the note's new text drawn).
test("a cell's formula is drawn again after it is edited or only looked into", async ({ page, request }) => {
  const table = await open(page, request, "# Tabled\n\n| Quantity | Value |\n| --- | --- |\n| energy | $E = mc^2$ |\n\nafter\n");
  const cell = table.locator("td").nth(1);
  await expect(cell.locator(".math, mjx-container, .katex").first()).toBeVisible();
  await cell.click();
  await expect(table.locator(".editing")).toHaveText("$E = mc^2$");
  await page.keyboard.press("Escape");
  await expect(cell.locator(".math, mjx-container, .katex").first(), "left unchanged: the formula, not its LaTeX").toBeVisible();
  await expect(cell).not.toContainText("$E");
  await cell.click();
  await page.keyboard.press("End");
  await page.keyboard.press("Backspace"); // the closing $
  await page.keyboard.press("Backspace"); // the 2
  await page.keyboard.type("3$");
  await page.keyboard.press("Tab");
  await expect.poll(() => read(request)).toContain("| energy | $E = mc^3$ |");
  await page.keyboard.press("Escape");
  const again = page.locator(".cm-content table.table-edit td").nth(1);
  await expect(again.locator(".math, mjx-container, .katex").first(), "changed: drawn as a formula again").toBeVisible();
  await expect(again).not.toContainText("$E");
});

test("pure: a click's place in the drawn text is found in the cell's source", () => {
  expect(caretIn("plain words", "plain words", 3)).toBe(3);
  expect(caretIn("the **model** of", "the model of", 9)).toBe(13); // after "model" and its closing **, before the space
  expect(caretIn("the **model** of", "the model of", 4)).toBe(6); // before "model", after the opening **
  expect(caretIn("[[x\\|alias]] here", "alias here", 0)).toBe(0);
  expect(caretIn("abc", "zzz", 1)).toBeNull();
});

test("pure: rows and columns inserted, moved, aligned, sorted; the header stays first", () => {
  const t = { rows: [["N", "Y"], ["b", "10"], ["a", "9"], ["", "1"]], aligns: ["---", "---:"] };
  tableOps.sort(t, 1, false);
  expect(t.rows.map((r) => r[1])).toEqual(["Y", "1", "9", "10"]); // numbers by value
  tableOps.sort(t, 0, false);
  expect(t.rows.map((r) => r[0])).toEqual(["N", "a", "b", ""]); // the empty cell last
  tableOps.moveRow(t, 1, -1); // never above the header
  expect(t.rows[0][0]).toBe("N");
  tableOps.moveCol(t, 0, 1);
  expect(t.rows[0]).toEqual(["Y", "N"]);
  expect(alignOf(t.aligns[0])).toBe("right");
  tableOps.align(t, 1, "center");
  tableOps.insertRow(t, 0); // above the header: just below it
  tableOps.insertCol(t, 1);
  expect(linesOf(t)).toEqual(["| Y |  | N |", "| ---: | --- | :---: |", "|  |  |  |", "| 9 |  | a |", "| 10 |  | b |", "| 1 |  |  |"]);
});

test("a click puts the caret where it was; arrows walk the cells and leave the table", async ({ page, request }) => {
  const table = await open(page, request, SRC);
  const cell = table.locator("td", { hasText: "insulators" });
  const box = (await cell.boundingBox())!;
  await page.mouse.click(box.x + 6, box.y + box.height / 2); // near the start of the word
  await expect(table.locator(".editing")).toHaveText("insulators");
  await page.keyboard.type("X");
  await expect(table.locator(".editing")).not.toHaveText("insulatorsX"); // not at the end
  await page.keyboard.press("Escape");
  await table.locator("td", { hasText: "Mott" }).click();
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowLeft"); // at the start: the previous row's last cell
  await expect(table.locator(".editing")).toHaveText("the **model**");
  await page.keyboard.press("ArrowRight"); // at the end: the next cell
  await expect(table.locator(".editing")).toHaveText("Mott");
  await page.keyboard.press("ArrowUp");
  await expect(table.locator(".editing")).toHaveText("Hubbard");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown"); // past the last row: out of the table, into the text below
  await expect(table.locator(".editing")).toHaveCount(0);
  await expect(page.locator(".cm-content")).toBeFocused();
  expect(await read(request)).toBe(SRC);
});

test("Tab past the last cell adds a row; the right-click menu inserts, aligns and sorts", async ({ page, request }) => {
  const table = await open(page, request, SRC);
  await table.locator("td", { hasText: "insulators" }).click();
  await page.keyboard.press("Tab");
  await expect(table.locator(".editing")).toHaveText("");
  await page.keyboard.type("Anderson");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Escape");
  await expect.poll(() => read(request)).toContain("| Mott | 1949 | insulators |\n| Anderson |  |  |\n");
  await table.locator("td", { hasText: "Hubbard" }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Sort by this column, A → Z" }).click();
  await expect.poll(() => read(request)).toContain("| Anderson |  |  |\n| Hubbard | 1963 | the **model** |\n| Mott | 1949 | insulators |");
  await table.locator("th", { hasText: "Notes" }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Align column center" }).click();
  await expect.poll(() => read(request)).toContain("| --- | ---: | :---: |");
  await table.locator("td", { hasText: "Mott" }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Insert row above" }).click();
  await expect(table.locator(".editing")).toHaveText("");
  await page.keyboard.type("Kanamori");
  await page.keyboard.press("Tab");
  await expect.poll(() => read(request)).toContain("| 1963 | the **model** |\n| Kanamori |  |  |\n| Mott |");
});
