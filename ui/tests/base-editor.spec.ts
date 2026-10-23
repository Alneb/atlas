import { test, expect, type APIRequestContext } from "@playwright/test";

// A Base view edited as in Obsidian: filter, sort, columns and the view itself, each written to
// the `.base` at once and shown in the table.
const H = { "x-atlas": "1" };
const put = (r: APIRequestContext, path: string, text: string) => r.put("/api/file", { headers: H, data: { path, text } });
const text = (r: APIRequestContext, f: string) => r.get(`/api/file?path=${encodeURIComponent(f)}`, { headers: H }).then((x) => x.json()).then((j) => j.text as string);

test("filter, sort, columns, rename, duplicate and delete a view from its settings", async ({ page, request }) => {
  await put(request, "db/chores/dishes.md", "---\nstatus: todo\nprio: 2\n---\n");
  await put(request, "db/chores/laundry.md", "---\nstatus: done\nprio: 1\n---\n");
  await put(request, "db/chores/plants.md", "---\nstatus: todo\nprio: 3\n---\n");
  await put(request, "db/chores.base", "filters:\n  and:\n    - file.inFolder(\"db/chores\")\nviews:\n  - type: table\n    name: Chores\n    order: [file.name, status, prio]\n");
  await page.goto("/");
  await page.keyboard.press("Control+p");
  await page.keyboard.type("chores.base");
  await expect(page.getByTestId("palette").getByText("chores.base").first()).toBeVisible();
  await page.keyboard.press("Enter");
  const pane = page.locator(".base-pane");
  const names = () => pane.locator("tbody tr td:first-child").allInnerTexts();
  await expect(pane.locator("tbody tr")).toHaveCount(3);

  await pane.getByRole("button", { name: "View settings" }).click();
  const ed = page.getByRole("dialog", { name: /View settings/ });
  // a condition built from a property, an operator and a value
  await ed.getByLabel("Property").selectOption("status");
  await ed.getByLabel("Condition", { exact: true }).selectOption("is");
  await ed.getByLabel("Value").fill("todo");
  await ed.getByRole("button", { name: "Add", exact: true }).first().click();
  await expect(pane.locator("tbody tr")).toHaveCount(2);
  await expect.poll(() => text(request, "db/chores.base")).toContain('status == "todo"');

  // a group inside: any of …
  await ed.getByRole("button", { name: "Group" }).first().click();
  await expect.poll(() => text(request, "db/chores.base")).toContain("or: []");

  // sorted by prio, descending
  await ed.getByLabel("Sort by").selectOption("prio");
  await ed.locator("section", { hasText: "Sort" }).getByRole("button", { name: "Add" }).click();
  await ed.getByLabel("Direction of prio").selectOption("DESC");
  await expect.poll(names).toEqual(["plants", "dishes"]);
  await expect.poll(() => text(request, "db/chores.base")).toMatch(/direction: DESC/);

  // a column moved
  await ed.getByRole("button", { name: /Move Prio up/i }).click();
  await expect.poll(() => text(request, "db/chores.base")).toMatch(/order:\n\s+- file\.name\n\s+- prio\n\s+- status/);

  // renamed, copied, the copy deleted
  await ed.getByLabel("View name").fill("To do");
  await ed.getByLabel("View name").press("Enter");
  await expect(pane.locator(".title, .tab.on").first()).toContainText("To do");
  await ed.getByRole("button", { name: "Duplicate" }).click();
  await expect(pane.locator(".tab")).toHaveCount(2);
  await ed.getByRole("button", { name: "Delete" }).click();
  await expect(pane.locator(".tab")).toHaveCount(0); // one view left: no tabs
  const base = await text(request, "db/chores.base");
  expect(base).toContain("name: To do");
  expect(base).not.toContain("(copy)");
  expect(base).toContain('file.inFolder("db/chores")'); // the base's own filter untouched
});
