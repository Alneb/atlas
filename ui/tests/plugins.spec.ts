import { test, expect } from "@playwright/test";

// The plugin system with a fixture plugin (nothing runs-specific: that plugin lives in its workspace).
const H = { "x-atlas": "1" };
const MANIFEST = 'title = "Hello"\nrail = true\ndescription = "fixture plugin"\nicon = "table"\nkeys = "Ctrl+Alt+H"\ndata = "python3 \\"$ATLAS_PLUGIN_DIR/data.py\\""\n';
const DATA = 'import json, sys\nreq = json.load(sys.stdin)\nprint(json.dumps({"items": [req["settings"]["greeting"], "two"], "args": req["args"]}))\n';
const view = (label: string) => `export default async function mount(host, atlas) {
  const d = await atlas.data({ from: "view" });
  host.innerHTML = '<div class="hello"><h2>${label}</h2><ul>' + d.items.map((x) => '<li>' + x + '</li>').join('') + '</ul><p class="args">' + d.args.from + '</p><button>open</button></div>';
  host.querySelector("button").onclick = () => atlas.open("notes/hubbard.md");
  return () => { window.__helloUnmounted = (window.__helloUnmounted ?? 0) + 1; };
}\n`;
const put = (request: import("@playwright/test").APIRequestContext, path: string, text: string) =>
  request.put("/api/file", { headers: H, data: { path, text } });

test.beforeAll(async ({ request }) => {
  await put(request, ".atlas/plugin-settings/hello.toml", 'greeting = "hi"\n'); // the vault's values, never in the manifest
  await put(request, ".atlas/plugins/hello/plugin.toml", MANIFEST);
  await put(request, ".atlas/plugins/hello/data.py", DATA);
  await put(request, ".atlas/plugins/hello/view.js", view("Hello plugin"));
  await put(request, ".atlas/plugins/broken/plugin.toml", "title = 3\n");
});

test("a workspace plugin gets a command, a rail button and a pane fed by its data script", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  // the broken manifest is reported, not silently skipped
  await expect(page.getByText("Plugin broken not loaded")).toBeVisible();
  await expect(page.getByRole("button", { name: "Hello", exact: true })).toBeVisible(); // rail
  await page.keyboard.press("Control+Alt+h");
  const pane = page.locator(".hello");
  await expect(pane.getByRole("heading", { name: "Hello plugin" })).toBeVisible();
  await expect(pane.locator("li")).toHaveText(["hi", "two"]); // settings reached the data script
  await expect(pane.locator(".args")).toHaveText("view"); // and so did the view's args
  await pane.getByRole("button", { name: "open" }).click();
  await expect(page.getByTestId("sidebar").locator(".tab", { hasText: "hubbard" })).toBeVisible();
});

test("editing a plugin's view reloads its pane", async ({ page, request }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Meta+e");
  await page.keyboard.type("Hello — fixture plugin"); // the command title: plugin title + description
  await expect(page.getByTestId("palette").getByText("Hello — fixture plugin").first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Hello plugin" })).toBeVisible();
  await put(request, ".atlas/plugins/hello/view.js", view("Hello again"));
  await expect(page.getByRole("heading", { name: "Hello again" })).toBeVisible({ timeout: 5000 });
  expect(await page.evaluate(() => (window as unknown as { __helloUnmounted?: number }).__helloUnmounted)).toBe(1);
  await put(request, ".atlas/plugins/hello/view.js", view("Hello plugin"));
});
