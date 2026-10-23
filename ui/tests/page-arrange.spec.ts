import { test, expect } from "@playwright/test";

// docs/design/PAGES.md: a page is arranged by hand — add, move (menu or drag), remove, undo — and every
// gesture is one write of the `.page` file, whose comments and other keys survive.
const H = { "x-atlas": "1" };

test("arrange a page by hand: the file follows every gesture", async ({ page, request }) => {
  await request.put("/api/file", { headers: H, data: { path: "Arr.page", text: "# my desk: keep this comment\ntitle: Arr\nrows:\n  - [greeting]\n  - [focus]\n" } });
  const text = () => request.get("/api/file?path=Arr.page", { headers: H }).then((r) => r.json()).then((j) => j.text as string);
  await page.goto("/");
  await page.keyboard.press("Control+p");
  await page.keyboard.type("Arr.page");
  await expect(page.getByTestId("palette").getByText("Arr", { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Enter");
  const pane = page.locator(".atlas-pane-page .page");
  await expect(pane.locator('[data-block="greeting"]')).toBeVisible();

  await pane.getByRole("button", { name: "Arrange" }).click();
  // add: the "+" under the greeting → the chooser → Open tasks
  await pane.locator('[data-slot="b0.0.end"]').hover();
  await pane.locator('[data-slot="b0.0.end"] .add').click();
  await page.keyboard.type("Open tasks");
  await expect(page.getByTestId("palette").getByText("Open tasks").first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect.poll(text).toContain("- [greeting, tasks]");
  // the block is drawn with its list (which tasks lead depends on what other tests left; in arrange mode it takes no clicks)
  await expect(pane.locator('[data-block="tasks"]')).toContainText(/Open tasks\s*\d+/);

  // move with the menu (the keyboard path): tasks into a column of its own
  await pane.getByRole("button", { name: "Block menu: Open tasks" }).click();
  await page.getByRole("menuitem", { name: "Move to a new column" }).click();
  await expect.poll(text).toContain("  - columns:\n      - [greeting]\n      - [tasks]\n  - [focus]");

  // move by dragging: focus from its own row to under the greeting
  await pane.locator('[data-block="focus"] .bar').dragTo(pane.locator('[data-slot="b0.0.end"]'));
  await expect.poll(text).toContain("      - [greeting, focus]\n      - [tasks]");
  expect((await text()).match(/^  - /gm)?.length).toBe(1); // the emptied row is gone

  // remove, then undo
  await pane.getByRole("button", { name: "Block menu: Open tasks" }).click();
  await page.getByRole("menuitem", { name: "Remove" }).click();
  await expect.poll(text).toContain("  - [greeting, focus]");
  await pane.getByRole("button", { name: "Undo" }).click();
  await expect.poll(text).toContain("      - [greeting, focus]\n      - [tasks]");
  await expect(pane.locator('[data-block="tasks"]')).toBeVisible();

  // the rest of the file is untouched
  expect(await text()).toMatch(/^# my desk: keep this comment\ntitle: Arr\n/);
  await pane.getByRole("button", { name: "Done", exact: true }).click();
  await expect(pane.locator(".bar")).toHaveCount(0);
});

test("a block that shows a file asks which one; older shorthands still read", async ({ page, request }) => {
  await request.put("/api/file", { headers: H, data: { path: "Arr2.page", text: "title: Arr2\nrows:\n  - [{ note: FOCUS.md, title: Focus file }, { text: \"**hello** there\" }]\n" } });
  const text = () => request.get("/api/file?path=Arr2.page", { headers: H }).then((r) => r.json()).then((j) => j.text as string);
  await page.goto("/");
  await page.keyboard.press("Control+p");
  await page.keyboard.type("Arr2.page");
  await expect(page.getByTestId("palette").getByText("Arr2", { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Enter");
  const pane = page.locator(".atlas-pane-page .page");
  await expect(pane.locator('[data-block="note"]')).toContainText("Finish the GW notes.");
  await expect(pane.locator('[data-block="text"] strong')).toHaveText("hello");
  await pane.getByRole("button", { name: "Arrange" }).click();
  await pane.locator('[data-slot="rend"]').hover();
  await pane.locator('[data-slot="rend"] .add').click();
  await page.keyboard.type("Database");
  await page.keyboard.press("Enter");
  await page.keyboard.type("all.base");
  await page.getByTestId("palette").getByText("all.base", { exact: true }).first().click();
  await expect.poll(text).toContain("{view: base, path: db/all.base}");
  await expect(pane.locator('[data-block="base"]')).toContainText("l1");
});
