import { test, expect, type APIRequestContext } from "@playwright/test";
import { openFile } from "./open";

// Plugins v4, editor hooks (docs/refactor/REFACTOR-plugins-v4.md, 3.1): `atlas.editor.registerFence(name, render)`.
// A ```statblock fence is drawn by the plugin in live preview; without the plugin it is the code block
// it always was, and the plugin changing redraws it in place.
const H = { "x-atlas": "1" };
const put = (r: APIRequestContext, path: string, text: string) => r.put("/api/file", { headers: H, data: { path, text } });
const main = (word: string) => `export function register(atlas) {
  atlas.editor.registerFence("statblock", (host, fence) => {
    const stats = Object.fromEntries(fence.source.split("\\n").map((l) => l.split(":").map((x) => x.trim())));
    host.innerHTML = '<div class="stat"><b>' + stats.name + '</b> <span class="hp">${word} ' + stats.hp + '</span> <span class="in">' + fence.path + '</span></div>';
    fence.props().then((p) => { host.querySelector(".stat").dataset.campaign = String(p.campaign ?? ""); });
  });
  atlas.editor.registerFence("explodes", () => { throw new Error("no dice"); });
}\n`;
const NOTE = "---\ncampaign: Stormreach\n---\n# Goblin\n\n```statblock\nname: Goblin\nhp: 7\n```\n\n```explodes\nx\n```\n\n```python\nprint(1)\n```\n\nlast line\n";

test.beforeAll(async ({ request }) => {
  await put(request, ".atlas/plugins/ttrpg/plugin.toml", 'title = "TTRPG"\n');
  await put(request, "notes/goblin.md", NOTE);
});
test.afterAll(async ({ request }) => { await put(request, ".atlas/plugins/ttrpg/main.js", "export function register() {}\n"); });

test("a plugin draws a fenced block; other fences stay code; it follows the plugin's edits", async ({ page, request }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await openFile(page, "goblin.md");
  const note = page.locator(".cm-content");
  // no plugin code yet: the fence is a code block like any other
  await expect(note.locator("pre.hljs", { hasText: "hp: 7" })).toBeVisible();

  await put(request, ".atlas/plugins/ttrpg/main.js", main("HP"));
  const stat = note.locator(".fence-block .stat");
  await expect(stat.locator("b")).toHaveText("Goblin");
  await expect(stat.locator(".hp")).toHaveText("HP 7");
  await expect(stat.locator(".in")).toHaveText("notes/goblin.md");
  await expect(stat, "the note's properties reach the fence").toHaveAttribute("data-campaign", "Stormreach");
  await expect(note.locator("pre.hljs", { hasText: "hp: 7" }), "its source is hidden while drawn").toBeHidden();
  await expect(note.locator("pre.hljs", { hasText: "print(1)" }), "a fence nobody draws stays code").toBeVisible();
  await expect(note.locator('.fence-block[data-fence-name="explodes"] .view-error'), "a renderer that throws says so in place").toContainText("no dice");

  // the plugin is edited: the drawing changes in place, no reload of the note
  await put(request, ".atlas/plugins/ttrpg/main.js", main("Hit points"));
  await expect(stat.locator(".hp")).toHaveText("Hit points 7");
});
