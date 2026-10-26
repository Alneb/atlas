import { test, expect, type Page } from "@playwright/test";
import { shownName } from "../src/lib/paths";

// The shell as files, second half (docs/guides/SHELL.md): bookmarks and pins live in `.atlas/bookmarks.yaml`,
// and the sidebar is a page of blocks (`.atlas/sidebar.page`) that can be rearranged like any page.
const FILES = { bookmarks: ".atlas/bookmarks.yaml", sidebar: ".atlas/sidebar.page" };
const side = (page: Page) => page.getByTestId("sidebar");
const fileText = (page: Page, path: string) => page.request.get(`/api/file?path=${path}`, { headers: { "x-atlas": "1" } }).then((r) => r.json()).then((j) => String(j.text ?? ""));
const put = (page: Page, path: string, text: string) => page.request.put("/api/file", { headers: { "x-atlas": "1" }, data: { path, text } });

async function run(page: Page, command: string) {
  await page.keyboard.press("Meta+e");
  const palette = page.getByTestId("palette");
  await expect(palette.getByRole("textbox")).toBeFocused();
  await page.keyboard.type(command);
  await palette.getByText(command, { exact: false }).first().click();
}
async function openFile(page: Page, q: string, name: string) {
  await page.keyboard.press("Control+p");
  const palette = page.getByTestId("palette");
  await expect(palette.getByRole("textbox")).toBeFocused();
  await page.keyboard.type(q);
  await expect(palette.getByText(shownName(name), { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator(".cm-editor.cm-focused")).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await put(page, FILES.bookmarks, "# mine\npins: []\nbookmarks: []\n");
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
});

test("bookmarks: a tab, a saved search and a pin go to the bookmarks file; each bookmark is a command", async ({ page }) => {
  await openFile(page, "hubbard", "hubbard.md");

  // bookmark the tab: it appears in the sidebar and in the file, as a plain path
  await page.keyboard.press("Control+Alt+b");
  const palette = page.getByTestId("palette");
  await palette.getByText("Bookmark this tab").click();
  const list = page.getByTestId("bookmarks");
  await expect(list.locator(".bm", { hasText: "hubbard" })).toBeVisible();
  await expect.poll(() => fileText(page, FILES.bookmarks)).toContain("hubbard.md");

  // a typed text is kept as a saved search
  await page.keyboard.press("Control+Alt+b");
  await expect(palette.getByRole("textbox")).toBeFocused();
  await page.keyboard.type("self-energy");
  await palette.getByText("Save the search").click();
  await expect(list.locator(".bm", { hasText: "Search: self-energy" })).toBeVisible();

  // pin the tab: the tile is in the same file, and the comment at its top is still there
  await side(page).locator(".tab", { hasText: "hubbard" }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Pin" }).click();
  await expect(page.getByTestId("pins").locator(".pin", { hasText: "hubbard" })).toBeVisible();
  await expect.poll(() => fileText(page, FILES.bookmarks)).toMatch(/pins:\s*\n?\s*-? ?\[?.*hubbard\.md/);
  const text = await fileText(page, FILES.bookmarks);
  expect(text).toContain("# mine");
  expect(text).toContain("search: self-energy");

  // a reload reads them back from the file; the bookmark's own command opens it
  await page.keyboard.press("Control+w");
  await page.reload();
  await expect(page.getByTestId("pins").locator(".pin.resting", { hasText: "hubbard" })).toBeVisible();
  await run(page, "Bookmark: hubbard");
  await expect(page.getByTestId("pins").locator(".pin.active", { hasText: "hubbard" })).toBeVisible();

  // edited as text: the sidebar follows the file
  await put(page, FILES.bookmarks, "pins: []\nbookmarks:\n  - {command: ui.settings, title: Preferences}\n");
  await expect(list.locator(".bm")).toHaveText(["Preferences"]);
  await list.locator(".bm").click();
  await expect(side(page).locator(".tab.active", { hasText: "Settings" })).toBeVisible();
});

test("the sidebar is a page: its file decides the blocks, a toolbar's buttons are command ids", async ({ page }) => {
  // the default (2026-10-17): the apps (Home…) on top with the pins, then the tabs; ONE row at the bottom with
  // settings and general actions only — the side tools are the row on top of the side panel
  await expect(side(page).locator(".side-toolbar")).toHaveCount(1);
  const foot = side(page).locator(".sb-foot .side-toolbar");
  for (const name of ["New…", "Commands & shortcuts", "Settings"]) await expect(foot.getByRole("button", { name, exact: true }), name).toBeVisible();
  for (const name of ["Home", "Files", "Search"]) await expect(foot.getByRole("button", { name, exact: true }), name).toHaveCount(0);
  await expect(side(page).getByTestId("apps").getByRole("button", { name: "Home", exact: true })).toBeVisible();

  // the command writes the default file and opens it as a page to arrange
  await run(page, "Sidebar: arrange its blocks");
  // exact: until the file is written the page is empty and also offers "Arrange it"
  await expect(page.getByRole("button", { name: "Arrange", exact: true })).toBeVisible();
  await expect.poll(() => fileText(page, FILES.sidebar)).toContain("view: toolbar");

  // the file as text: fewer buttons, one of them dressed, and an outline under the tabs
  await put(page, FILES.sidebar, "rows:\n  - [{view: toolbar, items: [ui.files, {command: ui.graph, title: Links}]}]\n  - [tabs]\n  - [outline]\n");
  const top = side(page).locator(".side-toolbar").first();
  await expect(top.getByRole("button")).toHaveCount(2);
  await expect(top.getByRole("button", { name: "Links" })).toBeVisible();
  await expect(side(page).locator(".side-toolbar")).toHaveCount(1);
  await expect(side(page).locator(".sb-block.guest .atlas-pane-outline")).toBeVisible();
  await top.getByRole("button", { name: "Links" }).click();
  await expect(side(page).locator(".tab.active", { hasText: "Graph" })).toBeVisible();

  // a broken file keeps the last good sidebar and says what is wrong
  await put(page, FILES.sidebar, "rows:\n  - [{nope: 1}]\n");
  await expect(side(page).locator(".sb-error")).toContainText("sidebar.page");
  await expect(top.getByRole("button", { name: "Links" })).toBeVisible();

  // back to the default for the tests that follow
  await put(page, FILES.sidebar, (await import("node:fs")).readFileSync("src/lib/sidebar.svelte.ts", "utf8").match(/DEFAULT_SIDEBAR = `([\s\S]*?)`;/)![1]);
  await expect(side(page).locator(".sb-foot .side-toolbar")).toHaveCount(1);
});

test("a server older than /api/exists: the bookmarks file is still found and read, not taken for missing", async ({ page }) => {
  // the phone app shows its own interface on a server's vault, which may be older (vault-files.ts falls back to listings)
  await page.route("**/api/exists?**", (r) => r.fulfill({ status: 404, json: { error: "/api/exists" } }));
  await put(page, FILES.bookmarks, "pins: []\nbookmarks:\n  - {command: ui.settings, title: Preferences}\n");
  await page.reload();
  await expect(page.getByTestId("bookmarks").locator(".bm")).toHaveText(["Preferences"]);
});
