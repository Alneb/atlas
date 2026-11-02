import { test, expect, type APIRequestContext } from "@playwright/test";

// The Library is a built-in plugin (References, for a science vault): its button sits in the bar's bottom row with the
// other launchers and opens the Libraries page (the Catalog plugin's pane) at References; one switch — its id in
// `[plugins] off` — removes the button, the command, its shortcut and @-citations from the vault.
const H = { "x-atlas": "1" };
async function setOff(request: APIRequestContext, off: string[]) {
  const d = await (await request.get("/api/config", { headers: H })).json();
  d.config.plugins.off = off;
  expect((await request.put("/api/config", { headers: H, data: d.config })).ok()).toBeTruthy();
}
/** Whether a fresh window reopens the saved layout (the test vault starts every test clean: off). */
async function setRestore(request: APIRequestContext, on: boolean) {
  const d = await (await request.get("/api/config", { headers: H })).json();
  d.config.ui.restore_layout = on;
  expect((await request.put("/api/config", { headers: H, data: d.config })).ok()).toBeTruthy();
}
test.afterEach(async ({ request }) => {
  await setOff(request, []);
  await setRestore(request, false);
  await request.put("/api/file", { headers: H, data: { path: ".atlas/cache/layout.json", text: "null" } });
});

test("the Library is a plugin: an app at the top of the bar, gone when switched off", async ({ page, request }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  // the apps at the top of the bar: Home first, then the built-in plugins that are on
  const bar = page.getByTestId("sidebar").getByTestId("apps");
  const lib = bar.getByRole("button", { name: /^Library/ });
  await expect(lib).toHaveCount(1);
  const order = await bar.evaluate((el) => [...el.querySelectorAll("button")].map((n) => n.getAttribute("aria-label") ?? ""));
  expect(order.findIndex((l) => l.startsWith("Library"))).toBeGreaterThan(order.indexOf("Home"));

  await setOff(request, ["library"]);
  await expect(lib).toHaveCount(0);
  await page.getByText("Finish the GW notes.").click();
  await page.keyboard.press("Meta+Shift+l"); // its key does nothing while it is off
  await page.waitForTimeout(400);
  await expect(page.locator(`[data-testid=apps] .app.open[aria-label^="Library"]`)).toHaveCount(0);
  await page.keyboard.press("Meta+e");
  await page.keyboard.type("Library: references, then the vault's other libraries");
  // exact: the bar's last row offers to capture what was typed ("Capture “Library (papers)”"), which is not the command
  await expect(page.getByTestId("palette").getByText("Library: references, then the vault's other libraries", { exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");

  // Settings → Plugins lists it, with the same switch as a vault plugin
  await page.keyboard.press("Meta+,");
  await page.getByRole("navigation", { name: "Settings pages" }).getByRole("button", { name: /^Plugins( \d+)?$/ }).click();
  const sw = page.getByRole("switch", { name: "Plugin Library" });
  await expect(sw).toHaveAttribute("aria-checked", "false");
  await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", "true");
  await expect(lib).toHaveCount(1);
  await page.keyboard.press("Meta+Shift+l"); // on again, its key opens it
  await expect(page.locator(`[data-testid=apps] .app.open[aria-label^="Library"]`)).toHaveCount(1);
});

// The core's Library panes of older layouts — the References pane (`library`) and the Libraries page (`libraries`) — are
// the one Libraries page now, the Catalog plugin's pane: read from the layout file as that pane, one tile, not two.
test("an old layout's Library panes become the one Libraries page, the Catalog's pane", async ({ page, context, request }) => {
  await setRestore(request, true); // a new window reads the layout file only when the tabs are restored on start
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Meta+Shift+l");
  const layoutText = async () => {
    const r = await request.get(`/api/file?path=${encodeURIComponent(".atlas/cache/layout.json")}`, { headers: { "x-atlas": "1" } });
    return r.ok() ? (((await r.json()) as { text?: string }).text ?? "") : "";
  };
  await expect.poll(layoutText).toContain('"plugin:catalog"');
  // the same layout as an older Atlas wrote it: the page as the core's `libraries` pane, the old `library` beside it
  const saved = JSON.parse(await layoutText());
  const now = saved.panels["plugin:catalog"];
  delete saved.panels["plugin:catalog"];
  saved.panels.libraries = { ...now, id: "libraries", contentComponent: "libraries", title: "Library", params: { kind: "libraries", at: "references" } };
  saved.panels.library = { ...now, id: "library", contentComponent: "library", title: "Library", params: { kind: "library" } };
  const asOld = (n: { type: string; data: any }): void => {
    if (n.type !== "leaf") { n.data.forEach(asOld); return; }
    n.data.views = n.data.views.flatMap((v: string) => (v === "plugin:catalog" ? ["libraries", "library"] : [v]));
    if (n.data.activeView === "plugin:catalog") n.data.activeView = "libraries";
  };
  asOld(saved.grid.root);
  await request.put("/api/file", { headers: { "x-atlas": "1" }, data: { path: ".atlas/cache/layout.json", text: JSON.stringify(saved) } });
  await page.close();
  const fresh = await context.newPage(); // a new window reads the file (a reload keeps its own tabs)
  await fresh.goto("/");
  await fresh.getByText("Finish the GW notes.").waitFor();
  const apps = fresh.getByTestId("sidebar").getByTestId("apps");
  await expect(apps.locator(".app.open")).not.toHaveCount(0);
  const labels = await apps.evaluate((el) => [...el.querySelectorAll("button")].map((n) => n.getAttribute("aria-label") ?? ""));
  expect(labels.filter((l) => /^Librar/.test(l))).toEqual(["Library"]);
  // the page itself, at References (Home is the first screen after a restore: the Library's tile brings its tab forward)
  await apps.getByRole("button", { name: /^Library/ }).click();
  await expect(fresh.locator(".libraries .library[data-source=\"references\"] .row")).not.toHaveCount(0);
});
