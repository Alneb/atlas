import { test, expect } from "@playwright/test";
import { openFile } from "./open";

// The `welcome` block (components/views/Welcome.svelte), a new vault's first Home row: each main function a button that
// runs its command and shows its key, the release's plugins to install, and "Remove this guide" taking its row out.
const H = { "x-atlas": "1" };

test("Getting started: a button runs its command and shows its key; removing the guide edits only its row", async ({ page, request }) => {
  await request.put("/api/file", { headers: H, data: { path: "Wel.page", text: "# mine\ntitle: Wel\nrows:\n  - [welcome]\n  - [greeting]\n" } });
  const text = () => request.get("/api/file?path=Wel.page", { headers: H }).then((r) => r.json()).then((j) => j.text as string);
  await page.goto("/");
  await openFile(page, "Wel.page");
  const block = page.locator(".atlas-pane-page .welcome");
  await expect(block.getByRole("heading", { name: "Getting started" })).toBeVisible();
  await expect(block.locator('[data-command="ui.settings"] .name')).toHaveText("Settings");
  await expect(block.locator('[data-command="ui.palette"] kbd')).not.toBeEmpty();
  // the plugins: a list, or why there is none (the test server has no release to read)
  await expect(block.locator(".plugins li, .faint").first()).toBeVisible();
  for (const theme of ["light", "dark"]) {
    await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
    await block.screenshot({ path: `../target/snip/welcome-${theme}.png` });
    await page.screenshot({ path: `../target/snip/welcome-window-${theme}.png` });
  }

  await block.locator('[data-command="ui.settings"]').click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();

  await openFile(page, "Wel.page");
  await page.locator(".atlas-pane-page .welcome").getByRole("button", { name: /Remove this guide/ }).click();
  await expect.poll(text).toBe("# mine\ntitle: Wel\nrows:\n  - [greeting]\n");
});
