import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

// A base's table and list read and move as one: the keyboard keeps its place through a cell's editor, and a date
// in the list reads as the table writes it.
const H = { "x-atlas": "1" };
const put = (r: APIRequestContext, path: string, text: string) => r.put("/api/file", { headers: H, data: { path, text } });
const text = (r: APIRequestContext, f: string) => r.get(`/api/file?path=${encodeURIComponent(f)}`, { headers: H }).then((x) => x.json()).then((j) => j.text as string);

async function openBase(page: Page, name: string) {
  await page.goto("/");
  await page.keyboard.press("Control+p");
  await page.keyboard.type(name);
  await expect(page.getByTestId("palette").getByText(name).first()).toBeVisible();
  await page.keyboard.press("Enter");
  return page.locator(".base-pane");
}

test("a cell edited from the keyboard gives the focus back to its cell, on Enter and on Escape", async ({ page, request }) => {
  await put(request, "db/kbd/a.md", "---\nstatus: todo\n---\n");
  await put(request, "db/kbd.base", 'filters:\n  and:\n    - file.inFolder("db/kbd")\nviews:\n  - type: table\n    name: T\n    order: [file.name, status]\n');
  const pane = await openBase(page, "kbd.base");
  const cell = pane.locator("tbody tr", { hasText: "a" }).locator("td").nth(1);
  await expect(cell).toHaveText("todo");
  await cell.focus();
  await page.keyboard.press("Enter");
  const input = pane.getByLabel("Edit Status");
  await expect(input).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(cell).toBeFocused();
  await expect(cell).toHaveCSS("outline-offset", "-2px"); // its ring inside the cell, not clipped by the row
  await page.keyboard.press("Enter");
  await input.fill("done");
  await page.keyboard.press("Enter");
  await expect.poll(() => text(request, "db/kbd/a.md")).toContain("status: done");
  await expect(cell).toHaveText("done");
  await expect(cell).toBeFocused();
});

test("a list cell's editor floats over its row: the row keeps its height", async ({ page, request }) => {
  await put(request, "db/chips/a.md", "---\ntags: [home, weekly, errands, someday]\n---\n");
  await put(request, "db/chips.base", 'filters:\n  and:\n    - file.inFolder("db/chips")\nviews:\n  - type: table\n    name: T\n    order: [file.name, tags]\n');
  const pane = await openBase(page, "chips.base");
  const row = pane.locator("tbody tr", { hasText: "a" });
  const before = (await row.boundingBox())!.height;
  await row.locator("td").nth(1).click();
  await expect(pane.getByLabel("Add to Tags")).toBeFocused();
  expect((await row.boundingBox())!.height).toBe(before);
  await page.keyboard.press("Escape");
});

test("a list view writes its date as the table does", async ({ page, request }) => {
  await put(request, "db/when/a.md", "---\ndate: 2025-02-03\n---\n");
  await put(request, "db/when.base", 'filters:\n  and:\n    - file.inFolder("db/when")\nviews:\n  - type: list\n    name: L\n    order: [file.name, date]\n');
  const pane = await openBase(page, "when.base");
  const when = pane.locator(".rows .when .date");
  await expect(when).toHaveAttribute("title", "2025-02-03");
  await expect(when).not.toHaveText("2025-02-03"); // the reader's words, as in the table
});

test("a board card opens with Enter and moves a lane over with Alt+arrows, the focus going with it", async ({ page, request }) => {
  await put(request, "db/kb/a.md", "---\nstatus: todo\n---\n");
  await put(request, "db/kb/b.md", "---\nstatus: done\n---\n");
  await put(request, "db/kb.base", 'filters:\n  and:\n    - file.inFolder("db/kb")\nviews:\n  - type: board\n    name: B\n    groupBy:\n      property: status\n    order: [file.name]\n');
  const pane = await openBase(page, "kb.base");
  const lanes = pane.locator(".lane");
  await expect(lanes).toHaveCount(2);
  const names = await lanes.locator(".lane-name").allTextContents();
  const from = names.indexOf("todo"), other = names[1 - from];
  const card = pane.locator('.card[data-path="db/kb/a.md"]');
  await card.focus();
  await page.keyboard.press(from === 0 ? "Alt+ArrowRight" : "Alt+ArrowLeft");
  await expect.poll(() => text(request, "db/kb/a.md")).toContain(`status: ${other}`);
  await expect(lanes.nth(1 - from).locator('.card[data-path="db/kb/a.md"]')).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator(".dv-tab.dv-active-tab")).toContainText("a");
});

test("the filter popover's own view, empty, says the base's filters still apply", async ({ page }) => {
  const pane = await openBase(page, "all.base");
  await pane.getByRole("button", { name: "Filter" }).click();
  await expect(page.getByText("No filters of its own", { exact: false })).toBeVisible();
});
