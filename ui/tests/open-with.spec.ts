import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { shownName } from "../src/lib/paths";

// Open with… (docs/design/MALLEABLE.md R2): one file, many views — Atlas's own and plugin panes that declare
// `opens`; "always" makes it the default for the extension ([files] open_with).
const H = { "x-atlas": "1" };
const put = (r: APIRequestContext, path: string, text: string) => r.put("/api/file", { headers: H, data: { path, text } });
const cfg = async (r: APIRequestContext) => (await (await r.get("/api/config", { headers: H })).json()).config;

async function openFile(page: Page, name: string) {
  await page.keyboard.press("Control+p");
  await page.keyboard.type(name);
  await expect(page.getByTestId("palette").getByText(shownName(name), { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Enter");
}
async function choose(page: Page, title: string) {
  const pal = page.getByTestId("palette");
  // the choices are built when the picker opens: retry until a just-saved default is reflected
  await expect(async () => {
    if (await pal.isVisible()) await page.keyboard.press("Escape");
    await page.keyboard.press("Control+Alt+o");
    await page.keyboard.type(title);
    await expect(pal.getByText(title, { exact: true }).first()).toBeVisible({ timeout: 800 });
  }).toPass({ timeout: 8000 });
  await pal.getByText(title, { exact: true }).first().click();
}

test("a file opens in another view, once or always; plugins offer theirs", async ({ page, request }) => {
  await put(request, "notes/ow-data.tsv", "x\ty\n1\t2\n3\t4\n");
  await put(request, ".atlas/plugins/tsvpeek/plugin.toml", 'title = "Peek"\nopens = ["*.tsv"]\n');
  await put(request, ".atlas/plugins/tsvpeek/view.js", "export default (host, atlas) => { host.innerHTML = '<p class=\"peek\">peek ' + atlas.path + '</p>'; };\n");
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await openFile(page, "ow-data.tsv");
  await expect(page.locator(".table-pane")).toBeVisible(); // the usual view
  // once, in the text editor
  await choose(page, "Text editor");
  await expect(page.locator(".cm-content", { hasText: "x\ty" }).first()).toBeVisible();
  // a plugin's pane, which gets the file
  await choose(page, "Peek");
  await expect(page.locator(".peek")).toHaveText("peek notes/ow-data.tsv");
  // always: the extension's default changes, and a plain open follows it
  await choose(page, "Always open .tsv with Text editor");
  await expect.poll(async () => (await cfg(request)).files.open_with.tsv).toBe("editor");
  // back to the usual view
  await choose(page, "Open .tsv with Atlas's usual view again");
  await expect.poll(async () => (await cfg(request)).files.open_with.tsv).toBeUndefined();
  await expect(page.locator(".table-pane").first()).toBeVisible();
});
