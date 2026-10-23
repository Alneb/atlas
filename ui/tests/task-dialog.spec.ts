import { test, expect } from "@playwright/test";

// Obsidian Tasks' "Create or
// edit task" dialog on any note's line: a plain line becomes a task, a task's fields are edited in place.
const H = { "x-atlas": "1" };

test("the task dialog edits a task's fields in a plain note, and makes a task of a plain line", async ({ page, request }) => {
  // <!-- atlas:no-tasks -->: the shared test vault's Home list must not grow
  await request.put("/api/file", { headers: H, data: { path: "notes/task-dialog.md", text: "# Plain\n\n<!-- atlas:no-tasks -->\n- [ ] pay rent ⏫ 📅 2026-11-01 #home\nwater the plants\n" } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Control+p");
  await page.keyboard.type("task-dialog.md");
  await expect(page.getByTestId("palette").getByText("task-dialog", { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Enter");
  const text = () => page.evaluate(() => (window as any).__atlas.editor().text as string);

  // an existing task: its fields are in the form
  await page.locator(".cm-content").getByText("pay rent").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Task…" }).click();
  const dialog = page.getByTestId("task-dialog");
  await expect(dialog.getByRole("heading", { name: "Edit task" })).toBeVisible();
  await expect(dialog.getByLabel("Description")).toHaveValue("pay rent #home");
  await expect(dialog.getByRole("radio", { name: "High", exact: true })).toHaveAttribute("aria-checked", "true");
  await expect(dialog.getByLabel("Due", { exact: true })).toHaveValue("2026-11-01");
  await dialog.getByRole("radio", { name: "Normal" }).click();
  await dialog.getByLabel("Scheduled", { exact: true }).fill("2026-10-30");
  await dialog.getByLabel("Repeats").fill("every month");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(text).toContain("- [ ] pay rent #home 🔁 every month ⏳ 2026-10-30 📅 2026-11-01\n");

  // a plain line becomes a task; Escape leaves the line as it was
  await page.locator(".cm-content").getByText("water the plants").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Task…" }).click();
  await expect(dialog.getByRole("heading", { name: "Create task" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  expect(await text()).toContain("\nwater the plants\n");
  await page.locator(".cm-content").getByText("water the plants").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Task…" }).click();
  await dialog.getByRole("button", { name: "Tomorrow" }).first().click();
  await dialog.getByLabel("Description").press("Enter");
  const tomorrow = await page.evaluate(() => { const d = new Date(); d.setDate(d.getDate() + 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; });
  await expect.poll(text).toContain(`- [ ] water the plants 📅 ${tomorrow}`);
});
