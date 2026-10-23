import { test, expect } from "@playwright/test";

// Settings → Keyboard says when two commands claim the same key in the same place (only one of
// them would ever run). The defaults must have no such clash.
const H = { "x-atlas": "1" };

test("the default keys do not clash; a clash made by hand is shown on both commands", async ({ page, request }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("F1");
  await page.keyboard.type("Settings");
  await page.getByTestId("palette").getByText("Settings", { exact: true }).first().click();
  await page.getByRole("button", { name: /^Keyboard/ }).first().click();
  await expect(page.getByRole("button", { name: "Shortcut for Command palette" })).toBeVisible();
  // a command's other keys are shown on its row (F1 beside the palette's Super+E, Ctrl+P beside Super+P)
  await expect(page.getByText(/also .*F1/).first()).toBeVisible();
  await expect(page.getByText(/also .*Ctrl\+P/).first()).toBeVisible();
  const clashing = () => page.locator("[data-clash]").evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.clash));
  expect(await clashing(), "no two default keys are the same in the same place").toEqual([]);

  // give "Show files" the key of "Git": both rows say so
  await request.put("/api/keys", { headers: H, data: { id: "ui.files", keys: "Super+G" } });
  await page.reload();
  await page.getByText("Finish the GW notes.").waitFor().catch(() => {});
  await page.keyboard.press("F1");
  await page.keyboard.type("Settings");
  await page.getByTestId("palette").getByText("Settings", { exact: true }).first().click();
  await page.getByRole("button", { name: /^Keyboard/ }).first().click();
  await expect(page.locator('[data-clash="ui.files"]')).toContainText("same key as Git");
  await expect(page.locator('[data-clash="ui.git"]')).toContainText("same key as Show files");
  await request.put("/api/keys", { headers: H, data: { id: "ui.files", keys: null } }); // the shared vault as it was
});
