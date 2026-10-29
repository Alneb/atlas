import { test, expect, type APIRequestContext } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// The Export plugin installed as it is: "Export…" on a note opens its dialog in a popup over the app (API 20), the
// note's title already in it; with pandoc on the machine, PDF (Typst) previews by itself (the core's Typst) and
// Export writes the PDF under exports/. A ```typst block in a note is drawn by the core too.
const H = { "x-atlas": "1" };
const put = (r: APIRequestContext, path: string, text: string) => r.put("/api/file", { headers: H, data: { path, text } });
const example = (f: string) => readFileSync(fileURLToPath(new URL(`../../plugins/beta/export/${f}`, import.meta.url)), "utf8");

test.beforeAll(async ({ request }) => {
  for (const f of ["main.js", "view.js", "plugin.toml", "helper.js", "tikz.lua"]) await put(request, `.atlas/plugins/export/${f}`, example(f));
});
test.afterAll(async ({ request }) => { await put(request, ".atlas/plugins/export/main.js", "export function register() {}\n"); });

test("Export… opens the dialog in a popup; PDF (Typst) previews and exports", async ({ page, request }) => {
  await put(request, "notes/export-me.md", "---\nauthor: Alice\n---\n# A small report\n\nSome text with $x^2$ and ==a mark==.\n\n```typst\n$ integral_0^1 x dif x = 1/2 $\n```\n");
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Meta+Shift+f");
  await page.locator('.row[data-path="notes"]').click();
  await page.locator('.row[data-path="notes/export-me.md"]').click({ button: "right" });
  await page.getByRole("menu").locator('[data-label="Export…"]').click();
  const dialog = page.getByRole("dialog", { name: "Export export-me" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Title", { exact: true })).toHaveValue("A small report", { timeout: 20_000 });
  await expect(dialog.getByLabel("Author", { exact: true })).toHaveValue("Alice");
  const typst = dialog.locator(".ex-format", { hasText: "PDF (Typst)" });
  test.skip(await typst.locator("input").isDisabled(), "pandoc is not installed here");
  await expect(dialog.locator(".ex-preview-label")).toHaveText("Preview", { timeout: 30_000 });
  for (const scheme of ["light", "dark"] as const) { // judged in both themes (docs/guides/UI-STYLE.md)
    await page.emulateMedia({ colorScheme: scheme });
    await page.screenshot({ path: `test-results/export-dialog-${scheme}.png` });
  }
  await dialog.getByLabel("Numbered sections").check();
  await dialog.getByRole("button", { name: "Export", exact: true }).click();
  await expect(dialog.locator(".ex-status")).toContainText("Exported: exports/notes/export-me.pdf", { timeout: 30_000 });
  const r = await request.get("/api/raw", { headers: H, params: { path: "exports/notes/export-me.pdf" } }); // a binary: raw, not the text endpoint
  expect(r.ok()).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("a ```typst block in a note is drawn by the core's Typst; an error shows Typst's line", async ({ page, request }) => {
  await put(request, "notes/typst-fence.md", "# Typst\n\n```typst\n$ sum_(k=1)^n k = (n(n+1))/2 $\n```\n\n```typst\nfine\n#nope(1)\n```\n");
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Meta+p");
  await page.keyboard.type("typst-fence");
  await page.getByRole("dialog", { name: "Command palette" }).getByRole("button", { name: /^typst-fence/ }).first().click();
  await expect(page.locator(".typst-figure[data-state=done] svg").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".typst-figure[data-state=error] .tikz-error-log")).toContainText("line 2:");
});
