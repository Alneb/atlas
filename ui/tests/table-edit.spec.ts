import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

// Tables edited in place: a cell's own markdown
// edited, Tab / Enter to move on, + row / + column / −, and the note's text changed only in that table.
const H = { "x-atlas": "1" };
const NOTE = "notes/tabled.md";
const read = (r: APIRequestContext) => r.get(`/api/file?path=${NOTE}`, { headers: H }).then((x) => x.json()).then((j) => j.text as string);

async function open(page: Page, request: APIRequestContext, text: string) {
  await request.put("/api/file", { headers: H, data: { path: NOTE, text } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Control+p");
  await page.keyboard.type("tabled.md");
  await expect(page.getByTestId("palette").getByText("tabled", { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Enter");
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
  await page.keyboard.press("Tab");
  await expect.poll(() => read(request)).toMatch(/\| Mott \| 1949 \| insulators \|\n\|  \|  \| new idea \|\n\nafter/);
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
