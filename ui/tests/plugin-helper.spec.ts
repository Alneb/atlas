import { test, expect, type APIRequestContext } from "@playwright/test";

// Plugins v4, the helper (docs/guides/PLUGINS.md "v4"): a program of the plugin's own that the core keeps
// running and talks to in JSON lines. One process answers many calls, pushes events to the page, and
// stops when the plugin is switched off.
const H = { "x-atlas": "1" };
const put = (r: APIRequestContext, path: string, text: string) => r.put("/api/file", { headers: H, data: { path, text } });
const HELPER = `import json, sys
n = 0
for line in sys.stdin:
    m = json.loads(line); n += 1
    if m["method"] == "add":
        print(json.dumps({"id": m["id"], "result": {"sum": sum(m["params"]), "calls": n}}), flush=True)
    elif m["method"] == "tell":
        print(json.dumps({"event": "news", "data": {"text": "hello from the helper"}}), flush=True)
        print(json.dumps({"id": m["id"], "result": True}), flush=True)
`;
const MAIN = `export function register(atlas) {
  const cell = atlas.shell.statusItem({ id: "out", text: "idle" });
  atlas.helper.on("news", (d) => cell.set("event: " + d.text));
  atlas.registerCommand({ id: "add", title: "Helper demo: add", run: async () => {
    const a = await atlas.helper.call("add", [1, 2, 3]);
    const b = await atlas.helper.call("add", [10, 20]);
    cell.set(a.sum + " then " + b.sum + ", call " + b.calls + ", " + (await atlas.helper.state()));
  } });
  atlas.registerCommand({ id: "tell", title: "Helper demo: ask for an event", run: () => atlas.helper.call("tell") });
}\n`;

test.beforeAll(async ({ request }) => {
  await put(request, ".atlas/plugins/helpy/helper.py", HELPER);
  await put(request, ".atlas/plugins/helpy/main.js", MAIN);
  await put(request, ".atlas/plugins/helpy/plugin.toml", 'title = "Helpy"\n\n[helper]\nrun = "python3 -u \\"$ATLAS_PLUGIN_DIR/helper.py\\""\n');
});
test.afterAll(async ({ request }) => {
  await put(request, ".atlas/plugins/helpy/main.js", "export function register() {}\n");
  await request.post("/api/plugins/helpy/helper/stop", { headers: H });
});

test("a plugin's helper answers calls from one process, sends an event, and Settings says what the plugin may do", async ({ page, request }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  const cell = page.locator('.status [data-cell="helpy:out"]');
  await expect(cell).toHaveText("idle");
  const run = async (title: string) => { await page.keyboard.press("F1"); await page.keyboard.type(title); await page.keyboard.press("Enter"); };

  await run("Helper demo: add");
  await expect(cell, "two calls, one process (it counted both)").toHaveText("6 then 30, call 2, running");
  await run("Helper demo: ask for an event");
  await expect(cell).toHaveText("event: hello from the helper");

  // Settings names what this plugin may do outside the page
  await run("Settings");
  await page.getByRole("button", { name: /^Plugins( \d+)?$/ }).first().click();
  await expect(page.locator('[data-plugin-may="helpy"]')).toHaveText("May run a program of its own.");

  // switched off: the program is stopped
  await page.getByRole("switch", { name: "Plugin Helpy" }).click();
  await expect.poll(async () => (await (await request.get("/api/plugins/helpy/helper", { headers: H })).json()).state).toBe("stopped");
  await page.getByRole("switch", { name: "Plugin Helpy" }).click(); // the shared vault as it was
});
