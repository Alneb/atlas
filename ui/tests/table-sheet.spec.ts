import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

// The table as a spreadsheet: edits saved in the file's own layout (only the edited row rewritten), undo, rows added and
// removed, a filter per column with the numbers underneath, columns hidden, and a change on disk while editing.
const H = { "x-atlas": "1" };
const read = (r: APIRequestContext, path: string) => r.get(`/api/file?path=${path}`, { headers: H }).then((x) => x.json()).then((j) => j.text as string);

async function open(page: Page, request: APIRequestContext, path: string, text: string) {
  await request.put("/api/file", { headers: H, data: { path, text } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Control+p");
  await page.keyboard.type(path.split("/").pop()!);
  await expect(page.getByTestId("palette").getByText(path.split("/").pop()!).first()).toBeVisible();
  await page.keyboard.press("Enter");
  const pane = page.locator(".table-pane");
  await expect(pane.locator("tbody td").first()).toBeVisible();
  return pane;
}

const PEOPLE = 'name,city,born\nAlice,"Paris, FR",1980\nBob,"New\nYork",1975\nCarol,Lyon,1990\n';

test("a cell edited and saved: only its row rewritten, quotes and the rest kept as they were", async ({ page, request }) => {
  const pane = await open(page, request, "data/people.csv", PEOPLE);
  await expect(pane.locator("th", { hasText: "city" })).toBeVisible(); // a text-only first row is the header
  await expect(pane.getByText("3 rows · 3 columns · comma-separated")).toBeVisible();
  await expect(pane.locator("td", { hasText: "New" })).toContainText("York"); // a line break inside quotes stays in its cell
  await pane.locator("td", { hasText: "Lyon" }).dblclick();
  await page.keyboard.press("Control+a");
  await page.keyboard.type("Lyon, FR");
  await page.keyboard.press("Enter");
  await expect(pane.locator(".dirty")).toBeVisible();
  await page.keyboard.press("Control+s");
  await expect(pane.locator(".dirty")).toHaveCount(0);
  expect(await read(request, "data/people.csv")).toBe(PEOPLE.replace("Carol,Lyon,1990", 'Carol,"Lyon, FR",1990'));
  // undo puts it back (unsaved again), redo returns it
  await page.keyboard.press("Control+z");
  await expect(pane.locator("td", { hasText: /^Lyon$/ })).toBeVisible();
  await expect(pane.locator(".dirty")).toBeVisible();
  await page.keyboard.press("Control+Shift+z");
  await expect(pane.locator(".dirty")).toHaveCount(0);
});

test("rows inserted and deleted from the row menu; typing in a cell replaces it", async ({ page, request }) => {
  const pane = await open(page, request, "data/rows.csv", "k,v\na,1\nb,2\n");
  await pane.locator("td.rownum", { hasText: "2" }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Insert row above" }).click();
  await expect(pane.getByText("3 rows")).toBeVisible();
  await pane.locator("tbody tr:not(.spacer)").nth(1).locator("td").nth(1).click();
  await page.keyboard.type("z");
  await page.keyboard.press("Tab");
  await page.keyboard.type("9");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Control+s");
  await expect.poll(() => read(request, "data/rows.csv")).toBe("k,v\na,1\nz,9\nb,2\n");
  await pane.locator("td", { hasText: /^a$/ }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Delete row" }).click();
  await expect(pane.getByText("2 rows")).toBeVisible();
  await page.keyboard.press("Control+s");
  await expect.poll(() => read(request, "data/rows.csv")).toBe("k,v\nz,9\nb,2\n");
});

test("a filter per column, the numbers of what is shown, a column hidden and shown again", async ({ page, request }) => {
  const pane = await open(page, request, "data/runs.tsv", "# U\tZ\tE\n3.0\t0.9\t-1.0\n4.0\t0.5\t-2.0\n5.0\t0.1\t-3.0\n6.0\t\t-4.0\n");
  await expect(pane.locator("th", { hasText: "Z" })).toBeVisible(); // the header in the comment line
  await pane.getByLabel("Filter U").fill(">3.5");
  await expect(pane.getByText("3 / 4 rows")).toBeVisible();
  await pane.getByLabel("Filter Z").fill("!empty");
  await expect(pane.getByText("2 / 4 rows")).toBeVisible();
  await pane.locator("td", { hasText: "-2.0" }).click(); // the footer: the cursor's column over the rows shown
  await expect(pane.locator(".stats")).toContainText("mean -2.5");
  await pane.getByLabel("Filter Z").fill("");
  await pane.getByLabel("Filter U").fill("");
  // sort descending by Z: blanks stay last
  await pane.locator("th", { hasText: "Z" }).locator(".label").click();
  await pane.locator("th", { hasText: "Z" }).locator(".label").click();
  await expect(pane.locator("tbody tr:not(.spacer)").first().locator("td").nth(2)).toHaveText("0.9");
  await expect(pane.locator("tbody tr:not(.spacer)").last().locator("td").nth(1)).toHaveText("6.0");
  await pane.locator("th", { hasText: "E" }).last().click({ button: "right" });
  await page.getByRole("menuitem", { name: "Hide column" }).click();
  await expect(pane.locator("thead th", { hasText: /^E/ })).toHaveCount(0);
  await pane.getByRole("button", { name: "1 hidden" }).click();
  await page.getByRole("menuitem", { name: "Show all" }).click();
  await expect(pane.locator("tr.names th", { hasText: "E" })).toHaveCount(1);
});

test("a change on disk while editing: told, and reloaded or overwritten", async ({ page, request }) => {
  const pane = await open(page, request, "data/race.csv", "a,b\n1,2\n");
  await pane.locator("td:not(.rownum)", { hasText: /^1$/ }).dblclick();
  await page.keyboard.press("Control+a");
  await page.keyboard.type("7");
  await page.keyboard.press("Enter");
  await request.put("/api/file", { headers: H, data: { path: "data/race.csv", text: "a,b\n1,3\n" } });
  await expect(pane.getByRole("alert")).toContainText("changed on disk");
  await pane.getByRole("button", { name: "Overwrite with mine" }).click();
  await expect.poll(() => read(request, "data/race.csv")).toBe("a,b\n7,2\n");
});
