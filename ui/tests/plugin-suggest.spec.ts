import { test, expect } from "@playwright/test";

// A text setting's `suggest` (docs/guides/PLUGIN-API.md, "Settings"): the form asks the plugin's helper and offers
// what it found under the box, which stays free to type (the Claude plugin's commands and accounts).
const H = { "x-atlas": "1" };
const TOML = `title = "Finder"\n\n[helper]\nrun = "python3 -u \\"$ATLAS_PLUGIN_DIR/helper.py\\""\n\n[[setting]]\nkey = "tool"\nlabel = "Tool"\nkind = "text"\nsuggest = "tools"\n`;
const HELPER = `import json, sys
for line in sys.stdin:
    req = json.loads(line)
    print(json.dumps({"id": req["id"], "result": [{"value": "/opt/a/tool", "label": "/opt/a/tool — 1.2"}, {"value": "tool-b", "label": "tool-b"}]}), flush=True)
`;
const MAIN = `export function register(atlas) { atlas.registerCommand({ id: "settings", title: "Finder: settings", run: () => atlas.plugin.openSettings() }); }\n`;

test.beforeAll(async ({ request }) => {
  for (const [path, text] of [["helper.py", HELPER], ["main.js", MAIN], ["plugin.toml", TOML]])
    await request.put("/api/file", { headers: H, data: { path: `.atlas/plugins/finder/${path}`, text } });
});
test.afterAll(async ({ request }) => { await request.post("/api/plugins/finder/remove", { headers: H }); });

test("a text setting offers what the helper found; picking one fills the box", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  const form = page.getByRole("form", { name: /Finder — settings/ });
  await expect(async () => {
    if (await page.getByTestId("palette").isVisible()) await page.keyboard.press("Escape");
    await page.keyboard.press("F1");
    await page.keyboard.type("Finder: settings");
    await page.getByTestId("palette").getByText("Finder: settings", { exact: true }).first().click({ timeout: 1000 });
    await expect(form).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 10_000 });
  const found = form.getByLabel("Tool: found on this machine");
  await expect(found).toContainText("2 found on this machine");
  await found.click();
  await page.getByRole("option", { name: "/opt/a/tool — 1.2" }).click();
  await expect(form.getByLabel("Tool", { exact: true })).toHaveValue("/opt/a/tool");
  await expect(form).toContainText("Kept in .atlas/plugin-settings/finder.toml");
});
