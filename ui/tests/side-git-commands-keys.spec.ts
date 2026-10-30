import { test, expect } from "@playwright/test";

// A change's ↺ and + buttons appear on hover; reached with Tab they must show too, not stay invisible.
test("Git: a change's buttons are visible while they have the focus", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Meta+g");
  const stage = page.getByRole("button", { name: "Stage notes/hubbard.md" });
  await expect(stage).toBeAttached();
  await page.mouse.move(0, 0);
  await stage.focus();
  await expect(stage).toHaveCSS("opacity", "1");
});

// The Commands pane: a filter that hides everything says so (not "no scripts yet"); Esc clears it;
// "New command" puts the caret in its Title, and Esc closes the form back onto the button.
test("Commands: filter empty state, Esc clears the filter, the new-command form's focus", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Meta+Shift+K");
  const pane = page.locator(".commands");
  const filter = pane.getByPlaceholder(/Filter commands/);
  await filter.fill("zzqq-nothing-like-this");
  await expect(pane.locator(".empty")).toHaveText(["No script matches “zzqq-nothing-like-this”.", "No command matches “zzqq-nothing-like-this”."]);
  await expect(pane.getByText("No scripts yet")).toHaveCount(0);
  await filter.press("Escape");
  await expect(filter).toHaveValue("");
  await expect(pane.locator(".cmd").first()).toBeVisible();

  const add = pane.getByRole("button", { name: "New command", exact: true });
  await add.click();
  await expect(pane.getByLabel("Title")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(pane.locator("form.new")).toHaveCount(0);
  await expect(add).toBeFocused();
});
