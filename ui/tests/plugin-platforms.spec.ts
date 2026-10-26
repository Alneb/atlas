import { test, expect, type APIRequestContext } from "@playwright/test";

// A plugin's `[platforms]` (docs/guides/PLUGIN-API.md, "Platforms"): every platform shown on its row in Settings, and
// one that says no for this platform does not run here — the row says why.
const H = { "x-atlas": "1" };
const put = (r: APIRequestContext, path: string, text: string) => r.put("/api/file", { headers: H, data: { path, text } });
const TOML = (title: string, linux: string) => `title = "${title}"
version = "1.0.0"
phone = true

[platforms]
linux = ${linux}
windows = { support = "no", why = "needs a tool only Linux has" }
`;
const MAIN = (cell: string) => `export function register(api) { api.statusCell?.("${cell}", () => "${cell} ran"); }\n`;

test.beforeAll(async ({ request }) => {
  await put(request, ".atlas/plugins/plat-here/plugin.toml", TOML("Plat here", '"works"'));
  await put(request, ".atlas/plugins/plat-here/main.js", MAIN("here"));
  await put(request, ".atlas/plugins/plat-gone/plugin.toml", TOML("Plat gone", '{ support = "no", why = "made for another desk" }'));
  await put(request, ".atlas/plugins/plat-gone/main.js", MAIN("gone"));
});

test.afterAll(async ({ request }) => {
  for (const id of ["plat-here", "plat-gone"]) await request.post(`/api/fs/trash?path=${encodeURIComponent(`.atlas/plugins/${id}`)}`, { headers: H });
});

test("a plugin's row shows each platform; one that says no here does not run, and says why", async ({ page }, info) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("F1");
  await page.keyboard.type("Settings");
  await page.getByTestId("palette").getByText("Settings", { exact: true }).first().click();
  await page.getByRole("button", { name: /Plugins & automation/ }).first().click();

  const here = page.locator("li", { has: page.locator('[data-plugin-platforms="plat-here"]') });
  const chips = here.locator(".chip");
  await expect(chips).toHaveText(["✓Linux", "?macOS", "✕Windows", "✓Android", "?Server"]);
  await expect(chips.nth(2)).toHaveAttribute("title", "Windows: does not run — needs a tool only Linux has");
  await expect(here.locator(".err")).toHaveCount(0);

  const gone = page.locator("li", { has: page.locator('[data-plugin-platforms="plat-gone"]') });
  await expect(gone.locator(".err")).toContainText("Plat gone does not run on Linux: made for another desk");

  for (const theme of ["light", "dark"]) {
    await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
    await here.screenshot({ path: info.outputPath(`platforms-${theme}.png`) });
    await gone.screenshot({ path: info.outputPath(`platforms-no-${theme}.png`) });
  }
});
