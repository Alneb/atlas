import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

// Plugins v4, editor hooks (docs/guides/PLUGINS.md "v4"): a completion, a key, a paste handler, decorations
// for a pattern, and the raw escape hatch — and a hook that throws costs nothing but a log line.
const H = { "x-atlas": "1" };
const put = (r: APIRequestContext, path: string, text: string) => r.put("/api/file", { headers: H, data: { path, text } });
const lastLine = (page: Page) => page.evaluate(() => (window as unknown as { __atlas: { editor(): { text: string } | null } }).__atlas.editor()?.text.trimEnd().split("\n").pop() ?? "");
const MAIN = `export function register(atlas) {
  const e = atlas.editor;
  e.registerCompletion({ where: "note", trigger: /@npc:\\w*/, complete: ({ word }) => ["Mira", "Brok"].filter((n) => n.toLowerCase().startsWith(word.slice(5).toLowerCase())).map((n) => ({ label: n, detail: "character", insert: "[[" + n + "]]" })) });
  e.registerCompletion({ complete: () => { throw new Error("a source that breaks"); } });
  e.registerKey("Ctrl+Alt+J", (t) => { t.insert("<" + (t.selection || "none") + "@" + t.line + ">"); });
  e.registerKey("Ctrl+Alt+U", () => false); // declines: the key goes on
  e.onPaste((d) => (d.text.startsWith("dice:") ? "\`" + d.text.slice(5) + "\`" : null));
  e.registerDecoration(/\\b\\d*d\\d+\\b/, (m) => ({ class: "demo-dice", title: "dice " + m[0] }));
  e.registerDecoration(/:sword:/, () => ({ replace: (host) => { host.textContent = "⚔"; host.dataset.drawn = "1"; } }));
  const { EditorView } = e.codemirror.view;
  e.extension(EditorView.editorAttributes.of({ "data-raw-extension": "on" }));
  e.extension({ not: "an extension" });
}\n`;

test.beforeAll(async ({ request }) => {
  await put(request, ".atlas/plugins/edhooks/plugin.toml", 'title = "Editor hooks"\n');
  await put(request, ".atlas/plugins/edhooks/main.js", MAIN);
  await put(request, "notes/hooks-note.md", "# Hooks\n\nroll 2d6 with a :sword: here\n\nend\n");
});
test.afterAll(async ({ request }) => { await put(request, ".atlas/plugins/edhooks/main.js", "export function register() {}\n"); });

test("a plugin's completion, key, paste handler, decorations and raw extension in the editor", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Control+p");
  await page.keyboard.type("hooks-note.md");
  await expect(page.getByTestId("palette").getByText("hooks-note", { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Enter");
  const note = page.locator(".cm-content");

  // decorations: a class on every match, a drawing in place of another; the raw extension's attribute
  await expect(note.locator(".demo-dice")).toHaveText("2d6");
  await expect(note.locator(".demo-dice")).toHaveAttribute("title", "dice 2d6");
  await expect(note.locator('.cm-plugin-widget[data-drawn="1"]')).toHaveText("⚔");
  await expect(page.locator('.cm-editor[data-raw-extension="on"]'), "the escape hatch; the bad extension beside it harmed nothing").toHaveCount(1);

  // a key: gets the selection and the line, inserts
  await note.click();
  await page.keyboard.press("Escape");
  await page.keyboard.type("Go"); // vim: a new last line, insert mode
  await page.keyboard.press("Control+Alt+j");
  await expect.poll(() => lastLine(page)).toMatch(/^<none@\d+>$/);

  // a completion behind its trigger; the source that throws beside it does not stop it
  await page.keyboard.type(" @npc:br");
  const list = page.locator(".cm-tooltip-autocomplete");
  await expect(list.getByText("Brok")).toBeVisible();
  await expect(list.getByText("Mira")).toBeHidden();
  await page.waitForTimeout(200); // the editor ignores Enter for a moment after a list opens (so a fast typist's Enter is a new line)
  await page.keyboard.press("Enter");
  await expect.poll(() => lastLine(page)).toMatch(/> \[\[Brok\]\]$/);

  // paste: the handler rewrites what it knows, and leaves the rest alone
  await page.evaluate(() => navigator.clipboard.writeText("dice:4d8"));
  await page.keyboard.type(" ");
  await page.keyboard.press("Control+v");
  await expect.poll(() => lastLine(page)).toMatch(/\[\[Brok\]\] `4d8`$/);
  await page.evaluate(() => navigator.clipboard.writeText(" plain"));
  await page.keyboard.press("Control+v");
  await expect.poll(() => lastLine(page)).toMatch(/`4d8` plain$/);
});
