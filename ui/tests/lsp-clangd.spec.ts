import { test, expect } from "@playwright/test";
import { openFile } from "./open";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { WS } from "../playwright.config";

// Ctrl+. against a real language server, not lsp.spec's fake one: clangd's fix-it for a missing `;` offered in the
// palette and applied. Skipped where clangd is not installed (the fake server covers the mechanism everywhere).
const has = (cmd: string) => { try { execFileSync("which", [cmd], { stdio: "ignore" }); return true; } catch { return false; } };
const CONFIG = join(WS, ".atlas/config.toml");
let kept = "";

test.beforeAll(() => {
  kept = readFileSync(CONFIG, "utf8");
  writeFileSync(CONFIG, kept.replace(/^c = "off"$/m, 'c = "clangd"'));
});
test.afterAll(() => writeFileSync(CONFIG, kept));

test("Ctrl+. offers clangd's fix-it and applies it", async ({ page, request }) => {
  test.skip(!has("clangd"), "clangd is not installed here");
  await request.put("/api/file", { headers: { "x-atlas": "1" }, data: { path: "projects/fixit.c", text: "int main(void) {\n  int x = 1\n  return x;\n}\n" } });
  await page.goto("/");
  await openFile(page, "fixit.c");
  await expect(page.locator(".cm-lintRange-error")).not.toHaveCount(0, { timeout: 30_000 });
  // clangd puts "expected ';'" on the next token (the `return` below), as the caret's problem it is asked about
  await page.locator(".cm-line", { hasText: "return x;" }).click();
  await page.keyboard.press("Control+.");
  const fix = page.getByTestId("palette").locator(".item, [role=option]", { hasText: /insert ';'/i });
  await expect(fix).toBeVisible({ timeout: 15_000 });
  await fix.click();
  await expect(page.locator(".cm-line", { hasText: "int x = 1" })).toHaveText("  int x = 1;");
});
