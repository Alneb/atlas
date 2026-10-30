import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { openFile } from "./open";

// A base edited as in Obsidian's Bases: the toolbar's Filter (two scopes), Sort and Properties popovers, the view menu,
// the table's header (drag, resize, menu) and its cells edited in place — each written to the `.base` or to the note at
// once and shown in the table.
const H = { "x-atlas": "1" };
const put = (r: APIRequestContext, path: string, text: string) => r.put("/api/file", { headers: H, data: { path, text } });
const text = (r: APIRequestContext, f: string) => r.get(`/api/file?path=${encodeURIComponent(f)}`, { headers: H }).then((x) => x.json()).then((j) => j.text as string);

async function openBase(page: Page, name: string) {
  await page.goto("/");
  await openFile(page, name);
  return page.locator(".base-pane");
}

async function chores(r: APIRequestContext, dir: string, view = "    order: [file.name, status, prio]\n") {
  await put(r, `${dir}/dishes.md`, "---\nstatus: todo\nprio: 2\ntags: [home, weekly]\ndone: false\n---\n");
  await put(r, `${dir}/laundry.md`, "---\nstatus: done\nprio: 1\ntags: [home]\ndone: true\n---\n");
  await put(r, `${dir}/plants.md`, "---\nstatus: todo\nprio: 3\n---\n");
  await put(r, `${dir}.base`, `filters:\n  and:\n    - file.inFolder("${dir}")\nviews:\n  - type: table\n    name: Chores\n${view}`);
}

test("the filter popover edits this view's filter and the base's own, as readable conditions", async ({ page, request }) => {
  await chores(request, "db/chores");
  const pane = await openBase(page, "chores.base");
  await expect(pane.locator("tbody tr")).toHaveCount(3);

  await pane.getByRole("button", { name: "Filter" }).click();
  const pop = page.getByRole("dialog", { name: "Filter" });
  await expect(pop.getByRole("tab", { name: /This view/ })).toHaveAttribute("aria-selected", "true");
  // a condition built from a property, an operator in words and a value
  await pop.getByRole("button", { name: "Add filter", exact: true }).click();
  await pop.getByRole("button", { name: "Property" }).click();
  await page.getByRole("menuitem", { name: /^Status/ }).click();
  await pop.getByRole("button", { name: "Operator" }).click();
  await page.getByRole("menuitem", { name: "is", exact: true }).click();
  await pop.getByLabel("Value").fill("todo");
  await pop.getByLabel("Value").press("Enter");
  await expect(pane.locator("tbody tr")).toHaveCount(2);
  const base = () => text(request, "db/chores.base");
  await expect.poll(base).toMatch(/views:[\s\S]*filters:\n\s+and:\n\s+- status == "todo"/);

  // a number property compares as a number
  await pop.getByRole("button", { name: "Add filter", exact: true }).click();
  await pop.getByRole("button", { name: "Property" }).last().click();
  await page.getByRole("menuitem", { name: /^Prio/ }).click();
  await pop.getByRole("button", { name: "Operator" }).last().click();
  await page.getByRole("menuitem", { name: ">", exact: true }).click();
  await pop.getByLabel("Value").last().fill("2");
  await pop.getByLabel("Value").last().press("Enter");
  await expect(pane.locator("tbody tr")).toHaveCount(1);
  await expect.poll(base).toContain("- prio > 2");

  // a group inside: any of …
  await pop.getByRole("button", { name: "Add filter group" }).first().click();
  await expect.poll(base).toContain("and: []");

  // the other scope: the base's own filter, shown as words, edited in place
  await pop.getByRole("tab", { name: /All views/ }).click();
  await expect(pop.getByRole("button", { name: "Property" })).toHaveText("Folder");
  await expect(pop.getByRole("button", { name: "Operator" })).toHaveText("is in folder");
  await expect(pop.getByLabel("Value")).toHaveValue("db/chores");
  await pop.getByRole("button", { name: "Remove this filter" }).click();
  await expect.poll(base).not.toContain("inFolder");
  // the view's own filter is untouched
  expect(await base()).toContain('status == "todo"');
  await page.keyboard.press("Escape");
  await expect(pop).toHaveCount(0);
});

test("an expression the words cannot state stays an editable expression", async ({ page, request }) => {
  await chores(request, "db/exprs", '    order: [file.name, status, prio]\n    filters:\n      and:\n        - prio * 2 > 3 || status == "done"\n');
  const pane = await openBase(page, "exprs.base");
  await expect(pane.locator("tbody tr")).toHaveCount(3);
  await pane.getByRole("button", { name: "Filter" }).click();
  const pop = page.getByRole("dialog", { name: "Filter" });
  const expr = pop.getByLabel("Expression");
  await expect(expr).toHaveValue('prio * 2 > 3 || status == "done"');
  await expr.fill("prio * 2 > 5");
  await expr.press("Enter");
  await expect(pane.locator("tbody tr")).toHaveCount(1);
  await expect.poll(() => text(request, "db/exprs.base")).toContain("prio * 2 > 5");
});

test("sort and properties popovers, the view menu: sort keys, columns shown, renamed, views added and deleted", async ({ page, request }) => {
  await chores(request, "db/house");
  const pane = await openBase(page, "house.base");
  const names = () => pane.locator("tbody tr td:first-child").allInnerTexts();
  const base = () => text(request, "db/house.base");
  await expect(pane.locator("tbody tr")).toHaveCount(3);

  await pane.getByRole("button", { name: "Sort" }).click();
  const sort = page.getByRole("dialog", { name: "Sort" });
  await sort.getByRole("button", { name: "Add sort" }).click();
  await sort.getByRole("button", { name: "Sort by", exact: true }).click();
  await page.getByRole("menuitem", { name: /^Prio/ }).click();
  await sort.getByRole("button", { name: "Direction of prio" }).click();
  await page.getByRole("menuitem", { name: "9 → 1" }).click();
  await expect.poll(names).toEqual(["plants", "dishes", "laundry"]);
  await expect.poll(base).toMatch(/property: prio\n\s+direction: DESC/);
  await page.keyboard.press("Escape");

  await pane.getByRole("button", { name: "Properties" }).click();
  const props = page.getByRole("dialog", { name: "Properties" });
  await props.getByRole("checkbox", { name: "Show Status" }).uncheck();
  await expect(pane.locator("th", { hasText: "Status" })).toHaveCount(0);
  await props.getByLabel("Search properties").fill("tag");
  await props.getByRole("checkbox", { name: "Show tags", exact: true }).check();
  await expect(pane.locator("th", { hasText: "Tags" })).toHaveCount(1);
  // lists draw as chips
  await expect(pane.locator("tbody tr", { hasText: "dishes" }).locator(".chip")).toHaveText(["home", "weekly"]);
  await props.getByLabel("Search properties").fill("");
  await props.getByRole("button", { name: "Rename Prio" }).click();
  await props.getByLabel("Name of prio").fill("Priority");
  await props.getByLabel("Name of prio").press("Enter");
  await expect(pane.locator("th", { hasText: "Priority" })).toHaveCount(1);
  await expect.poll(base).toMatch(/properties:\n\s+note\.prio:\n\s+displayName: Priority/);
  await page.keyboard.press("Escape");

  // the view menu: a new cards view, renamed, deleted
  await pane.locator(".view-switch").click();
  await page.getByRole("menuitem", { name: "New cards view" }).click();
  await expect(pane.locator(".view-switch")).toHaveText("Cards");
  await expect(pane.locator(".card")).toHaveCount(3);
  await expect.poll(base).toMatch(/type: cards\n\s+name: Cards/);
  await pane.locator(".view-switch").click();
  await page.getByRole("menuitem", { name: "Rename view…" }).click();
  await page.getByRole("dialog", { name: "Name of the view" }).getByRole("textbox").fill("Gallery");
  await page.keyboard.press("Enter");
  await expect(pane.locator(".view-switch")).toHaveText("Gallery");
  await pane.locator(".view-switch").click();
  await page.getByRole("menuitem", { name: "Delete view…" }).click();
  await page.getByRole("button", { name: "Delete view" }).click();
  await expect(pane.locator(".view-switch")).toHaveText("Chores");
  const after = await base();
  expect(after).not.toContain("Gallery");
  expect(after).toContain('file.inFolder("db/house")');
});

test("columns: drag a header to move it, its edge to resize it (saved as columnSize)", async ({ page, request }) => {
  await chores(request, "db/cols");
  const pane = await openBase(page, "cols.base");
  const base = () => text(request, "db/cols.base");
  await expect(pane.locator("tbody tr")).toHaveCount(3);
  await pane.locator("th", { hasText: "Prio" }).dragTo(pane.locator("th", { hasText: "Status" }));
  await expect.poll(base).toMatch(/order:\n\s+- file\.name\n\s+- prio\n\s+- status/);
  await expect(pane.locator("th .label")).toHaveText(["Name", "Prio", "Status"]);

  const edge = pane.locator("th", { hasText: "Status" }).locator(".resize");
  const box = (await edge.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 80, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect.poll(base).toMatch(/columnSize:\n\s+note\.status: 2\d\d/);

  // the header's menu renames the column for every view
  await pane.locator("th", { hasText: "Status" }).locator(".head").click();
  await page.getByRole("menuitem", { name: "Rename…" }).click();
  await page.getByRole("dialog", { name: /Name of the column/ }).getByRole("textbox").fill("State");
  await page.keyboard.press("Enter");
  await expect(pane.locator("th .label")).toHaveText(["Name", "Prio", "State"]);
  await expect.poll(base).toMatch(/note\.status:\n\s+displayName: State/);
});

test("cells edit in place: a list as chips, a checkbox, a number", async ({ page, request }) => {
  await chores(request, "db/cells", "    order: [file.name, tags, done, prio]\n");
  const pane = await openBase(page, "cells.base");
  const note = () => text(request, "db/cells/dishes.md");
  const row = pane.locator("tbody tr", { hasText: "dishes" });
  await expect(row.locator(".chip")).toHaveText(["home", "weekly"]);

  // a list: chips with × and a field that adds one
  await row.locator("td").nth(1).click();
  await pane.getByLabel("Add to Tags").fill("chore");
  await pane.getByLabel("Add to Tags").press("Enter");
  await expect.poll(note).toMatch(/tags:\n\s*- home\n\s*- weekly\n\s*- chore\n/);
  await pane.getByRole("button", { name: "Remove weekly" }).click();
  await expect.poll(note).toMatch(/tags:\n\s*- home\n\s*- chore\n/);
  await page.keyboard.press("Escape");
  await expect(row.locator(".chip")).toHaveText(["home", "chore"]);

  // a checkbox toggles at once
  await row.locator("td").nth(2).click();
  await expect.poll(note).toContain("done: true");
  await expect(row.locator("td").nth(2).locator(".check.on")).toHaveCount(1);

  // a number stays a number
  await row.locator("td").nth(3).click();
  await pane.getByLabel("Edit Prio").fill("7");
  await pane.getByLabel("Edit Prio").press("Enter");
  await expect.poll(note).toContain("prio: 7");
  await expect(row.locator("td").nth(3)).toHaveText("7");

  // the name opens the note
  await row.locator("td").first().getByRole("button", { name: "dishes" }).click();
  await expect(page.locator(".cm-content")).toBeVisible();
});
