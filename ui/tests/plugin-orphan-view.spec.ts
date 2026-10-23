import { test, expect } from "@playwright/test";

// A plugin's view whose plugin is gone (removed, or another vault's layout): closed, so no app tile stands at the
// top for a plugin that is not installed.
const H = { "x-atlas": "1" };
const MANIFEST = 'title = "Mailish"\nrail = true\nicon = "mail"\n';
const VIEW = "export default function mount(host) { host.innerHTML = '<p class=\"mailish\">inbox</p>'; }\n";

test("removing the plugin closes its open view and its tile", async ({ page, request }) => {
  await request.put("/api/file", { headers: H, data: { path: ".atlas/plugins/mailish/view.js", text: VIEW } });
  await request.put("/api/file", { headers: H, data: { path: ".atlas/plugins/mailish/plugin.toml", text: MANIFEST } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  const tile = page.getByTestId("apps").getByRole("button", { name: /Mailish/ });
  await expect(tile).toBeVisible();
  await tile.click();
  await expect(page.locator(".mailish")).toBeVisible();
  await request.post("/api/plugins/mailish/remove", { headers: H });
  await expect(page.locator(".mailish")).toHaveCount(0, { timeout: 10_000 });
  await expect(tile).toHaveCount(0);
});
