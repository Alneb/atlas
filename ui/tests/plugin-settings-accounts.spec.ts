import { test, expect, type APIRequestContext } from "@playwright/test";

// Settings v2 (docs/refactor/REFACTOR-settings-v2.md): a records field with `account = {…}` is listed on Settings →
// Accounts with the helper's status, opened in place, tested before saving, saved one card at a time (the plugin's
// other settings and cards kept), and added from a preset. A section the plugin draws shows on its page.
const H = { "x-atlas": "1" };
const DIR = ".atlas/plugins/hosts";
const TOML = `title = "Hosts"
icon = "server"
api = 12

[helper]
run = "python3 -u \\"$ATLAS_PLUGIN_DIR/helper.py\\""

[[setting]]
key = "servers"
label = "Servers"
kind = "records"
add = "Add server"
account = { kind = "Server", summary = "{user} · {host}", status = "status", test = "test", presets = [{ label = "Example cloud", hint = "the hosted one", values = { host = "cloud.example" } }] }
fields = [
  { key = "name", label = "Name", kind = "text" },
  { key = "host", label = "Host", kind = "text" },
  { key = "user", label = "User", kind = "text" },
]

[[setting]]
key = "every"
label = "Check every"
kind = "number"
default = 5
group = "Sync"

[[setting]]
key = "deep"
label = "Deep check"
kind = "toggle"
advanced = true

[[setting]]
key = "colors"
label = "Colours"
kind = "list"
hidden = true
`;
const SETTINGS = `every = 9\ncolors = ["a: #fff"]\n\n[[servers]]\nname = "main"\nhost = "good.example"\nuser = "ana"\n\n[[servers]]\nname = "broken"\nhost = "bad.example"\nuser = "bo"\n`;
const HELPER = `import json, sys
for line in sys.stdin:
    req = json.loads(line)
    p = req.get("params") or {}
    if req["method"] == "status":
        out = {r["name"]: ({"state": "ok", "text": "reachable"} if r.get("host") != "bad.example" else {"state": "error", "text": "refused"}) for r in p.get("records", [])}
    elif req["method"] == "test":
        host = (p.get("record") or {}).get("host", "")
        out = {"ok": host.endswith("good.example"), "text": "answers at " + host if host.endswith("good.example") else "no answer from " + host}
    else:
        out = None
    print(json.dumps({"id": req["id"], "result": out}), flush=True)
`;
const MAIN = `export function register(atlas) {
  atlas.registerCommand({ id: "settings", title: "Hosts: settings", run: () => atlas.plugin.openSettings() });
  atlas.plugin.registerSettingsSection?.({ id: "map", title: "Map of hosts", mount(host, ctx) {
    host.textContent = "drawn by the plugin: every " + ctx.settings().every;
    return () => { host.textContent = ""; };
  } });
}\n`;
const put = (r: APIRequestContext, path: string, text: string) => r.put("/api/file", { headers: H, data: { path, text } });
const read = async (r: APIRequestContext, path: string) => ((await (await r.get(`/api/file?path=${encodeURIComponent(path)}`, { headers: H })).json()) as { text: string }).text;

test.beforeAll(async ({ request }) => {
  await put(request, ".atlas/plugin-settings/hosts.toml", SETTINGS);
  for (const [path, text] of [["helper.py", HELPER], ["main.js", MAIN], ["plugin.toml", TOML]]) await put(request, `${DIR}/${path}`, text);
});
test.afterAll(async ({ request }) => { await request.post("/api/plugins/hosts/remove", { headers: H }); });

async function openSettings(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await expect(async () => {
    if (await page.getByTestId("palette").isVisible()) await page.keyboard.press("Escape");
    await page.keyboard.press("F1");
    await page.keyboard.type("Hosts: settings");
    await page.getByTestId("palette").getByText("Hosts: settings", { exact: true }).first().click({ timeout: 1000 });
    await expect(page.locator(".plugin-page")).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 10_000 });
}

test("accounts: listed with their status, tested unsaved, saved alone, added from a preset", async ({ page, request }) => {
  await openSettings(page);
  // the plugin's page: its accounts above the form, which shows neither them nor the hidden field; advanced folded
  const list = page.locator('[data-accounts="hosts/servers"]');
  await expect(list.locator(".acct")).toHaveCount(2);
  const form = page.getByRole("form", { name: /Hosts — settings/ });
  await expect(form.locator('[data-field="servers"]')).toHaveCount(0);
  await expect(form.locator('[data-field="colors"]')).toHaveCount(0);
  await expect(form.locator('[data-group="Sync"] h4')).toHaveText("Sync");
  await expect(form.locator('details[data-group="Advanced"]')).not.toHaveAttribute("open", "");
  await expect(page.locator('[data-section="hosts/map"]')).toContainText("drawn by the plugin: every 9");

  // Settings → Accounts: both, with the helper's words; the one in trouble marks the entry
  await page.locator(".nav.accounts").click();
  const rows = page.locator('[data-accounts="hosts/servers"] .acct');
  await expect(rows.nth(0)).toContainText("ana · good.example");
  await expect(rows.nth(0).locator(".pill")).toHaveText("reachable");
  await expect(rows.nth(1).locator(".pill.error")).toHaveText("refused");
  await expect(page.locator(".nav.accounts .bad")).toBeVisible();

  // opened in place: Test answers about the card as typed, before any save
  await rows.nth(1).locator(".row").click();
  const host = page.locator('.edit [data-field="host"] input');
  await host.fill("other.good.example");
  await page.locator(".edit .btn", { hasText: "Test" }).click();
  await expect(page.locator(".tested.ok")).toHaveText(/answers at other\.good\.example/);
  expect(await read(request, ".atlas/plugin-settings/hosts.toml"), "Test writes nothing").toContain('host = "bad.example"');
  await page.locator(".edit .btn.primary").click();
  await expect(page.locator(".edit")).toHaveCount(0);
  await expect.poll(() => read(request, ".atlas/plugin-settings/hosts.toml")).toContain('host = "other.good.example"');
  const saved = await read(request, ".atlas/plugin-settings/hosts.toml");
  expect(saved, "the other card and settings are kept").toContain('host = "good.example"');
  expect(saved).toContain("every = 9");
  expect(saved).toContain('colors = ["a: #fff"]');
  await expect(page.locator(".nav.accounts .bad"), "fixed: no account in trouble").toHaveCount(0);

  // Add → a preset: the card starts with its values
  await page.locator(".addwrap .btn").click();
  await page.locator(".menu button", { hasText: "Example cloud" }).click();
  await expect(page.locator('.fresh [data-field="host"] input')).toHaveValue("cloud.example");
  await page.locator('.fresh [data-field="name"] input').fill("cloud");
  await page.locator(".fresh .btn.primary").click();
  await expect.poll(() => read(request, ".atlas/plugin-settings/hosts.toml")).toContain('name = "cloud"');
  await expect(page.locator('[data-accounts="hosts/servers"] .acct')).toHaveCount(3);
});
