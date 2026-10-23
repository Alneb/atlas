import { test, expect } from "@playwright/test";
import { shownName } from "../src/lib/paths";

async function openFile(page: import("@playwright/test").Page, name: string) {
  await page.keyboard.press("Control+p");
  await page.keyboard.type(name);
  await expect(page.getByTestId("palette").getByText(shownName(name), { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Enter");
}

test("a note embedding ![[x.base]] shows the live table, scoped to the note (this.file)", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await openFile(page, "Topic.md");
  const base = page.locator(".cm-content .base-embed .base");
  await expect(base.locator("tbody tr")).toHaveCount(2);
  // sorted by the base's own sort (date, newest first), formula formatted as written
  await expect(base.locator("tbody tr").first().locator("td:not(.add-col)")).toHaveText(["25.03-10", "l2", "Lecture"]);
  // the base's global filter applies to every view, as in Obsidian; the views are in the switcher's menu
  await expect(base.locator(".view-switch")).toHaveText("By date");
  await base.locator(".view-switch").click();
  await expect(page.getByRole("menuitem", { name: /^By date/ })).toBeVisible();
  await page.getByRole("menuitem", { name: /^All lectures/ }).click();
  await expect(base.locator(".view-switch")).toHaveText("All lectures");
  await expect(base.locator("tbody tr")).toHaveCount(2);
  await base.locator("tbody .link", { hasText: "l1" }).click();
  await expect(page.locator(".cm-content")).toContainText("First.");
});

test("a .base file opens as a table pane with its views", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await openFile(page, "all.base");
  const pane = page.locator(".base-pane");
  await expect(pane.locator(".view-switch")).toHaveText("Lectures");
  await expect(pane.locator(".count")).toHaveText("3 results");
  await expect(pane.locator("tbody tr")).toHaveCount(3);
  await pane.locator(".view-switch").click();
  await page.getByRole("menuitem", { name: /^Early/ }).click();
  await expect(pane.locator("tbody tr")).toHaveCount(2);
});

test("a header's menu sorts the view and writes the sort to the .base", async ({ page, request }) => {
  const H = { "x-atlas": "1" };
  await request.put("/api/file", { headers: H, data: { path: "db/sorted.base", text: 'filters:\n  and:\n    - type == "Lecture"\nviews:\n  - type: table\n    name: Lectures\n    order: [file.name, date]\n' } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await openFile(page, "sorted.base");
  const pane = page.locator(".base-pane");
  await expect(pane.locator("tbody tr")).toHaveCount(3);
  await pane.locator("th", { hasText: "Name" }).locator(".head").click();
  await page.getByRole("menuitem", { name: "Sort descending" }).click();
  await expect(pane.locator("tbody tr").first().locator("td").first()).toHaveText("other");
  await expect.poll(async () => (await (await request.get("/api/file?path=db/sorted.base", { headers: H })).json()).text).toMatch(/property: file\.name\n\s+direction: DESC/);
  await expect(pane.locator("th", { hasText: "Name" }).locator(".icon")).toHaveCount(1); // the sort arrow
});

test("click a Base cell to edit the note's property in place (frontmatter only)", async ({ page, request }) => {
  const h = { "x-atlas": "1" };
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Control+p");
  await page.keyboard.type("all.base");
  await expect(page.getByTestId("palette").getByText("all.base").first()).toBeVisible();
  await page.keyboard.press("Enter");
  const pane = page.locator(".base-pane");
  // the "Lectures" view shows file.name and date; date is a property, so editable
  const row = pane.locator("tbody tr", { hasText: "l2" });
  await row.locator("td").nth(1).click();
  const input = pane.locator(".cell-edit");
  await expect(input).toHaveAttribute("type", "date"); // a date property gets the date picker
  await expect(input).toHaveValue("2025-03-10");
  await input.fill("2025-03-11");
  await input.press("Enter");
  await expect(row.locator("td").nth(1).locator(".date")).toHaveAttribute("title", "2025-03-11");
  await expect.poll(async () => (await (await request.get("/api/file?path=db/l2.md", { headers: h })).json()).text)
    .toBe("---\ntype: Lecture\ndate: 2025-03-11\ntopics: [\"[[Topic]]\"]\n---\nSecond.\n");
  // Esc cancels
  await row.locator("td").nth(1).click();
  await pane.locator(".cell-edit").fill("2025-04-01");
  await pane.locator(".cell-edit").press("Escape");
  await expect(pane.locator(".cell-edit")).toHaveCount(0);
  await expect(row.locator("td").nth(1).locator(".date")).toHaveAttribute("title", "2025-03-11");
});

// Notion parity: + New (folder / properties from the filters), a board grouped by a property (drag a
// card = change it), hide / add a column — each written to the notes or the .base file.
test("bases: new note in the view, board with drag, hide and add a column", async ({ page, request }) => {
  const H = { "x-atlas": "1" };
  const put = (path: string, text: string) => request.put("/api/file", { headers: H, data: { path, text } });
  const text = (f: string) => request.get(`/api/file?path=${encodeURIComponent(f)}`, { headers: H }).then((r) => r.json()).then((j) => j.text as string);
  await put("db/tasks/a.md", "---\nkind: task\nstatus: todo\n---\n");
  await put("db/tasks/b.md", "---\nkind: task\nstatus: done\nprio: 2\n---\n");
  await put("db/tasks.base", "filters:\n  and:\n    - file.inFolder(\"db/tasks\")\n    - kind == \"task\"\nviews:\n  - type: table\n    name: Tasks\n    order: [file.name, status]\n");
  await page.goto("/");
  await page.keyboard.press("Control+p");
  await page.keyboard.type("tasks.base");
  await expect(page.getByTestId("palette").getByText("tasks.base").first()).toBeVisible();
  await page.keyboard.press("Enter");
  const pane = page.locator(".base-pane");
  await expect(pane.locator("tbody tr")).toHaveCount(2);

  await pane.getByRole("button", { name: "New", exact: true }).click();
  await expect.poll(() => text("db/tasks/Untitled.md")).toBe("---\nkind: task\nstatus:\n---\n");
  await page.getByTestId("sidebar").locator(".tab", { hasText: "tasks.base" }).click();
  await expect(pane.locator("tbody tr")).toHaveCount(3);

  await pane.locator(".view-switch").click();
  await page.getByRole("menuitem", { name: /New board view/ }).click();
  await page.getByRole("menuitem", { name: "Board grouped by Status" }).click();
  await expect(pane.locator(".lane")).toHaveCount(3); // done, todo, No value
  await pane.locator(".lane", { hasText: "todo" }).locator(".card").dragTo(pane.locator(".lane", { hasText: "done" }));
  await expect.poll(() => text("db/tasks/a.md")).toContain("status: done");
  expect(await text("db/tasks.base")).toContain("groupBy:");

  await pane.locator(".view-switch").click();
  await page.getByRole("menuitem", { name: /^Tasks/ }).click();
  await pane.locator("th", { hasText: "Status" }).click({ button: "right" });
  await page.getByRole("menuitem", { name: /Hide/ }).click();
  await expect(pane.locator("th", { hasText: "Status" })).toHaveCount(0);
  await pane.getByRole("button", { name: "Add column" }).click();
  await page.getByRole("menuitem", { name: "prio" }).click();
  await expect(pane.locator("th", { hasText: "Prio" })).toHaveCount(1);
});

test("an embed that names its view shows that view alone, without the other views' tabs", async ({ page, request }) => {
  await request.put("/api/file", { headers: { "x-atlas": "1" }, data: { path: "early-only.md", text: "# Early only\n\n![[all.base#Early]]\n" } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await openFile(page, "early-only.md");
  const base = page.locator(".cm-content .base-embed .base");
  await expect(base.locator("tbody tr")).toHaveCount(2);
  await expect(base.locator(".view-switch")).toHaveText("Early");
  await base.locator(".view-switch").click();
  await expect(page.getByRole("menuitem", { name: /^Lectures/ })).toHaveCount(0); // the other views are the database's
  await page.keyboard.press("Escape");
  await request.post("/api/fs/trash?path=early-only.md", { headers: { "x-atlas": "1" } });
});

test("a column's summary, groups in a table, a card's picture — each written to the .base", async ({ page, request }) => {
  const H = { "x-atlas": "1" };
  const put = (path: string, text: string) => request.put("/api/file", { headers: H, data: { path, text } });
  const text = (f: string) => request.get(`/api/file?path=${encodeURIComponent(f)}`, { headers: H }).then((r) => r.json()).then((j) => j.text as string);
  await put("db/shop/a.md", "---\nkind: item\nprice: 3\nshop: north\ncover: \"[[a.svg]]\"\n---\n");
  await put("db/shop/b.md", "---\nkind: item\nprice: 5\nshop: south\n---\n");
  await put("db/shop/c.md", "---\nkind: item\nprice: 4\nshop: north\n---\n");
  await put("db/shop/a.svg", '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="9"><rect width="16" height="9" fill="teal"/></svg>');
  await put("db/shop.base", "filters: 'kind == \"item\"'\nviews:\n  - type: table\n    name: Items\n    order: [file.name, price, shop]\n");
  await page.goto("/");
  await openFile(page, "shop.base");
  const pane = page.locator(".base-pane");
  await expect(pane.locator("tbody tr")).toHaveCount(3);

  await pane.getByRole("button", { name: "Summary of Price" }).click();
  await page.getByRole("menuitem", { name: "Sum" }).click();
  await expect(pane.getByRole("button", { name: "Summary of Price" })).toContainText("12");
  await expect.poll(() => text("db/shop.base")).toMatch(/summaries:\n\s+note\.price: Sum/);

  await pane.getByRole("button", { name: "Sort" }).click();
  await page.getByRole("button", { name: "Group by" }).click();
  await page.getByRole("menuitem", { name: "Shop" }).click();
  await page.keyboard.press("Escape");
  await expect(pane.locator("tr.group")).toHaveText(["north2", "south1"]);
  await expect.poll(() => text("db/shop.base")).toMatch(/groupBy:\n\s+property: shop/);

  await pane.locator(".view-switch").click();
  await page.getByRole("menuitem", { name: "Show as cards" }).click();
  await expect(pane.locator("h3.group")).toHaveCount(2);
  await pane.locator(".view-switch").click();
  await page.getByRole("menuitem", { name: /Card picture/ }).click();
  await page.getByRole("menuitem", { name: "Cover" }).click();
  await expect(pane.locator(".card .cover img")).toHaveCount(1);
  await expect.poll(() => pane.locator(".card .cover img").evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);
  await expect.poll(() => text("db/shop.base")).toContain("image: note.cover");
});
