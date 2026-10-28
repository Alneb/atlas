import { test, expect, type APIRequestContext } from "@playwright/test";

// The apps at the top of the left bar: one vault list hides and orders every tile, built-in or plugin
// (`[ui] apps_hidden` / `apps_order`), from the tile's right-click and from Settings → Appearance.
const H = { "x-atlas": "1" };
const put = (request: APIRequestContext, path: string, text: string) => request.put("/api/file", { headers: H, data: { path, text } });
const cfg = async (request: APIRequestContext) => (await (await request.get("/api/config", { headers: H })).json()).config;

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ request }) => {
  await put(request, ".atlas/plugins/appdemo/plugin.toml", 'title = "App demo"\nrail = true\nicon = "chart"\n');
  await put(request, ".atlas/plugins/appdemo/view.js", 'export default function mount(host) { host.innerHTML = "<p class=appdemo>demo</p>"; }\n');
});

// the config is shared by every spec of the run: leave the two lists as they were
test.afterAll(async ({ request }) => {
  const c = await cfg(request);
  c.ui.apps_hidden = c.ui.apps_hidden.filter((k: string) => k !== "appdemo");
  c.ui.apps_order = [];
  await request.put("/api/config", { headers: H, data: c });
});

test("a tile is moved and hidden from its right-click, and shown again from Settings", async ({ page, request }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  const apps = page.getByTestId("apps");
  const tile = apps.locator('[data-app-id="plugin:appdemo"]');
  await expect(tile).toBeVisible();
  await expect(apps.locator(".app").first()).toHaveAttribute("aria-label", "Home");
  await expect(apps.locator('.app[aria-label="Home"] svg')).toBeVisible(); // Home has its own icon, not a calendar

  // Move earlier: one place towards Home, and the whole order is kept in the vault
  const before = await apps.locator(".app").evaluateAll((bs) => bs.map((b) => b.getAttribute("data-app-id")));
  await tile.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Move earlier" }).click();
  await expect.poll(async () => apps.locator(".app").evaluateAll((bs) => bs.map((b) => b.getAttribute("data-app-id")))).toEqual(
    [...before.slice(0, before.indexOf("plugin:appdemo") - 1), "plugin:appdemo", before[before.indexOf("plugin:appdemo") - 1], ...before.slice(before.indexOf("plugin:appdemo") + 1)]);
  expect((await cfg(request)).ui.apps_order).toContain("appdemo");

  // Hide: gone from the bar, still a command
  await tile.click({ button: "right" });
  await page.getByRole("menuitem", { name: /Hide App demo from the bar/ }).click();
  await expect(tile).toHaveCount(0);
  await expect.poll(async () => (await cfg(request)).ui.apps_hidden).toContain("appdemo");

  // Settings → Appearance lists it, switched off; switching it on brings the tile back
  await page.keyboard.press("Meta+,");
  await page.getByRole("navigation", { name: "Settings pages" }).getByRole("button", { name: "Appearance" }).click();
  const show = page.getByRole("checkbox", { name: "Show App demo" });
  await expect(show).not.toBeChecked();
  await show.check();
  await expect(tile).toBeVisible();
  await expect.poll(async () => (await cfg(request)).ui.apps_hidden).not.toContain("appdemo");
});
