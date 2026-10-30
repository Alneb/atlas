import { test, expect } from "@playwright/test";

// The task dialog by keyboard: the priority is one radio group — one Tab stop, arrows change it.
const H = { "x-atlas": "1" };

test("the priority radios are one Tab stop, and the arrows move the choice", async ({ page, request }) => {
  await request.put("/api/file", { headers: H, data: { path: "notes/ux-task-keys.md", text: "# Plain\n\n<!-- atlas:no-tasks -->\n- [ ] pay rent ⏫ #home\n" } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Control+p");
  await page.keyboard.type("ux-task-keys.md");
  await expect(page.getByTestId("palette").getByText("ux-task-keys", { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Enter");
  await page.locator(".cm-content").getByText("pay rent").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Task…" }).click();
  const dialog = page.getByTestId("task-dialog");
  await expect(dialog.getByLabel("Description")).toBeFocused();
  await page.keyboard.press("Tab"); // into the group: the checked radio
  await expect(dialog.getByRole("radio", { name: "High", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(dialog.getByRole("radio", { name: "Medium" })).toBeFocused();
  await expect(dialog.getByRole("radio", { name: "Medium" })).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Tab"); // out of the group in one press
  await expect(dialog.getByRole("radio")).not.toHaveCount(0);
  expect(await page.evaluate(() => document.activeElement?.getAttribute("role"))).not.toBe("radio");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});
