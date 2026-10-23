import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

// A meta plugin and its subplugins (docs/refactor/REFACTOR-catalog.md): a subplugin `requires` the meta plugin and hands it its
// `[contributes.<meta>]` table through the core (contributing alone is optional: a service's own plugin keeps working), and is not loaded while the
// meta plugin is off — Settings says why instead of the subplugin failing on its own.
const H = { "x-atlas": "1" };
const nav = (page: Page) => page.getByRole("navigation", { name: "Settings pages" });

async function setOff(request: APIRequestContext, off: string[]) {
  const d = await (await request.get("/api/config", { headers: H })).json();
  d.config.plugins.off = off;
  expect((await request.put("/api/config", { headers: H, data: d.config })).ok()).toBeTruthy();
}
const put = (request: APIRequestContext, path: string, text: string) => request.put("/api/file", { headers: H, data: { path, text } });

test.afterEach(async ({ request }) => { await setOff(request, []); });

test("a subplugin contributes to its meta plugin and is not loaded while the meta plugin is off", async ({ page, request }) => {
  await put(request, ".atlas/plugins/meta/plugin.toml", 'title = "Meta"\n');
  await put(request, ".atlas/plugins/meta-sub/plugin.toml", 'title = "Meta Sub"\nicon = "table"\nrail = true\nrequires = ["meta"]\n[contributes.meta]\nkinds = ["thing"]\n');
  await put(request, ".atlas/plugins/meta-sub/view.js", "export default (host) => { host.textContent = 'sub'; };\n");

  const c = await (await request.get("/api/plugins/meta/contributions", { headers: H })).json();
  expect(c).toEqual({ "meta-sub": { kinds: ["thing"] } });

  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  const rail = page.getByRole("button", { name: "Meta Sub", exact: true });
  await expect(rail).toBeVisible();

  await setOff(request, ["meta"]);
  await expect(rail).toHaveCount(0);
  expect(await (await request.get("/api/plugins/meta/contributions", { headers: H })).json()).toEqual({});

  await page.keyboard.press("Meta+,");
  await nav(page).getByRole("button", { name: "Plugins & automation" }).click();
  await expect(page.getByText("Not loaded — needs meta: Meta is switched off")).toBeVisible();
  await page.getByRole("switch", { name: "Plugin Meta", exact: true }).click();
  await expect(rail).toBeVisible();
});
