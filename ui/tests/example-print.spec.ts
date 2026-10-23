import { test, expect, type APIRequestContext } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// The example print plugin installed as it is: "Print" in a file's menu types `lp` with the
// printer and options of its settings into the terminal.
const H = { "x-atlas": "1" };
const put = (r: APIRequestContext, path: string, text: string) => r.put("/api/file", { headers: H, data: { path, text } });
const example = (f: string) => readFileSync(fileURLToPath(new URL(`../../plugins/stable/print/${f}`, import.meta.url)), "utf8");

test.beforeAll(async ({ request }) => {
  await put(request, ".atlas/plugins/print/main.js", example("main.js"));
  await put(request, ".atlas/plugins/print/plugin.toml", example("plugin.toml"));
});
test.afterAll(async ({ request }) => { await put(request, ".atlas/plugins/print/main.js", "export function register() {}\n"); });

test("Print in a file's menu runs lp with the printer of the settings, in the terminal", async ({ page, request }) => {
  await request.put("/api/plugins/print/settings", { headers: H, data: { printer: "Office", options: "-o media=A4" } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Meta+Shift+f"); // Files (no button of its own since the side panel's one row of tools)
  await page.locator('.row[data-path$="journal.md"]').first().click({ button: "right" });
  await page.getByRole("menu").locator('[data-label="Print"]').click();
  await expect(page.locator(".xterm-rows")).toContainText("lp -d 'Office' -o media=A4 'journal.md'", { timeout: 15_000 });
});
