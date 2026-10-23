import { test, expect, type APIRequestContext } from "@playwright/test";

// Plugins' error paths, as the user meets them (roadmap 9.1): a manifest with a typo, a plugin that
// needs a newer Atlas, a main.js that throws — each listed in Settings with the reason, none loaded,
// and the others unharmed.
const H = { "x-atlas": "1" };
const put = (r: APIRequestContext, path: string, text: string) => r.put("/api/file", { headers: H, data: { path, text } });

test.beforeAll(async ({ request }) => {
  await put(request, ".atlas/plugins/typo/plugin.toml", 'title = "Typo"\ntitel = "oops"\n');
  await put(request, ".atlas/plugins/future/plugin.toml", 'title = "Future"\nneeds = ">=99.0"\n');
  await put(request, ".atlas/plugins/future/main.js", 'export function register(atlas) { atlas.shell.statusItem({ id: "x", text: "future ran" }); }\n');
  await put(request, ".atlas/plugins/throws/plugin.toml", 'title = "Throws"\n');
  await put(request, ".atlas/plugins/throws/main.js", 'export function register() { throw new Error("broken on purpose"); }\n');
});
test.afterAll(async ({ request }) => {
  for (const id of ["typo", "future", "throws"]) await request.post(`/api/plugins/${id}/remove`, { headers: H });
});

test("a broken manifest, a plugin for a newer Atlas and a throwing main.js are each named in Settings, and nothing of them runs", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await expect(page.locator('.status [data-cell="future:x"]'), "the plugin for a newer Atlas did not run").toHaveCount(0);
  await page.keyboard.press("Meta+,");
  await page.getByRole("button", { name: /^Plugins & automation/ }).first().click();
  const row = (title: string) => page.locator("li", { has: page.locator("b", { hasText: new RegExp(`^${title}$`) }) });
  await expect(row("typo")).toContainText("titel");
  await expect(row("Future")).toContainText("needs Atlas 99.0");
  await expect(row("Throws")).toContainText("broken on purpose");
  // the switch of a plugin that cannot load is not offered
  await expect(page.getByRole("switch", { name: "Plugin typo" })).toBeDisabled();
});
