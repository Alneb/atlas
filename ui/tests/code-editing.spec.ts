import { test, expect, type Page } from "@playwright/test";

// Typing in a code file: the file's own indentation (as VS Code detects it), Tab at once even while the language
// server is asked for completions, and a language server's answer for lines the file no longer has.
const H = { "x-atlas": "1" };
const text = (page: Page) => page.evaluate(() => (window as unknown as { __atlas: { editor(): { text: string } } }).__atlas.editor().text);

async function edit(page: Page, path: string, body: string, line: number) {
  await page.request.put("/api/file", { headers: H, data: { path, text: body } });
  await page.request.post("/api/cmd/open", { headers: H, data: { args: { path } } });
  const ed = page.locator(".code-cm:visible .cm-content").first();
  await expect(ed).toBeVisible();
  await ed.locator(".cm-line").nth(line).click();
  if (await page.locator(".cm-fat-cursor").count()) await page.keyboard.press("i"); // the tests' workspace has vim on
  await page.keyboard.press("End");
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
});

test("Enter and Tab indent by the file's own unit: four spaces, two, or a tab", async ({ page }) => {
  await edit(page, "code_edit/four.py", "def f(x):\n    if x:\n        return x\n", 0);
  await page.keyboard.press("Enter");
  await page.keyboard.insertText("y = 1");
  await expect.poll(() => text(page), "Enter after a colon: one of the file's four-space steps").toBe("def f(x):\n    y = 1\n    if x:\n        return x\n");
  await page.keyboard.press("Home");
  await page.keyboard.press("Tab");
  await expect.poll(() => text(page)).toBe("def f(x):\n        y = 1\n    if x:\n        return x\n");

  await edit(page, "code_edit/two.js", "function f() {\n  return 1;\n}\n", 1);
  await page.keyboard.press("Home");
  await page.keyboard.press("Tab");
  await expect.poll(() => text(page)).toBe("function f() {\n    return 1;\n}\n");

  await edit(page, "code_edit/tabs.c", "int f() {\n\treturn 1;\n}\n", 1);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await page.keyboard.insertText("x;");
  await expect.poll(() => text(page)).toBe("int f() {\n\treturn 1;\n\t\tx;\n}\n");
});

test("Tab right after a letter indents even while the server is asked for completions", async ({ page }) => {
  await edit(page, "code_edit/fast.py", "x = 1\n", 0);
  await page.keyboard.press("Enter");
  await page.keyboard.insertText("a"); // asks the language server: the list is pending, not shown
  await page.keyboard.press("Tab");
  await page.keyboard.insertText("b"); // typed at once, before any list could come
  await expect.poll(() => text(page)).toBe("x = 1\na    b\n");
});

test("a language server's inlay hint for a line the file does not have is dropped, not thrown", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // the test server always puts a hint on line 6; this file has two
  await edit(page, "code_edit/short.py", "import os\nv = 1\n", 1);
  await expect(page.locator(".code-cm:visible .cm-lintRange-warning")).toHaveCount(1, { timeout: 10000 }); // the server answered
  await page.keyboard.insertText("2");
  await page.waitForTimeout(1000); // past the hints' 400 ms wait
  expect(errors).toEqual([]);
  await expect.poll(() => text(page)).toBe("import os\nv = 12\n");
});

// The bar above each code tab counts that file's problems: with two side by side, focusing the other one (here a
// file no server checks) left the first bar empty, or showing the other file's counts.
test("each code tab's bar counts its own file's problems, whichever tab has the focus", async ({ page }) => {
  await page.request.put("/api/file", { headers: H, data: { path: "code_edit/plain.txt", text: "no checker\n" } });
  await edit(page, "code_edit/checked.py", "import os\n", 0);
  const bars = page.locator('[data-testid="code-bar"]:visible');
  await expect(bars.first().getByRole("button", { name: "0 errors · 1 warning" })).toBeVisible({ timeout: 10000 });
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+p");
  await page.keyboard.type("plain.txt");
  await expect(page.getByTestId("palette").getByRole("button", { name: /^plain code_edit/ })).toBeVisible();
  await page.keyboard.press("Control+Enter"); // beside the .py tab
  await expect(bars).toHaveCount(2);
  await page.locator(".code-cm:visible .cm-line", { hasText: "no checker" }).click();
  await expect(page.getByRole("button", { name: "0 errors · 1 warning" }), "the .py tab's bar keeps its count").toHaveCount(1);
});

// A file written with Windows line endings keeps them: the editor joins its lines with "\n", and a save (even of an
// unchanged file) rewrote every line ending, so git saw the whole file changed.
test("a CRLF file, code or note, is saved with CRLF line endings", async ({ page }) => {
  const disk = async () => ((await (await page.request.get("/api/file?path=code_edit/crlf.py", { headers: H })).json()) as { text: string }).text;
  await edit(page, "code_edit/crlf.py", "a = 1\r\nb = 2\r\n", 0);
  await page.keyboard.insertText("0");
  await page.keyboard.press("Enter");
  await page.keyboard.insertText("c = 3");
  await page.keyboard.press("Control+s");
  await expect.poll(disk).toBe("a = 10\r\nc = 3\r\nb = 2\r\n");
  await expect(page.getByTestId("sidebar").locator(".tab", { hasText: "crlf" })).not.toHaveClass(/dirty/);

  // a note too, saved by itself
  const note = async () => ((await (await page.request.get("/api/file?path=code_edit/crlf-note.md", { headers: H })).json()) as { text: string }).text;
  await page.request.put("/api/file", { headers: H, data: { path: "code_edit/crlf-note.md", text: "# Crlf\r\n\r\nfirst\r\n" } });
  await page.request.post("/api/cmd/open", { headers: H, data: { args: { path: "code_edit/crlf-note.md" } } });
  await page.locator(".cm-content:visible .cm-line", { hasText: "first" }).click();
  if (await page.locator(".cm-fat-cursor").count()) await page.keyboard.press("A"); else await page.keyboard.press("End");
  await page.keyboard.insertText(" line");
  await expect.poll(note).toBe("# Crlf\r\n\r\nfirst line\r\n");
});

// With vim on, the match find selects puts vim in visual mode; after Escape closed find, the next "i" was the start of
// a text object instead of insert mode. Closing find now leaves normal mode at the match, as vim's own `/` does.
test("vim: closing find leaves normal mode at the match, so the next key is a command", async ({ page }) => {
  await edit(page, "code_edit/vimfind.py", "x = 1\nprint(x)\n", 0);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("vim-mode")).toHaveText(/NORMAL/);
  await page.keyboard.press("Control+f");
  await page.keyboard.type("print");
  await expect(page.locator(".cm-search-count")).toHaveText("1 of 1");
  await page.keyboard.press("Escape");
  await expect(page.locator(".cm-search")).toHaveCount(0);
  await expect(page.getByTestId("vim-mode")).toHaveText(/NORMAL/);
  await page.keyboard.press("i");
  await page.keyboard.insertText("# ");
  await expect.poll(() => text(page)).toBe("x = 1\n# print(x)\n");
});

// Find counts its matches once per text and query (a caret move only looks up which one is selected): the count and
// the index stay right through moves, a change of the text, and a new query.
test("find's 'N of M' follows the caret, an edit and the query", async ({ page }) => {
  await edit(page, "code_edit/count.py", Array.from({ length: 50 }, (_, i) => `v${i} = ${i}`).join("\n") + "\n", 0);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+f");
  await page.keyboard.type("= 1");
  const count = page.locator(".cm-search-count");
  await expect(count).toHaveText("1 of 11"); // = 1, = 10 … = 19
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await expect(count).toHaveText("3 of 11");
  await page.keyboard.press("Shift+Enter");
  await expect(count).toHaveText("2 of 11");
  await page.locator(".code-cm:visible .cm-line").nth(49).click(); // a caret, no match selected
  await expect(count).toHaveText("11");
  await page.keyboard.press("i");
  await page.keyboard.press("End");
  await page.keyboard.insertText("\nw = 1");
  await expect(count).toHaveText("12");
  await page.locator(".cm-search input[name=search]").selectText();
  await page.keyboard.type("= 4");
  await expect(count).toHaveText(/^(1 of )?11$/); // = 4, = 40 … = 49
});
