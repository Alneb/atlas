import { test, expect } from "@playwright/test";
const H = { "x-atlas": "1" };
const put = (request: import("@playwright/test").APIRequestContext, path: string, text: string) =>
  request.put("/api/file", { headers: H, data: { path, text } });

// docs/design/MALLEABLE.md R3: one shared context. Hover sync (Embark's map ↔ outline): a Base row under the
// pointer lights the links to that note; a note link under the pointer lights the row.
test("hover sync between a note's links and an embedded base", async ({ page, request }) => {
  await put(request, "notes/hov-a.md", "---\nkind: hov\n---\n");
  await put(request, "notes/hov-b.md", "---\nkind: hov\n---\n");
  await put(request, "notes/hov-host.md", "# Hover\n\nSee [[hov-a]] and [[hov-b]].\n\n![[hov.base]]\n");
  await put(request, "db/hov.base", "filters: 'kind == \"hov\"'\nviews:\n  - type: table\n    name: H\n    order: [file.name]\n");
  await page.goto("/");
  await page.keyboard.press("Control+p");
  await page.keyboard.type("hov-host.md");
  await expect(page.getByTestId("palette").getByText("hov-host", { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Enter");
  const rows = page.locator(".cm-content .base tbody tr");
  await expect(rows).toHaveCount(2);
  await rows.filter({ hasText: "hov-b" }).hover();
  await expect(page.locator(".cm-content .atlas-hover-link")).toHaveCount(1);
  await expect(page.locator(".cm-content .atlas-hover-link")).toHaveText(/hov-b/);
  await page.locator(".cm-content .cm-hmd-internal-link", { hasText: "hov-a" }).hover();
  await expect(rows.filter({ hasText: "hov-a" })).toHaveClass(/lit/);
});

// PluginApi v2: context, query (Bases YAML without a file), writeProperty.
test("a plugin reads the shared context, queries notes and writes a property", async ({ page, request }) => {
  await put(request, ".atlas/plugins/ctx/plugin.toml", 'title = "Ctx"\nrail = true\nkeys = "Ctrl+Alt+Y"\n');
  await put(request, ".atlas/plugins/ctx/view.js", `export default async function mount(host, atlas) {
  const r = await atlas.query("filters: 'kind == \\"hov\\"'\\nviews:\\n  - type: table\\n    order: [file.name]\\n");
  host.innerHTML = '<div class="ctx"><p class="n">' + r.views[0].rows.length + '</p><p class="act"></p><button>tag</button></div>';
  const show = (c) => { host.querySelector(".act").textContent = c.selection?.path ?? "none"; };
  show(atlas.context());
  const off = atlas.onContext(show);
  host.querySelector("button").onclick = () => atlas.writeProperty("notes/hov-a.md", "seen", "yes");
  return off;
}\n`);
  await put(request, "notes/hov-a.md", "---\nkind: hov\n---\n");
  await put(request, "notes/hov-b.md", "---\nkind: hov\n---\n");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Ctx", exact: true })).toBeVisible(); // plugins loaded
  await page.keyboard.press("Control+Alt+y");
  const pane = page.locator(".ctx");
  await expect(pane.locator(".n")).toHaveText("2");
  await page.keyboard.press("Control+p");
  await page.keyboard.type("hov-b.md");
  await expect(page.getByTestId("palette").getByText("hov-b", { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Enter");
  // the note must have loaded and taken the caret before it is hidden: an editor that finishes loading
  // behind another tab reports no selection (this raced in full runs)
  await expect(page.locator(".cm-editor.cm-focused")).toBeVisible();
  await page.getByTestId("apps").getByRole("button", { name: "Ctx", exact: true }).click(); // its app tile (apps.svelte.ts)
  await expect(pane.locator(".act")).toHaveText("notes/hov-b.md"); // it followed the editor while hidden
  await pane.getByRole("button", { name: "tag" }).click();
  await expect.poll(() => request.get("/api/file?path=notes/hov-a.md", { headers: H }).then((r) => r.json()).then((j) => j.text)).toContain("seen: yes");
});
