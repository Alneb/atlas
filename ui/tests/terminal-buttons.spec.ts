import { test, expect } from "@playwright/test";
import { openFile } from "./open";

// A plugin's button on its own agent's terminal tabs (`atlas.terminal.button`, API 36; lib/terminal-buttons.svelte.ts):
// it gets the tab (its session, a way back to it). A page the plugin opens from there is a tab, not an app in the
// apps row: only a plugin with a launcher tile (`rail`) shows its page there (apps.svelte.ts `isApp`).
const H = { "x-atlas": "1" };
const MANIFEST = `title = "Button agent"\n\n[[agent]]\nid = "parrot"\ntitle = "Parrot"\ncommand = "cat"\nsend_selection = "ASK {path};"\n`;
const MAIN = `export function register(atlas) {
  if (!atlas.terminal.button) return;
  atlas.terminal.button({ id: "look", title: "Look at it", icon: "file-text", run: (tab) => {
    window.__shown = tab.show;
    atlas.openView(JSON.stringify({ tab: tab.session ?? "none" }), { title: "Parrot page" });
  } });
}
`;
const VIEW = "export default function mount(host, atlas) { const p = document.createElement('p'); p.className = 'parrot-page'; p.textContent = 'session ' + JSON.parse(atlas.arg).tab; host.append(p); }\n";

test.beforeAll(async ({ request }) => {
  await request.put("/api/file", { headers: H, data: { path: ".atlas/plugins/abutton/view.js", text: VIEW } });
  await request.put("/api/file", { headers: H, data: { path: ".atlas/plugins/abutton/main.js", text: MAIN } });
  await request.put("/api/file", { headers: H, data: { path: ".atlas/plugins/abutton/plugin.toml", text: MANIFEST } });
});
test.afterAll(async ({ request }) => { await request.post("/api/plugins/abutton/remove", { headers: H }); });

test("an agent plugin's button on its terminal tab gets the tab; the page it opens is a tab, not an app", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await openFile(page, "hubbard.md");
  await page.locator(".cm-content").click();
  await page.keyboard.press("Control+Alt+Enter"); // opens the first agent: this plugin's (its id sorts first)
  const term = page.locator('.term-pane[data-agent="abutton/parrot"]');
  await expect(term.locator(".xterm-rows")).toContainText("ASK notes/hubbard.md;", { timeout: 10_000 });
  const session = await term.getAttribute("data-agent-session");
  expect(session, "an agent tab has its own session").toMatch(/^[0-9a-f-]{36}$/);
  await term.hover();
  await term.getByRole("button", { name: "Look at it" }).click();
  await expect(page.locator(".parrot-page")).toHaveText(`session ${session}`);
  await expect(page.getByTestId("apps").getByRole("button", { name: /Parrot page|Button agent/ })).toHaveCount(0);
  await expect(page.getByTestId("sidebar").locator(".tab", { hasText: "Parrot page" })).toHaveCount(1);
  // the way back: the terminal tab in front again
  await page.evaluate(() => (window as unknown as { __shown: () => void }).__shown());
  await expect(term).toBeVisible();
});
