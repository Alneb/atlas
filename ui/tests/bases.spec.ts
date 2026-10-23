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
  // the base's global filter applies to every view, as in Obsidian
  await expect(base.locator(".tab")).toHaveText(["By date2", "All lectures2"]);
  await base.locator(".tab", { hasText: "All lectures" }).click();
  await expect(base.locator("tbody tr")).toHaveCount(2);
  await base.locator("tbody .link", { hasText: "l1" }).click();
  await expect(page.locator(".cm-content")).toContainText("First.");
});

test("a .base file opens as a table pane with its views", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await openFile(page, "all.base");
  const pane = page.locator(".base-pane");
  await expect(pane.locator(".tab")).toHaveText(["Lectures3", "Early2"]);
  await expect(pane.locator("tbody tr")).toHaveCount(3);
  await pane.locator("th", { hasText: "Name" }).click();
  await pane.locator("th", { hasText: "Name" }).click();
  await expect(pane.locator("tbody tr").first().locator("td").first()).toHaveText("other");
  await pane.locator(".tab", { hasText: "Early" }).click();
  await expect(pane.locator("tbody tr")).toHaveCount(2);
});

test("double-click a Base cell to edit the note's property in place (frontmatter only)", async ({ page, request }) => {
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
  await row.locator("td").nth(1).dblclick();
  const input = pane.locator(".cell-edit");
  await expect(input).toHaveValue("2025-03-10");
  await input.fill("2025-03-11");
  await input.press("Enter");
  await expect(row.locator("td").nth(1)).toHaveText(/2025-03-11/);
  const text = (await (await request.get("/api/file?path=db/l2.md", { headers: h })).json()).text;
  expect(text).toBe("---\ntype: Lecture\ndate: 2025-03-11\ntopics: [\"[[Topic]]\"]\n---\nSecond.\n");
  // Esc cancels
  await row.locator("td").nth(1).dblclick();
  await pane.locator(".cell-edit").fill("nope");
  await pane.locator(".cell-edit").press("Escape");
  await expect(row.locator("td").nth(1)).toHaveText(/2025-03-11/);
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

  await pane.getByRole("button", { name: "New board view" }).click();
  await page.getByRole("menuitem", { name: "Board grouped by status" }).click();
  await expect(pane.locator(".lane")).toHaveCount(3); // done, todo, No value
  await pane.locator(".lane", { hasText: "todo" }).locator(".card").dragTo(pane.locator(".lane", { hasText: "done" }));
  await expect.poll(() => text("db/tasks/a.md")).toContain("status: done");
  expect(await text("db/tasks.base")).toContain("groupBy:");

  await pane.getByRole("tab", { name: /Tasks/ }).click();
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
  await expect(base.locator(".tab")).toHaveCount(0);
  await expect(base.locator(".bar .title")).toHaveText("Early");
  await request.post("/api/fs/trash?path=early-only.md", { headers: { "x-atlas": "1" } });
});
