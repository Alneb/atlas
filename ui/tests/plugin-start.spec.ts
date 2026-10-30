import { test, expect, type APIRequestContext } from "@playwright/test";

// A plugin's `on = "start"` tool (PLUGIN-API.md) runs in the background when its settings are saved (and when the vault
// is served, or the plugin installed or updated): what a hook would otherwise do on its first call, with every capture
// behind it waiting. A stand-in helper writes each call into the vault, where the test reads it.
const H = { "x-atlas": "1" };
const DIR = ".atlas/plugins/starter";
const put = (request: APIRequestContext, path: string, text: string) => request.put("/api/file", { headers: H, data: { path, text } });
const calls = (request: APIRequestContext) =>
  request.get("/api/file?path=start-calls.txt", { headers: H }).then(async (r) => (r.ok() ? ((await r.json()).text as string) : "")).then((t) => t.split("\n").filter(Boolean));
const HELPER = `const fs = require("fs"), path = require("path");
require("readline").createInterface({ input: process.stdin }).on("line", (l) => {
  const m = JSON.parse(l);
  if (m.method === "prepare") fs.appendFileSync(path.join(process.env.ATLAS_ROOT, "start-calls.txt"), JSON.stringify(m.params.settings ?? {}) + "\\n");
  process.stdout.write(JSON.stringify({ id: m.id, result: { ok: true } }) + "\\n");
});
`;
const MANIFEST = `title = "Starter"
description = "a stand-in for a plugin that prepares itself"
version = "0.1.0"

[helper]
run = "node \\"$ATLAS_PLUGIN_DIR/helper.cjs\\""

[[setting]]
key = "languages"
label = "Languages"
kind = "text"
default = "eng"

[[tool]]
name = "prepare"
description = "gets ready"
input = {}
on = "start"
`;

test.beforeAll(async ({ request }) => {
  await put(request, `${DIR}/helper.cjs`, HELPER);
  await put(request, `${DIR}/plugin.toml`, MANIFEST);
});
test.afterAll(async ({ request }) => {
  await request.post("/api/plugins/starter/helper/stop", { headers: H });
  for (const f of [DIR, "start-calls.txt"]) await request.post(`/api/fs/trash?path=${encodeURIComponent(f)}`, { headers: H });
});

test("a plugin's start tool runs again when its settings are saved, with the new settings", async ({ request }) => {
  const before = (await calls(request)).length;
  expect((await request.put("/api/plugins/starter/settings", { headers: H, data: { languages: "eng+spa" } })).ok()).toBe(true);
  await expect.poll(async () => (await calls(request)).length, { timeout: 15_000 }).toBe(before + 1);
  expect((await calls(request)).at(-1)).toContain("eng+spa");
});
