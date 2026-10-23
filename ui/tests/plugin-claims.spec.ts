import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { shownName } from "../src/lib/paths";

// The editor contract and embeds (docs/refactor/REFACTOR-core-to-plugins.md, A1 and A2; docs/guides/PLUGIN-API.md):
// a plugin `claims` a file type, so a click in the file tree opens it in its pane — unless the vault's `[files] open_with`
// says otherwise, and never while the plugin is off; the pane gets the link's anchor, says it has unsaved changes and
// saves on Ctrl+S and on close. `atlas.registerEmbed` draws `![[file.ext]]` in a note.
const H = { "x-atlas": "1" };
const put = (r: APIRequestContext, path: string, text: string) => r.put("/api/file", { headers: H, data: { path, text } });
const read = async (r: APIRequestContext, path: string) => (await (await r.get(`/api/file?path=${encodeURIComponent(path)}`, { headers: H })).json()).text as string;
async function config(r: APIRequestContext, change: (c: { files: { open_with: Record<string, string> }; plugins: { off: string[] } }) => void) {
  const d = await (await r.get("/api/config", { headers: H })).json();
  change(d.config);
  expect((await r.put("/api/config", { headers: H, data: d.config })).ok()).toBeTruthy();
}

const VIEW = `export default (host, atlas) => {
  host.innerHTML = '<div class="lorem"><p class="where"></p><textarea></textarea></div>';
  const where = host.querySelector(".where"), ta = host.querySelector("textarea");
  const say = (a) => { where.textContent = atlas.path + " @" + (a ?? ""); };
  say(atlas.anchor);
  void atlas.readText(atlas.path).then((t) => { ta.value = t; });
  ta.oninput = () => atlas.pane.setDirty(true);
  atlas.pane.onSave(async () => { await atlas.writeText(atlas.path, ta.value); });
  atlas.pane.onAnchor(say);
};
`;
const MAIN = (word: string) => `export function register(atlas) {
  atlas.registerEmbed("lorem", (host, e) => {
    host.innerHTML = '<span class="lorem-embed">${word} ' + e.path + ' #' + e.anchor + ' ' + e.options.join(",") + ' ' + (e.width ?? "") + '</span>';
  });
}
`;

test.describe.configure({ mode: "serial" }); // one plugin, switched off and on by the tests in turn

test.beforeAll(async ({ request }) => {
  await put(request, ".atlas/plugins/lorem/plugin.toml", 'title = "Lorem"\nclaims = ["*.lorem"]\n');
  await put(request, ".atlas/plugins/lorem/view.js", VIEW);
  await put(request, ".atlas/plugins/lorem/main.js", MAIN("drawn"));
  await put(request, "pe-book.lorem", "first words\n");
  await put(request, "notes/pe-links.md", "# Links\n\nGo [[pe-book.lorem#Chapter 3|to chapter three]].\n\n![[pe-book.lorem#Part 2|300|center]]\n\nafter\n");
});
test.afterAll(async ({ request }) => {
  await config(request, (c) => { delete c.files.open_with.lorem; c.plugins.off = c.plugins.off.filter((x) => x !== "lorem"); });
  await put(request, ".atlas/plugins/lorem/main.js", "export function register() {}\n");
  await put(request, ".atlas/plugins/lorem-alt/plugin.toml", 'title = "Other"\n'); // offers nothing any more
});

async function clickInTree(page: Page, path: string) {
  await page.keyboard.press("Meta+Shift+f");
  const row = page.locator(`.row[data-path="${path}"]`);
  await expect(row).toBeVisible();
  await row.click();
}

test("a plugin's claim opens its files on a click; dirty, Ctrl+S and closing save; a link's anchor reaches it", async ({ page, request }) => {
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push(e.message));
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await clickInTree(page, "pe-book.lorem");
  const pane = page.locator(".lorem");
  await expect(pane.locator(".where")).toHaveText("pe-book.lorem @");
  const ta = pane.locator("textarea");
  await expect(ta).toHaveValue("first words\n");

  // unsaved: the tab's dot; Ctrl+S saves through the plugin's hook and clears it
  const tab = page.locator(".atlas-tab", { hasText: shownName("pe-book.lorem") });
  await ta.fill("second words\n");
  await expect(tab).toHaveClass(/is-dirty/);
  await ta.press("Control+s");
  await expect.poll(() => read(request, "pe-book.lorem")).toBe("second words\n");
  await expect(tab).not.toHaveClass(/is-dirty/);

  // closing with unsaved changes saves first, as the core's editors do
  await ta.fill("third words\n");
  await expect(tab).toHaveClass(/is-dirty/);
  await ta.press("Control+w"); // closeActive → closePanel, as the tab's ×
  await expect(pane).toHaveCount(0);
  await expect.poll(() => read(request, "pe-book.lorem")).toBe("third words\n");

  // a link with an anchor: a new pane gets it as atlas.anchor; one already open hears it through pane.onAnchor
  await page.keyboard.press("Control+p");
  await page.keyboard.type("pe-links.md");
  await expect(page.getByTestId("palette").getByText("pe-links", { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Enter");
  await page.locator(".cm-content .cm-hmd-internal-link", { hasText: "to chapter three" }).first().click({ modifiers: ["Control"] });
  await expect(pane.locator(".where")).toHaveText("pe-book.lorem @Chapter 3");
  expect(errs).toEqual([]);
});

test("the vault's open_with beats a plugin's claim; a plugin switched off claims nothing", async ({ page, request }) => {
  // the user's "Always open .lorem with Other" (only an opener that takes the file can be chosen: another plugin's)
  await put(request, ".atlas/plugins/lorem-alt/plugin.toml", 'title = "Other"\nopens = ["*.lorem"]\n');
  await put(request, ".atlas/plugins/lorem-alt/view.js", "export default (host, atlas) => { host.innerHTML = '<p class=\"alt\">other ' + atlas.path + '</p>'; };\n");
  await config(request, (c) => { c.files.open_with.lorem = "plugin:lorem-alt"; });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await clickInTree(page, "pe-book.lorem");
  await expect(page.locator(".alt")).toHaveText("other pe-book.lorem");
  await expect(page.locator(".lorem")).toHaveCount(0);

  await config(request, (c) => { delete c.files.open_with.lorem; c.plugins.off = [...c.plugins.off, "lorem"]; });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await clickInTree(page, "pe-book.lorem");
  await expect(page.locator(".cm-content:visible", { hasText: "words" }).first()).toBeVisible();
  await expect(page.locator(".lorem")).toHaveCount(0);
  await config(request, (c) => { c.plugins.off = c.plugins.off.filter((x) => x !== "lorem"); });
});

test("an embed a plugin registers draws ![[file]] with its anchor and options, and follows the plugin's edits", async ({ page, request }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Control+p");
  await page.keyboard.type("pe-links.md");
  await expect(page.getByTestId("palette").getByText("pe-links", { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Enter");
  const embed = page.locator(".cm-content .lorem-embed");
  await expect(embed).toHaveText("drawn pe-book.lorem #Part 2 300,center 300");
  await put(request, ".atlas/plugins/lorem/main.js", MAIN("redrawn"));
  await expect(embed).toHaveText("redrawn pe-book.lorem #Part 2 300,center 300");
});
