import { test, expect, type APIRequestContext } from "@playwright/test";

// Plugins v4, shell hooks (docs/refactor/REFACTOR-plugins-v4.md, 3.2): `atlas.shell.menu(where, fn)` adds rows
// to the app's right-click menus, after the app's own; a builder that throws loses only its rows.
// `atlas.shell.statusItem` puts a cell in the status bar.
const H = { "x-atlas": "1" };
const put = (r: APIRequestContext, path: string, text: string) => r.put("/api/file", { headers: H, data: { path, text } });
const MAIN = `export function register(atlas) {
  atlas.shell.menu("tab", (t) => t.path ? [{ label: "Demo: say the path", icon: "link", detail: "from a plugin", run: () => atlas.toast("tab " + t.path) }] : []);
  atlas.shell.menu("editor", (t) => [{ label: "Demo: selection", run: () => atlas.toast("selected [" + t.selection + "] in " + t.path) }]);
  atlas.shell.menu("file", () => { throw new Error("broken builder"); });
  atlas.shell.menu("file", (t) => [{ label: t.dir ? "Demo: a folder" : "Demo: a file", run: () => atlas.toast("file " + t.path) }]);
  atlas.shell.menu("tab", () => [{ label: "Demo: breaks", run: () => { throw new Error("boom in a row"); } }]);
  let n = 0;
  const cell = atlas.shell.statusItem({ id: "count", text: "clicks 0", title: "a plugin's cell", run: () => cell.set("clicks " + ++n) });
}\n`;

test.beforeAll(async ({ request }) => {
  await put(request, ".atlas/plugins/menus/plugin.toml", 'title = "Menus"\n');
  await put(request, ".atlas/plugins/menus/main.js", MAIN);
});
// the vault is shared by the specs: leave no rows behind
test.afterAll(async ({ request }) => { await put(request, ".atlas/plugins/menus/main.js", "export function register() {}\n"); });

test("a plugin's rows in the tab, editor and file menus, and its cell in the status bar", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Control+p");
  await page.keyboard.type("journal.md");
  await expect(page.getByTestId("palette").getByText("journal", { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Enter");
  const menu = page.getByRole("menu");

  // tab: after the app's rows, with its icon and second line
  const tab = page.getByTestId("sidebar").locator(".tab", { hasText: "journal" });
  await tab.click({ button: "right" });
  const row = menu.locator('[data-label="Demo: say the path"]');
  await expect(row).toContainText("from a plugin");
  await expect(row.locator("svg")).toHaveCount(1);
  expect(await menu.locator("button").last().getAttribute("data-label"), "plugin rows come last").toBe("Demo: breaks");
  await row.click();
  await expect(page.getByText(/tab .*journal\.md/)).toBeVisible();

  // a row that throws: nothing else breaks, and the plugin's log has it
  await tab.click({ button: "right" });
  await menu.locator('[data-label="Demo: breaks"]').click();
  await expect(menu).toBeHidden();

  // editor: the target carries the file and the selection
  await page.locator(".cm-content").click();
  await page.locator(".cm-line").first().click({ button: "right" });
  await expect(menu.locator('[data-label="Copy"]')).toBeVisible();
  await menu.locator('[data-label="Demo: selection"]').click();
  await expect(page.getByText(/selected \[\] in .*journal\.md/)).toBeVisible();

  // the status bar: a cell that is a button and changes its own text
  const cell = page.locator('.status [data-cell="menus:count"]');
  await expect(cell).toHaveText("clicks 0");
  await cell.click();
  await expect(cell).toHaveText("clicks 1");

  // files: one builder throws, the other's row is still there, and so are the app's
  await page.keyboard.press("Meta+Shift+f"); // the side panel's files
  await page.locator('.row[data-path$="journal.md"]').first().click({ button: "right" });
  await expect(menu.locator('[data-label="Rename…"]')).toBeVisible();
  await expect(menu.locator('[data-label="Demo: a file"]')).toBeVisible();
  await page.keyboard.press("Escape");

  // Settings → Plugins lists what went wrong in this plugin, and only there
  await page.keyboard.press("F1");
  await page.keyboard.type("Settings");
  await page.getByTestId("palette").getByText("Settings", { exact: true }).first().click();
  await page.getByRole("button", { name: /Plugins & automation/ }).first().click();
  // the list counts them; the plugin's own page lists them
  await page.getByRole("button", { name: "2 problems since Atlas started" }).click();
  const log = page.locator('[data-plugin-log="menus"]');
  await expect(log.locator("summary")).toHaveText("2 problems since Atlas started");
  await log.locator("summary").click();
  await expect(log).toContainText("boom in a row");
  await expect(log).toContainText("broken builder");
});
