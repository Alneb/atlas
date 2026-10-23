import { test, expect } from "@playwright/test";

// A block's options as a form (docs/design/PAGES.md): the page's block menu → "Options…" draws the fields
// the block declares; saving writes them into the `.page` file, an emptied field leaves the file.
const H = { "x-atlas": "1" };

test("a block's options are edited in a form and land in the page file", async ({ page, request }) => {
  await request.put("/api/file", { headers: H, data: { path: "Opt.page", text: "# keep me\ntitle: Opt\nrows:\n  - [{ view: list, from: tasks, title: Tasks }]\n  - [{ view: terminal }]\n  - [greeting]\n" } });
  const text = () => request.get("/api/file?path=Opt.page", { headers: H }).then((r) => r.json()).then((j) => j.text as string);
  await page.goto("/");
  await page.keyboard.press("Control+p");
  await page.keyboard.type("Opt.page");
  await expect(page.getByTestId("palette").getByText("Opt", { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Enter");
  const pane = page.locator(".atlas-pane-page .page");
  await expect(pane.locator('[data-block="list"]')).toContainText("check the sign of t");
  await pane.getByRole("button", { name: "Arrange" }).click();

  // a row view: text, a list and a switch
  await pane.getByRole("button", { name: "Block menu: Tasks" }).click();
  await page.getByRole("menuitem", { name: "Options…" }).click();
  const form = page.getByRole("form", { name: "Options: Tasks" });
  await expect(form.getByLabel("Rows from")).toHaveValue("tasks");
  await form.getByLabel("Columns").fill("state, due");
  await form.getByLabel("Only rows with a date").check();
  await form.getByRole("button", { name: "Save" }).click();
  await expect.poll(text).toContain("columns: [state, due]");
  expect(await text()).toContain("dated: true");
  expect(await text()).toContain("from: tasks");

  // emptied and switched off: the keys leave the file
  await pane.getByRole("button", { name: "Block menu: Tasks" }).click();
  await page.getByRole("menuitem", { name: "Options…" }).click();
  await form.getByLabel("Columns").fill("");
  await form.getByLabel("Only rows with a date").uncheck();
  await form.getByRole("button", { name: "Save" }).click();
  await expect.poll(text).not.toContain("dated");
  expect(await text()).not.toContain("columns");
  expect(await text()).toContain("from: tasks");

  // a choice
  await pane.getByRole("button", { name: /^Block menu: (Terminal|Shell)/  }).click();
  await page.getByRole("menuitem", { name: "Options…" }).click();
  const term = page.getByRole("form", { name: /^Options:/ });
  await term.getByRole("button", { name: "Runs" }).click();
  await page.getByRole("option", { name: "claude" }).click();
  await term.getByRole("button", { name: "Save" }).click();
  await expect.poll(text).toContain("preset: claude");

  // a block with nothing to set offers no form; the rest of the file is as it was
  await pane.getByRole("button", { name: "Block menu: Greeting" }).click();
  await expect(page.getByRole("menuitem", { name: "Title…" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Options…" })).toHaveCount(0);
  expect(await text()).toMatch(/^# keep me\ntitle: Opt\n/);
});
