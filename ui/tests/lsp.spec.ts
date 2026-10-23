import { test, expect } from "@playwright/test";

test("a code file talks to its language server: diagnostics, hover, completion", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Control+p");
  await page.keyboard.type("run.py");
  await expect(page.getByTestId("palette").getByText("run.py").first()).toBeVisible();
  await page.keyboard.press("Enter");
  // the fake server flags `import` on line 1 as soon as the file opens
  await expect(page.locator(".cm-lintRange-warning")).toHaveCount(1, { timeout: 10000 });
  await page.locator(".cm-line", { hasText: "def energy" }).getByText("energy").hover();
  await expect(page.locator(".cm-tooltip-hover")).toContainText("fake hover", { timeout: 8000 });
  // Problems (VS Code): counts in the status bar; click → the list; an entry → its line
  const problems = page.getByRole("button", { name: "Problems: 0 errors, 1 warning" });
  await expect(problems).toBeVisible();
  await problems.click();
  await expect(page.locator(".cm-panel-lint")).toContainText("fake: unused import");
});

// basedpyright / rust-analyzer answer a rename with `documentChanges`, which @codemirror/lsp-client
// 6.3 ignored (nothing happened), and it skips files not open in an editor; vim also swallowed F2.
test("F2 renames through the server, in the open file and in a closed one, with vim on", async ({ page, request }) => {
  const H = { "x-atlas": "1" };
  await request.put("/api/file", { headers: H, data: { path: "projects/lsp_main.py", text: "old_name = 1\nprint(old_name)\n" } });
  await request.put("/api/file", { headers: H, data: { path: "projects/lsp_other.py", text: "old_name\n" } });
  await page.goto("/");
  await page.keyboard.press("Control+p");
  await page.keyboard.type("lsp_main.py");
  await expect(page.getByTestId("palette").getByText("lsp_main.py").first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator(".cm-lintRange-warning")).toHaveCount(1, { timeout: 10000 }); // the server is up
  await page.locator(".cm-line").first().click();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("vim-mode")).toHaveText(/NORMAL/);
  await page.keyboard.press("F2");
  await expect(page.locator(".cm-lsp-rename-panel input[name=name]")).toBeFocused();
  await page.keyboard.type("new_name");
  await page.keyboard.press("Enter");
  await expect(page.locator(".cm-line").first()).toHaveText("new_name = 1");
  const text = (f: string) => request.get(`/api/file?path=${f}`, { headers: H }).then((r) => r.json()).then((j) => j.text);
  await expect.poll(() => text("projects/lsp_other.py")).toBe("new_name\n");
});

// VS Code's Ctrl+. : the server's quick fixes for the caret's place, chosen in the palette; the
// problem under the caret is sent along, and the chosen action's edit lands in the editor.
test("Ctrl+. offers the server's code actions and applies the one chosen", async ({ page, request }) => {
  await request.put("/api/file", { headers: { "x-atlas": "1" }, data: { path: "projects/lsp_fix.py", text: "import os\nprint(1)\n" } });
  await page.goto("/");
  await page.keyboard.press("Control+p");
  await page.keyboard.type("lsp_fix.py");
  await expect(page.getByTestId("palette").getByText("lsp_fix.py").first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator(".cm-lintRange-warning")).toHaveCount(1, { timeout: 10000 });
  await page.locator(".cm-line").first().click();
  await page.keyboard.press("Control+.");
  const palette = page.getByTestId("palette");
  await expect(palette.getByText("Remove unused import (asked about: fake: unused import)")).toBeVisible();
  await expect(palette.getByText("Disabled action")).toHaveCount(0);
  await page.keyboard.press("Enter");
  await expect(page.locator(".cm-line").first()).toHaveText("print(1)");
});

// "the tab is kind of broken with code autocompletion" (2026-10-15): in code Tab takes the entry, as in
// VS Code (walking a one-entry list did nothing); without a list it types an indent at the caret.
test("in code Tab takes the server's completion; without a list it indents at the caret", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Control+p");
  await page.keyboard.type("run.py");
  await expect(page.getByTestId("palette").getByText("run.py").first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator(".cm-lintRange-warning")).toHaveCount(1, { timeout: 10000 });
  const text = () => page.evaluate(() => (window as any).__atlas.editor().text as string);
  await page.locator(".cm-line", { hasText: "def energy" }).click();
  if (await page.locator(".cm-fat-cursor").count()) await page.keyboard.press("o"); else { await page.keyboard.press("End"); await page.keyboard.press("Enter"); }
  await page.keyboard.type("x = fa");
  const list = page.locator(".cm-tooltip-autocomplete");
  await expect(list).toContainText("fake_completion", { timeout: 8000 });
  await page.waitForTimeout(150);
  await page.keyboard.press("Tab");
  await expect.poll(text).toContain("x = fake_completion");
  await expect(list).toBeHidden();
});
