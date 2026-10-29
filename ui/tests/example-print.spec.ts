import { test, expect, type APIRequestContext } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// The print plugin installed as it is: "Print" in a file's menu opens the print dialog (the document as it will print,
// the options); its Print button asks the helper (lp), and the answer shows in the dialog. The printer is one that does
// not exist, so no job ever reaches a real printer (and without CUPS the helper says lp is missing): either way the
// reason is shown, not typed into a terminal.
const H = { "x-atlas": "1" };
const put = (r: APIRequestContext, path: string, text: string) => r.put("/api/file", { headers: H, data: { path, text } });
const example = (f: string) => readFileSync(fileURLToPath(new URL(`../../plugins/beta/print/${f}`, import.meta.url)), "utf8");

test.beforeAll(async ({ request }) => {
  for (const f of ["main.js", "view.js", "plugin.toml", "helper.js"]) await put(request, `.atlas/plugins/print/${f}`, example(f));
});
test.afterAll(async ({ request }) => { await put(request, ".atlas/plugins/print/main.js", "export function register() {}\n"); });

test("Print in a file's menu opens the dialog, which asks lp through the helper and shows why it was not printed", async ({ page, request }) => {
  await request.put("/api/plugins/print/settings", { headers: H, data: { printer: "atlas-test-no-such-printer", copies: 1 } });
  await put(request, "print-me.txt", "to print\n");
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Meta+Shift+f"); // Files (no button of its own since the side panel's one row of tools)
  await page.locator('.row[data-path="print-me.txt"]').click({ button: "right" });
  await page.getByRole("menu").locator('[data-label="Print"]').click();
  const dialog = page.locator(".pr-side");
  await expect(dialog.getByRole("heading", { name: "Print print-me.txt" })).toBeVisible();
  await expect(page.locator(".pr-preview")).toContainText("to print", { timeout: 20_000 }); // the document itself
  await dialog.getByLabel("Pages").fill("1");
  // never the machine's real printer: the job must go to the one that does not exist
  await expect(dialog.getByLabel("Printer", { exact: true })).toHaveValue("atlas-test-no-such-printer");
  await dialog.getByRole("button", { name: "Print", exact: true }).click();
  await expect(dialog.locator(".pr-status.err")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".xterm-rows")).toHaveCount(0); // nothing typed into a terminal
});
