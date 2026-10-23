import { test, expect, type APIRequestContext } from "@playwright/test";

// "i would like them separate considering this library plugin is only for science": the Library is a
// built-in plugin. Its button sits in the bar's bottom row with the other launchers, and one switch — its id in
// `[plugins] off` — removes the button, the command, its shortcut and @-citations from the vault.
const H = { "x-atlas": "1" };
async function setOff(request: APIRequestContext, off: string[]) {
  const d = await (await request.get("/api/config", { headers: H })).json();
  d.config.plugins.off = off;
  expect((await request.put("/api/config", { headers: H, data: d.config })).ok()).toBeTruthy();
}
test.afterEach(async ({ request }) => { await setOff(request, []); });

test("the Library is a plugin: an app at the top of the bar, gone when switched off", async ({ page, request }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  // the apps at the top of the bar (2026-10-17): Home first, then the built-in plugins that are on
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
  await page.getByRole("navigation", { name: "Settings pages" }).getByRole("button", { name: /^Plugins & automation/ }).click();
  const sw = page.getByRole("switch", { name: "Plugin Library" });
  await expect(sw).toHaveAttribute("aria-checked", "false");
  await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", "true");
  await expect(lib).toHaveCount(1);
  await page.keyboard.press("Meta+Shift+l"); // on again, its key opens it
  await expect(page.locator(`[data-testid=apps] .app.open[aria-label^="Library"]`)).toHaveCount(1);
});

// "the old references is still there" (2026-10-21): a layout saved with the old References pane (`library`) beside the
// Library page (`libraries`) showed two tiles; the old one is folded into the page when the layout is read.
test("an old layout's References pane becomes the one Library page", async ({ page, context, request }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Meta+Shift+l");
  const layoutText = async () => {
    const r = await request.get(`/api/file?path=${encodeURIComponent(".atlas/cache/layout.json")}`, { headers: { "x-atlas": "1" } });
    return r.ok() ? (((await r.json()) as { text?: string }).text ?? "") : "";
  };
  await expect.poll(layoutText).toContain('"libraries"');
  const saved = JSON.parse(await layoutText());
  saved.panels.library = { ...saved.panels.libraries, id: "library", contentComponent: "library", title: "Library", params: { kind: "library" } };
  const addOld = (n: { type: string; data: any }): void => { if (n.type === "leaf") { if (n.data.views.includes("libraries")) n.data.views.push("library"); } else n.data.forEach(addOld); };
  addOld(saved.grid.root);
  await request.put("/api/file", { headers: { "x-atlas": "1" }, data: { path: ".atlas/cache/layout.json", text: JSON.stringify(saved) } });
  await page.close();
  const fresh = await context.newPage(); // a new window reads the file (a reload keeps its own tabs)
  await fresh.goto("/");
  await fresh.getByText("Finish the GW notes.").waitFor();
  const apps = fresh.getByTestId("sidebar").getByTestId("apps");
  await expect(apps.locator(".app.open")).not.toHaveCount(0);
  const labels = await apps.evaluate((el) => [...el.querySelectorAll("button")].map((n) => n.getAttribute("aria-label") ?? ""));
  expect(labels.filter((l) => /^Librar/.test(l))).toEqual(["Library"]);
});
