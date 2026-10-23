import { test, expect, type APIRequestContext } from "@playwright/test";

// Plugins v4, shell hooks: `atlas.shell.sideTool({ id, title, icon, mount })` — a plugin's tool in
// the side panel, beside Files / Search / Outline / Git, in both homes of the panel.
const H = { "x-atlas": "1" };
const put = (r: APIRequestContext, path: string, text: string) => r.put("/api/file", { headers: H, data: { path, text } });
const MAIN = `export function register(atlas) {
  atlas.shell.sideTool({ id: "party", title: "Party", icon: "table", mount: (host) => { host.innerHTML = '<p class="party-tool">Mira, Brok</p>'; } });
}\n`;

test.beforeAll(async ({ request }) => {
  await put(request, ".atlas/plugins/sidey/plugin.toml", 'title = "Sidey"\n');
  await put(request, ".atlas/plugins/sidey/main.js", MAIN);
});
test.afterAll(async ({ request }) => { await put(request, ".atlas/plugins/sidey/main.js", "export function register() {}\n"); });

test("a plugin's tool opens in the side column, and in the left bar when the panel lives there", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  const run = async (title: string) => { await page.keyboard.press("F1"); await page.keyboard.type(title); await page.keyboard.press("Enter"); };

  // beside the editors (the default): shown in the side column, its button lit in the column's row of tools
  await run("Side panel: Party");
  await expect(page.locator(".party-tool")).toHaveText("Mira, Brok");
  await expect(page.getByTestId("side-head").getByRole("tab", { name: "Party" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("sidebar").locator(".tab", { hasText: "Party" }), "a tool is not a tab").toHaveCount(0);

  // moved into the left bar: its button sits with the four built-in tools and shows it
  await run("Move side panel");
  const panel = page.getByTestId("side-panel");
  await expect(panel.getByRole("tab", { name: "Party" })).toHaveAttribute("aria-selected", "true");
  await expect(panel.locator(".party-tool")).toHaveText("Mira, Brok");
  await panel.getByRole("tab", { name: "Files" }).click();
  await expect(panel.locator(".party-tool")).toBeHidden();
  await panel.getByRole("tab", { name: "Party" }).click();
  await expect(panel.locator(".party-tool")).toBeVisible();

  // and back, leaving the shared vault's setting as it was
  await run("Move side panel");
  await expect(panel).toHaveCount(0);
  await expect(page.locator(".party-tool")).toHaveText("Mira, Brok");
});
