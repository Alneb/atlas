import { test, expect, type APIRequestContext } from "@playwright/test";

// Plugins v3 (docs/refactor/REFACTOR-plugins-v3.md): main.js registers blocks and commands at startup, with no
// pane and no rail button; editing it re-registers live (no rebuild); plugins build on each other.
const H = { "x-atlas": "1" };
const put = (r: APIRequestContext, path: string, text: string) => r.put("/api/file", { headers: H, data: { path, text } });
const main = (word: string) => `export function register(atlas) {
  atlas.registerBlock("demo.hello", (host, b) => {
    host.innerHTML = '<p class="demo">${word} ' + (b.options.who ?? "?") + '</p>';
    b.props().then((p) => { host.querySelector(".demo").dataset.run = p.run ?? ""; });
  });
  // composition: a block made of another plugin's block
  atlas.registerBlock("demo.pair", (host) => {
    const a = document.createElement("div"); host.append(a);
    const off = atlas.mountBlock(a, { type: "demo.hello", who: "nested" });
    host.append(Object.assign(document.createElement("p"), { className: "other", textContent: atlas.other("demo2")?.settings.color ?? "none" }));
    return off;
  });
  atlas.registerCommand({ id: "greet", title: "Demo: greet", run: () => atlas.toast("${word} from a command") });
}\n`;

test.beforeAll(async ({ request }) => {
  await put(request, ".atlas/plugins/demo/plugin.toml", 'title = "Demo"\n');
  await put(request, ".atlas/plugins/demo/main.js", main("hello"));
  await put(request, ".atlas/plugins/demo2/plugin.toml", 'title = "Demo two"\n');
  await put(request, ".atlas/plugin-settings/demo2.toml", 'color = "teal"\n'); // the vault's values, never in the manifest
  await put(request, "notes/run-note.md", "---\nrun: runs/r1\n---\n# A run\n\n```view\ntype: demo.hello\nwho: you\n```\n\n```view\ntype: demo.pair\n```\n");
});

test("a main.js plugin adds blocks and a command, no pane or rail; edits apply live", async ({ page, request }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await expect(page.getByRole("button", { name: "Demo", exact: true })).toHaveCount(0); // no rail button
  await page.keyboard.press("Control+p");
  await page.keyboard.type("run-note.md");
  await expect(page.getByTestId("palette").getByText("run-note", { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Enter");
  const hello = page.locator(".cm-content .demo").first();
  await expect(hello).toHaveText("hello you");
  await expect(hello).toHaveAttribute("data-run", "runs/r1"); // the note's frontmatter reached the block
  await expect(page.locator(".cm-content .demo", { hasText: "hello nested" })).toBeVisible(); // composed
  await expect(page.locator(".cm-content .other")).toHaveText("teal"); // another plugin's settings
  // a registered command is in the palette
  await page.keyboard.press("Meta+e"); // the palette from anywhere (Ctrl+K is "link" in a note)
  await page.keyboard.type("Demo: greet");
  await page.keyboard.press("Enter");
  await expect(page.getByText("hello from a command")).toBeVisible();
  // edit main.js: the open note's blocks redraw with the new code, no reload
  await put(request, ".atlas/plugins/demo/main.js", main("bonjour"));
  await expect(page.locator(".cm-content .demo").first()).toHaveText("bonjour you");
  // switched off: its blocks wait, its command is gone
  await request.put("/api/config", { headers: H, data: { ...(await (await request.get("/api/config", { headers: H })).json()).config, plugins: { off: ["demo"] } } });
  await expect(page.locator(".cm-content .view-wait").first()).toContainText("demo.hello");
  await request.put("/api/config", { headers: H, data: { ...(await (await request.get("/api/config", { headers: H })).json()).config, plugins: { off: [] } } });
  await expect(page.locator(".cm-content .demo").first()).toHaveText("bonjour you");
});

test.afterAll(async ({ request }) => {
  await put(request, ".atlas/plugins/demo/main.js", "export function register() {}\n"); // inert, so later tests see no toast
  await put(request, "notes/run-note.md", "");
});

test(".atlas/init.js registers like a plugin, with no manifest, and reloads on save", async ({ page, request }) => {
  const init = (word: string) => `export function register(atlas) { atlas.registerCommand({ id: "hi", title: "Init: ${word}", run: () => atlas.toast("${word} from init.js") }); }\n`;
  await put(request, ".atlas/init.js", init("hello"));
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  const palette = async (text: string) => {
    await page.keyboard.press("Meta+e"); // the palette from anywhere (Ctrl+K is "link" in a note)
    await page.keyboard.type(text);
  };
  // init.js registers after the page is up: on a loaded machine the palette can open before it (gate)
  await expect(async () => {
    await page.keyboard.press("Escape");
    await palette("Init: hello");
    await expect(page.getByTestId("palette").getByText("Init: hello").first()).toBeVisible({ timeout: 800 });
  }).toPass({ timeout: 8000 });
  await page.keyboard.press("Enter");
  await expect(page.getByText("hello from init.js")).toBeVisible();
  await put(request, ".atlas/init.js", init("bonjour"));
  await expect(async () => {
    await page.keyboard.press("Escape");
    await palette("Init: bonjour");
    await expect(page.getByTestId("palette").getByText("Init: bonjour").first()).toBeVisible({ timeout: 800 });
  }).toPass({ timeout: 8000 });
  await page.keyboard.press("Escape");
  await put(request, ".atlas/init.js", "export function register() {}\n");
});
