import { test, expect, type APIRequestContext } from "@playwright/test";
import { openFile } from "./open";

// Plugins v4, events (docs/refactor/REFACTOR-plugins-v4.md, 3.3): `atlas.on(type, fn)` — a tab opened on a
// file, a save, a new note. A listener that throws breaks nothing and is in its plugin's log.
const H = { "x-atlas": "1" };
const put = (r: APIRequestContext, path: string, text: string) => r.put("/api/file", { headers: H, data: { path, text } });
const MAIN = `export function register(atlas) {
  const seen = [];
  const cell = atlas.shell.statusItem({ id: "last", text: "nothing yet" });
  const note = (e) => { seen.push(e.type + " " + (e.path ?? e.from)); cell.set(seen.join(" | ").slice(-200)); };
  for (const t of ["file:open", "file:save", "file:create", "file:rename", "file:delete", "capture"]) atlas.on(t, note);
  atlas.on("command", (e) => { if (e.id === "ui.outline") note({ type: "command", path: e.id }); });
  atlas.on("file:save", () => { throw new Error("a listener that breaks"); });
}\n`;

test.beforeAll(async ({ request }) => {
  await put(request, ".atlas/plugins/ev/plugin.toml", 'title = "Events"\n');
  await put(request, ".atlas/plugins/ev/main.js", MAIN);
  await put(request, "notes/events-note.md", "# Events\n\nline\n");
});
test.afterAll(async ({ request }) => { await put(request, ".atlas/plugins/ev/main.js", "export function register() {}\n"); });

test("a plugin hears a file opened, saved and created; a broken listener harms nothing", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  const cell = page.locator('.status [data-cell="ev:last"]');
  await expect(cell).toBeAttached();
  const title = () => cell.getAttribute("title").then(() => cell.evaluate((el) => el.textContent ?? ""));

  await openFile(page, "events-note.md");
  await expect.poll(title).toContain("file:open notes/events-note.md");

  await page.locator(".cm-content").click();
  await page.keyboard.press("Escape");
  await page.keyboard.type("Gosaved by the test");
  await page.keyboard.press("Control+s");
  await expect.poll(title).toContain("file:save notes/events-note.md");
  const onDisk = await (await page.request.get("/api/file?path=notes/events-note.md", { headers: H })).json();
  expect(onDisk.text, "the save went through although a listener threw").toContain("saved by the test");

  // a command run from the palette
  await page.keyboard.press("F1");
  await page.keyboard.type("Outline of the current note");
  await page.keyboard.press("Enter");
  await expect.poll(title).toContain("command ui.outline");

  // a new note from quick open
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+p");
  await page.keyboard.type("Event made note qq");
  await page.getByTestId("palette").getByText("Create note “Event made note qq”").click();
  await expect.poll(title).toContain("file:create notes/Event made note qq.md");
});
