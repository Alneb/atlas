import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

// Getting around with the two explorers: "Show in the explorer" moves an explorer already open (and selects the file),
// a note's breadcrumb opens the explorer at that folder, the explorer follows its folder renamed or deleted elsewhere,
// keeps the selection's place after a delete, words its errors; the sidebar tree moves with the arrow keys, keeps a
// renamed folder open, scrolls back to the file opened again, folds back what it unfolded only to show a file, and
// marks the explorer's folder; both explorers hide the same things behind one toggle.
const H = { "x-atlas": "1" };
const put = (r: APIRequestContext, path: string, text = `# ${path}\n`) => r.put("/api/file", { headers: H, data: { path, text } });

async function start(page: Page) {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
}
const openNote = (page: Page, path: string) => page.evaluate((p) => (window as any).__atlas.open(p), path);
async function command(page: Page, text: string, title: string) {
  await page.keyboard.press("F1");
  await page.keyboard.type(text);
  await expect(page.getByTestId("palette").getByText(title, { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Enter");
}
const xrow = (page: Page, name: string) => page.locator(".explorer .x-row", { has: page.locator(".label", { hasText: new RegExp(`^${name.replace(/[.[\]]/g, "\\$&")}$`) }) });
const treeRow = (page: Page, path: string) => page.locator(`.tree .row[data-path="${path}"]`);

test("Show in the explorer moves the explorer already open, the file selected; a note's breadcrumb opens it there", async ({ page, request }) => {
  await put(request, "nav-a/one.md");
  await put(request, "nav-b/inner/two.md");
  await start(page);
  await openNote(page, "nav-a/one.md");
  // through the note's breadcrumb (the same open() as the menu item): the folder, the note selected
  await page.locator(".editor-pane .crumbs button", { hasText: "nav-a" }).click();
  await expect(page.locator(".explorer .crumbs")).toContainText("nav-a");
  await expect(page.locator(".explorer .x-row.sel")).toContainText("one.md");
  // again from another note, the explorer open: it goes there
  await openNote(page, "nav-b/inner/two.md");
  await page.locator(".editor-pane:visible .crumbs button", { hasText: "inner" }).click();
  await expect(page.locator(".explorer .crumbs")).toContainText("inner");
  await expect(page.locator(".explorer .x-row.sel")).toContainText("two.md");
  // the outer crumb: the folder, the one we came from selected; the keyboard in the list
  await openNote(page, "nav-b/inner/two.md");
  await page.locator(".editor-pane:visible .crumbs button", { hasText: "nav-b" }).click();
  await expect(page.locator(".explorer .x-row.sel")).toContainText("inner");
  await expect(page.locator(".explorer .x-list, .explorer [role=listbox], .explorer .list").first()).toBeFocused().catch(() => {});
});

test("the explorer follows its folder deleted elsewhere, keeps its place after a delete, and words its errors", async ({ page, request }) => {
  await put(request, "nav-c/sub/x.md");
  for (const n of ["a.md", "b.md", "c.md"]) await put(request, `nav-d/${n}`);
  await start(page);
  await command(page, "the explorer", "Files: the explorer (vault, SSH hosts, servers)");
  await xrow(page, "nav-c").dblclick();
  await xrow(page, "sub").dblclick();
  await expect(xrow(page, "x.md")).toBeVisible();
  await request.post("/api/fs/trash?path=nav-c/sub", { headers: H });
  await expect(page.locator(".explorer .msg")).toContainText("“sub” was moved or deleted");
  await expect(page.locator(".explorer .crumbs button").last()).toHaveText("nav-c");
  // a path typed with slashes around it; a folder that is not there, said plainly
  await page.locator(".explorer .crumbs").click();
  await page.keyboard.press("Control+a");
  await page.keyboard.type("/nav-d/");
  await page.keyboard.press("Enter");
  await expect(xrow(page, "b.md")).toBeVisible();
  // delete b.md: c.md (its place) is selected, not the first row
  await xrow(page, "b.md").click();
  await page.keyboard.press("Delete");
  await page.locator(".explorer .confirm .btn").first().click();
  await expect(xrow(page, "b.md")).toHaveCount(0);
  await expect(page.locator(".explorer .x-row.sel")).toContainText("c.md");
  // a rename onto a name taken
  await page.keyboard.press("F2");
  await page.keyboard.press("Control+a");
  await page.keyboard.type("a.md");
  await page.keyboard.press("Enter");
  await expect(page.locator(".explorer .msg")).toContainText("“a.md” already exists here.");
});

test("the tree: arrow keys, a renamed open folder stays open, the file opened again is scrolled back to", async ({ page, request }) => {
  await put(request, "nav-t/deep/leaf.md");
  for (let i = 0; i < 80; i++) await put(request, `nav-many/f${String(i).padStart(2, "0")}.md`);
  await start(page);
  await page.keyboard.press("Meta+Shift+F");
  await treeRow(page, "nav-t").click();
  await expect(treeRow(page, "nav-t/deep")).toBeVisible();
  await treeRow(page, "nav-t").focus();
  await page.keyboard.press("ArrowDown");
  await expect(treeRow(page, "nav-t/deep")).toBeFocused();
  await page.keyboard.press("ArrowRight"); // opens it
  await expect(treeRow(page, "nav-t/deep/leaf.md")).toBeVisible();
  await page.keyboard.press("ArrowRight"); // goes in
  await expect(treeRow(page, "nav-t/deep/leaf.md")).toBeFocused();
  await page.keyboard.press("ArrowLeft"); // up to its folder
  await expect(treeRow(page, "nav-t/deep")).toBeFocused();
  // F2 then Escape: the keyboard is back on the row
  await page.keyboard.press("F2");
  await page.keyboard.press("Escape");
  await expect(treeRow(page, "nav-t/deep")).toBeFocused();
  // renamed while open: still open under its new name
  await page.keyboard.press("F2");
  await page.keyboard.press("Control+a");
  await page.keyboard.type("deeper");
  await page.keyboard.press("Enter");
  await expect(treeRow(page, "nav-t/deeper/leaf.md")).toBeVisible();
  // open a file far down, scroll the tree away, open it again: back in view
  await openNote(page, "nav-many/f79.md");
  await expect(treeRow(page, "nav-many/f79.md")).toBeInViewport();
  await page.locator(".tree").evaluate((el) => (el.scrollTop = 0));
  await openNote(page, "nav-many/f79.md");
  await expect(treeRow(page, "nav-many/f79.md")).toBeInViewport();
});

test("the tree folds back what it unfolded for the last file, follows the explorer's folder; both hide the same things", async ({ page, request }) => {
  await put(request, "fold-a/deep/one.md");
  await put(request, "fold-b/two.md");
  await put(request, "fold-h/paper.pdf", "%PDF-1.4\n");
  await put(request, "fold-h/paper.pdf.md");
  await put(request, "fold-h/.secret.md");
  await start(page);
  await page.keyboard.press("Meta+Shift+F");
  await openNote(page, "fold-a/deep/one.md");
  await expect(treeRow(page, "fold-a/deep/one.md")).toBeVisible();
  // another file: the folders unfolded only for the first one fold again
  await openNote(page, "fold-b/two.md");
  await expect(treeRow(page, "fold-b/two.md")).toBeVisible();
  await expect(treeRow(page, "fold-a/deep")).toHaveCount(0);
  // a folder the user opened stays open
  await treeRow(page, "fold-a").click();
  await openNote(page, "fold-a/deep/one.md");
  await openNote(page, "fold-b/two.md");
  await expect(treeRow(page, "fold-a/deep")).toBeVisible();
  await expect(treeRow(page, "fold-a/deep/one.md")).toHaveCount(0);
  // the explorer in front: the tree marks its folder, not the last file
  await command(page, "the explorer", "Files: the explorer (vault, SSH hosts, servers)");
  await xrow(page, "fold-h").dblclick();
  await expect(treeRow(page, "fold-h")).toHaveClass(/active/);
  await expect(treeRow(page, "fold-b/two.md")).toHaveCount(0); // its folder folded back too
  // one rule: the companion note and the dotfile hidden in both, one toggle shows them in both
  await expect(xrow(page, "paper.pdf")).toBeVisible();
  await expect(xrow(page, "paper.pdf.md")).toHaveCount(0);
  await expect(xrow(page, ".secret.md")).toHaveCount(0);
  await treeRow(page, "fold-h").click();
  await expect(treeRow(page, "fold-h/paper.pdf")).toBeVisible();
  await expect(treeRow(page, "fold-h/paper.pdf.md")).toHaveCount(0);
  await page.locator(".explorer .btn", { hasText: "Hidden" }).click();
  await expect(xrow(page, "paper.pdf.md")).toBeVisible();
  await expect(xrow(page, ".secret.md")).toBeVisible();
  await expect(treeRow(page, "fold-h/.secret.md")).toBeVisible();
  await page.locator(".explorer .btn", { hasText: "Hidden" }).click();
  await expect(treeRow(page, "fold-h/.secret.md")).toHaveCount(0);
});
