import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { zip } from "./xlsx-fixture";

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

test("formulas between cells: the result shown, the formula kept in the file and edited as itself", async ({ page, request }) => {
  const CSV = "item,qty,price,total\napples,3,1.5,=B1*C1\npears,2,2,=B2*C2\nsum,,,=SUM(D1:D2)\n";
  const pane = await open(page, request, "data/sums.csv", CSV);
  await expect(pane.locator("th", { hasText: "total" }).locator(".letter")).toHaveText("D"); // how a formula names it
  const cellOf = (row: number, col: number) => pane.locator("tbody tr").filter({ has: page.locator("td.rownum", { hasText: new RegExp(`^${row}$`) }) }).locator("td").nth(col);
  await expect(cellOf(3, 4)).toHaveText("8.5");
  await expect(cellOf(3, 4)).toHaveAttribute("title", "=SUM(D1:D2)");
  // a referenced cell changed: every formula that uses it follows
  await cellOf(1, 2).dblclick();
  await page.keyboard.press("Control+a");
  await page.keyboard.type("10");
  await page.keyboard.press("Enter");
  await expect(cellOf(1, 4)).toHaveText("15");
  await expect(cellOf(3, 4)).toHaveText("19");
  // filters and sort read the results: totals over 10 are rows 1 and 3
  await pane.getByLabel("Filter total").fill(">10");
  await expect(pane.locator("tbody td.rownum")).toHaveText(["1", "3"]);
  await pane.getByLabel("Filter total").fill("");
  await expect(pane.locator("tbody td.rownum")).toHaveCount(3);
  // editing a formula shows the formula; a bad one says so
  await cellOf(2, 4).dblclick();
  await expect(pane.locator("input.cell-edit")).toHaveValue("=B2*C2");
  await page.keyboard.press("Control+a");
  await page.keyboard.type("=B2/0");
  await page.keyboard.press("Enter");
  await expect(cellOf(2, 4)).toHaveText("#DIV/0!");
  await expect(cellOf(3, 4)).toHaveText("#DIV/0!");
  await page.keyboard.press("Control+s");
  await expect.poll(() => read(request, "data/sums.csv")).toBe(CSV.replace("apples,3,1.5", "apples,10,1.5").replace("=B2*C2", "=B2/0"));
  await page.screenshot({ path: "test-results/table-formulas.png" });
});

test("a [[link]] in a cell is drawn as a link and opens its note on a click", async ({ page, request }) => {
  await request.put("/api/file", { headers: H, data: { path: "data/linked-target.md", text: "# Linked target\n\nreached\n" } });
  const pane = await open(page, request, "data/cell-links.csv", "name,see\nfirst,[[linked-target|the target]]\nsecond,plain\n");
  const link = pane.locator("td .wl", { hasText: "the target" });
  await expect(link).toHaveAttribute("title", "linked-target");
  await link.click();
  await expect(page.locator(".cm-content").getByText("reached")).toBeVisible({ timeout: 20000 });
});

test("an Excel workbook opens as tables, a sheet at a time, read here only; a sheet saved as CSV can be edited", async ({ page, request }) => {
  const book = await zip({
    "xl/workbook.xml": '<workbook><sheets><sheet name="Prices" r:id="rId1"/><sheet name="People" r:id="rId2"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels": '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>',
    "xl/worksheets/sheet1.xml": '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>item</t></is></c><c r="B1" t="inlineStr"><is><t>price</t></is></c></row>'
      + '<row r="2"><c r="A2" t="inlineStr"><is><t>tea</t></is></c><c r="B2"><v>4</v></c></row>'
      + '<row r="3"><c r="A3" t="inlineStr"><is><t>total</t></is></c><c r="B3"><f>SUM(B2:B2)</f><v>4</v></c></row></sheetData></worksheet>',
    "xl/worksheets/sheet2.xml": '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>name</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>Ada</t></is></c></row></sheetData></worksheet>',
  });
  await request.put("/api/raw?path=data%2Fbook.xlsx", { headers: H, data: Buffer.from(book) });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.request.post("/api/cmd/open", { headers: H, data: { args: { path: "data/book.xlsx" } } });
  const pane = page.locator(".table-pane");
  await expect(pane.locator("tbody td").first()).toBeVisible({ timeout: 20000 });
  await expect(pane.getByRole("tab", { name: "Prices" })).toHaveAttribute("aria-selected", "true");
  await expect(pane.getByText("2 rows · 2 columns · Excel sheet")).toBeVisible();
  await expect(pane.locator("td", { hasText: /^4$/ }).last()).toHaveAttribute("title", "=SUM(B2:B2)"); // Excel's value, its formula shown
  // read here only: typing says how to change it
  await pane.locator("td", { hasText: "tea" }).dblclick();
  await expect(page.getByText(/An Excel sheet is shown here, not changed/)).toBeVisible();
  await expect(pane.locator("input.cell-edit")).toHaveCount(0);
  await page.screenshot({ path: "test-results/table-xlsx.png" });
  await pane.getByRole("tab", { name: "People" }).click();
  await expect(pane.locator("td", { hasText: "Ada" })).toBeVisible();
  await pane.getByRole("button", { name: "Save as CSV" }).click();
  await expect.poll(() => read(request, "data/book - People.csv")).toBe("name\nAda\n");
  await expect(page.locator(".table-pane").last().getByText(/^1 rows · 1 columns/)).toBeVisible({ timeout: 10000 }); // one column: no delimiter to tell
});
