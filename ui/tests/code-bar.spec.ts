import { test, expect, type APIRequestContext } from "@playwright/test";
import { shownName } from "../src/lib/paths";

// "a bar on top of that tab with this options": above a code file — find, replace, go to line,
// format, problems — and the tools a plugin adds for the file (`atlas.editor.toolbar`). Not on notes.
const H = { "x-atlas": "1" };
const put = (r: APIRequestContext, path: string, text: string) => r.put("/api/file", { headers: H, data: { path, text } });
const MAIN = `export function register(atlas) {
  const cell = atlas.shell.statusItem({ id: "ran", text: "not run" });
  atlas.editor.toolbar((file) => file.path.endsWith(".py") ? [{ label: "Run", title: "Run this file", run: () => cell.set("ran " + file.path) }] : []);
}\n`;

test.beforeAll(async ({ request }) => {
  await put(request, "code/bar_demo.py", "def f(x):\n    return x + 1\n\nprint(f(41))\n");
  await put(request, "code/bar_demo.txt", "plain text\n");
  await put(request, ".atlas/plugins/runtool/plugin.toml", 'title = "Run tool"\n');
  await put(request, ".atlas/plugins/runtool/main.js", MAIN);
});
test.afterAll(async ({ request }) => { await put(request, ".atlas/plugins/runtool/main.js", "export function register() {}\n"); });

test("a code tab has a tool bar: find, go to line, a plugin's Run for its files; a note has none", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  const openFile = async (name: string) => {
    await page.keyboard.press("Control+p");
    await page.keyboard.type(name);
    await expect(page.getByTestId("palette").getByText(shownName(name), { exact: true }).first()).toBeVisible();
    await page.keyboard.press("Enter");
  };
  await openFile("bar_demo.py");
  const bar = page.getByTestId("code-bar");
  await expect(bar).toBeVisible();
  await bar.getByRole("button", { name: "Find", exact: true }).click();
  await expect(page.locator(".cm-search")).toBeVisible();
  await page.keyboard.press("Escape");
  await bar.getByRole("button", { name: "Line…" }).click();
  await expect(page.locator(".cm-panel input")).toBeFocused();
  await page.keyboard.press("Escape");

  // with a word selected, "In files…" opens replace-across-the-vault already searching for it
  await page.locator(".cm-line", { hasText: "return x + 1" }).dblclick({ position: { x: 60, y: 8 } });
  const picked = await page.evaluate(() => getSelection()?.toString().trim() ?? "");
  expect(picked.length).toBeGreaterThan(0);
  await bar.getByRole("button", { name: "In files…" }).click();
  await expect(page.getByPlaceholder(/Replace/i).first(), "replace across the vault, from the bar").toBeVisible();
  await expect(page.getByPlaceholder("Search files and text…")).toHaveValue(picked);
  await page.locator(".cm-content").first().click(); // back in the file

  // the plugin's tool is there for a .py file, first in the bar, and runs
  await expect(bar.locator("button").first()).toHaveText("Run");
  await bar.getByRole("button", { name: "Run" }).click();
  await expect(page.locator('.status [data-cell="runtool:ran"]')).toHaveText("ran code/bar_demo.py");

  // not offered for another kind of file; and a note has no code bar at all
  await openFile("bar_demo.txt");
  const shown = page.locator('[data-testid="code-bar"]:visible'); // the tab in front (the other tab's bar is still in the page, hidden)
  await expect(shown.getByRole("button", { name: "Find", exact: true })).toBeVisible();
  await expect(shown.getByRole("button", { name: "Run" })).toHaveCount(0);
  await openFile("hubbard.md");
  await expect(page.locator(".editor-pane.is-md").getByTestId("code-bar")).toHaveCount(0);
});
