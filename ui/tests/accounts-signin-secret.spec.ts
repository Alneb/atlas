import { test, expect, type APIRequestContext } from "@playwright/test";

// A sign-in that finishes later (in the browser) keeps its token through the helper's `_secrets`: Settings → Accounts,
// already open, shows the card's token set without being reopened — it used to say "Not set yet" until a reload while
// the plugin was already using the token.
const H = { "x-atlas": "1" };
const DIR = ".atlas/plugins/keyed";
const TOML = `title = "Keyed"
icon = "server"
api = 12

[permissions]
secrets = true

[helper]
run = "python3 -u \\"$ATLAS_PLUGIN_DIR/helper.py\\""

[[setting]]
key = "servers"
label = "Servers"
kind = "records"
account = { kind = "Server", summary = "{host}" }
fields = [
  { key = "name", label = "Name", kind = "text" },
  { key = "host", label = "Host", kind = "text" },
  { key = "token", label = "Sign-in", kind = "secret", readonly = true },
]
`;
const HELPER = `import json, sys
for line in sys.stdin:
    req = json.loads(line)
    out = {"ok": True, "_secrets": {"servers.main.token": "t0k"}} if req["method"] == "signin_done" else None
    print(json.dumps({"id": req["id"], "result": out}), flush=True)
`;
const MAIN = `export function register(atlas) {
  atlas.registerCommand({ id: "settings", title: "Keyed: settings", run: () => atlas.plugin.openSettings() });
}\n`;
const put = (r: APIRequestContext, path: string, text: string) => r.put("/api/file", { headers: H, data: { path, text } });

test.beforeAll(async ({ request }) => {
  await put(request, ".atlas/plugin-settings/keyed.toml", `[[servers]]\nname = "main"\nhost = "one.example"\n`);
  for (const [path, text] of [["helper.py", HELPER], ["main.js", MAIN], ["plugin.toml", TOML]]) await put(request, `${DIR}/${path}`, text);
});
test.afterAll(async ({ request }) => { await request.post("/api/plugins/keyed/remove", { headers: H }); });

test("a token kept after the page opened shows as set on the open card", async ({ page, request }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await expect(async () => {
    if (await page.getByTestId("palette").isVisible()) await page.keyboard.press("Escape");
    await page.keyboard.press("F1");
    await page.keyboard.type("Keyed: settings");
    await page.getByTestId("palette").getByText("Keyed: settings", { exact: true }).first().click({ timeout: 1000 });
    await expect(page.locator(".plugin-page")).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 10_000 });
  await page.locator('[data-accounts="keyed/servers"] .acct .row').first().click();
  const token = page.locator('.edit [data-field="token"] .static');
  await expect(token).toHaveText("Not set yet");

  // the sign-in completes elsewhere: the helper's answer keeps the token
  const r = await request.post("/api/plugins/keyed/helper", { headers: H, data: { method: "signin_done", params: {} } });
  expect(r.ok()).toBe(true);
  await expect(token).toHaveText("Set");
});
