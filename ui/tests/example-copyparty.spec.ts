import { test, expect, type APIRequestContext } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import { readFileSync, mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { WS } from "../playwright.config";

// The copyparty example plugin: a copyparty server's files in the shared explorer. The server is
// a stand-in (scripts/vault/tests/fake_copyparty.py) with a password; the address names a folder of it (…/hdd1), as the user's does.
const H = { "x-atlas": "1" };
const DIR = ".atlas/plugins/copyparty";
const ROOT = `${WS}-copyparty`;
const put = (r: APIRequestContext, path: string, text: string) => r.put("/api/file", { headers: H, data: { path, text } });
const read = async (r: APIRequestContext, path: string) => { const res = await r.get(`/api/file?path=${encodeURIComponent(path)}`, { headers: H }); return res.ok() ? ((await res.json()) as { text: string }).text : null; };
const example = (f: string) => readFileSync(fileURLToPath(new URL(`../../plugins/beta/copyparty/${f}`, import.meta.url)), "utf8");
let server: ChildProcess;

test.beforeAll(async ({ request }) => {
  rmSync(ROOT, { recursive: true, force: true });
  mkdirSync(join(ROOT, "hdd1/Physics/Books"), { recursive: true });
  writeFileSync(join(ROOT, "hdd1/Physics/readme.md"), "# The library\n");
  writeFileSync(join(ROOT, "hdd1/Physics/Books/Mahan.pdf"), "%PDF-1.4 not really\n");
  writeFileSync(join(ROOT, "hdd1/Physics/léa notes.txt"), "accents and spaces\n");
  server = spawn("python3", [fileURLToPath(new URL("../../scripts/vault/tests/fake_copyparty.py", import.meta.url)), ROOT, "s3cret"], { stdio: ["ignore", "pipe", "inherit"] });
  const { port } = await new Promise<{ port: number }>((ok) => createInterface({ input: server.stdout! }).once("line", (l) => ok(JSON.parse(l))));
  await put(request, `${DIR}/main.js`, example("main.js"));
  await put(request, `${DIR}/plugin.toml`, example("plugin.toml"));
  await put(request, ".atlas/plugin-settings/copyparty.toml", `[[servers]]\nname = "nas"\nurl = "http://127.0.0.1:${port}/hdd1/"\n`); // the vault's values, never in the manifest
  await request.put(`/api/plugins/copyparty/secrets/${encodeURIComponent("servers.nas.password")}`, { headers: H, data: { value: "s3cret" } });
});
test.afterAll(async ({ request }) => {
  server?.kill();
  await put(request, `${DIR}/main.js`, "export function register() {}\n");
});

test("a copyparty server in the explorer: browse, open and save back, make, rename, upload, download, delete", async ({ page, request }) => {
  test.setTimeout(60_000);
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("F1");
  await page.keyboard.type("the explorer");
  await page.keyboard.press("Enter");
  const pane = page.locator(".explorer");
  await pane.locator(".place", { hasText: "nas" }).click();
  const row = (name: string) => pane.locator(".x-row", { has: page.locator(".label", { hasText: new RegExp(`^${name.replace(/[.[\]]/g, "\\$&")}$`) }) });
  await expect(row("Physics")).toBeVisible();
  await row("Physics").dblclick();
  await expect(row("léa notes.txt"), "names percent-encoded by the server").toContainText("19 B");
  await expect(row("Books")).toBeVisible();

  // a text file opens in the editor from its local copy; a save goes back (with the password, by the core)
  await row("readme.md").dblclick();
  const ed = page.locator(".dv-active-group .cm-editor");
  await expect(ed).toContainText("The library");
  await ed.locator(".cm-content").click();
  await page.keyboard.press("Control+End");
  if (await page.locator(".cm-fat-cursor").count()) await page.keyboard.press("o");
  else await page.keyboard.press("Enter");
  await page.keyboard.type("Edited in Atlas.");
  await page.keyboard.press("Control+s");
  await expect.poll(() => readFileSync(join(ROOT, "hdd1/Physics/readme.md"), "utf8")).toContain("Edited in Atlas.");
  // someone else changed it there: not overwritten unseen; a click on the notice saves over it
  await new Promise((r) => setTimeout(r, 1100)); // copyparty's dates are in seconds
  writeFileSync(join(ROOT, "hdd1/Physics/readme.md"), "# The library\n\nChanged on the server, by someone else.\n");
  await page.keyboard.type(" Again.");
  await page.keyboard.press("Control+s");
  const notice = page.getByText(/changed on nas since it was opened here/);
  await expect(notice).toBeVisible({ timeout: 15_000 });
  expect(readFileSync(join(ROOT, "hdd1/Physics/readme.md"), "utf8")).toContain("someone else");
  await notice.click();
  await expect.poll(() => readFileSync(join(ROOT, "hdd1/Physics/readme.md"), "utf8")).toContain("Edited in Atlas. Again.");

  // a new folder, a rename (copyparty's move names the target from its own root), an upload from the computer
  await page.getByTestId("sidebar").locator(".tab", { hasText: "(nas)" }).click();
  await pane.getByRole("button", { name: "New folder" }).click();
  await pane.getByRole("textbox", { name: "New folder name" }).fill("Notes");
  await page.keyboard.press("Enter");
  await expect(row("Notes")).toBeVisible();
  expect(existsSync(join(ROOT, "hdd1/Physics/Notes"))).toBe(true);
  await row("léa notes.txt").click();
  await pane.locator(".list").press("F2");
  await pane.getByRole("textbox", { name: /New name for/ }).fill("lea.txt");
  await page.keyboard.press("Enter");
  await expect(row("lea.txt")).toBeVisible();
  expect(readFileSync(join(ROOT, "hdd1/Physics/lea.txt"), "utf8")).toBe("accents and spaces\n");
  await pane.locator('input[type="file"]').setInputFiles([{ name: "thesis.pdf", mimeType: "application/pdf", buffer: Buffer.from([37, 80, 68, 70, 0, 1, 2]) }]);
  await expect(row("thesis.pdf")).toContainText("7 B");
  expect(readFileSync(join(ROOT, "hdd1/Physics/thesis.pdf"))).toEqual(Buffer.from([37, 80, 68, 70, 0, 1, 2]));

  // download into a folder of the vault
  await row("lea.txt").hover();
  await row("lea.txt").getByRole("button", { name: "Download…" }).click();
  await expect(page.getByTestId("palette").getByRole("textbox")).toBeFocused();
  await page.keyboard.type("notes/from-server");
  await expect(page.getByTestId("palette").getByText(/Into notes\/from-server/).first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(pane.locator(".status .msg")).toContainText("Downloaded to notes/from-server/lea.txt");
  expect(await read(request, "notes/from-server/lea.txt")).toBe("accents and spaces\n");

  // delete: a folder with something in it is refused (copyparty's own delete would take it all), a file goes
  await row("Books").hover();
  await row("Books").getByRole("button", { name: "Delete" }).click();
  await pane.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(pane.locator(".status .msg.bad")).toContainText("only an empty folder");
  expect(existsSync(join(ROOT, "hdd1/Physics/Books/Mahan.pdf"))).toBe(true);
  await row("thesis.pdf").click();
  await pane.locator(".list").press("Delete");
  await pane.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(row("thesis.pdf")).toHaveCount(0);
  expect(existsSync(join(ROOT, "hdd1/Physics/thesis.pdf"))).toBe(false);

  // Thumbnails: the server's own picture of a photo (`?th=j`); a note keeps its icon
  writeFileSync(join(ROOT, "hdd1/Physics/photo.jpg"), Buffer.from(JPEG, "base64"));
  await page.keyboard.press("F5");
  await pane.getByRole("button", { name: "Thumbnails" }).click();
  await expect(row("photo.jpg")).toHaveClass(/has-thumb/);
  await expect(row("readme.md")).not.toHaveClass(/has-thumb/);
});
const JPEG = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCAAMABADASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAwb/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCgDSb/2Q==";

// Books' remote folders: the plugin's `remote`
// setting names a folder of a copyparty server; the Libraries page's Books lists its books beside the vault's, and
// Read fetches the book through copyparty's file source (atlas.files.local) into its local copy and opens it.
test("Books lists a server folder's books beside the vault's, and a server's book opens from its local copy", async ({ page, request }) => {
  test.setTimeout(60_000);
  mkdirSync(join(ROOT, "hdd1/Physics/Books/Shelf"), { recursive: true });
  writeFileSync(join(ROOT, "hdd1/Physics/Books/Shelf/Remote Quanta.epub"), "PK not really a book\n");
  // the user's shelves are mostly PDFs (2026-10-21: "the books dont load from copyparty"); copyparty's `.hist` is skipped
  writeFileSync(join(ROOT, "hdd1/Physics/Books/Shelf/Remote Fields.pdf"), "%PDF-1.4 not really one\n");
  mkdirSync(join(ROOT, "hdd1/Physics/Books/.hist"), { recursive: true });
  writeFileSync(join(ROOT, "hdd1/Physics/Books/.hist/Hidden Copy.epub"), "PK\n");
  const books = (f: string) => readFileSync(fileURLToPath(new URL(`../../plugins/beta/books/${f}`, import.meta.url)), "utf8");
  const BOOKS = ".atlas/plugins/books";
  for (const f of ["main.js", "view.js", "shared/marks.js"]) await put(request, `${BOOKS}/${f}`, books(f));
  await put(request, `${BOOKS}/plugin.toml`, books("plugin.toml"));
  await put(request, ".atlas/plugin-settings/books.toml", 'folder = "books-remote-spec"\n\n[[remote]]\nserver = "nas"\nfolder = "/Physics/Books"\n');
  await request.put("/api/file", { headers: H, data: { path: "books-remote-spec/Local Tales.epub", text: "PK not a book either\n" } });
  try {
    await page.goto("/");
    await page.getByText("Finish the GW notes.").waitFor();
    await page.keyboard.press("F1");
    await page.keyboard.type("Libraries");
    await page.getByTestId("palette").getByText("Libraries (drawings, references, films, comics…)").click();
    const libs = page.locator(".libraries");
    await libs.getByRole("tab", { name: "E-books" }).click();
    const titles = libs.locator(".library .t");
    await expect(titles.filter({ hasText: "Remote Quanta" })).toBeVisible({ timeout: 20_000 });
    await expect(titles.filter({ hasText: "Local Tales" })).toBeVisible();
    await expect(titles.filter({ hasText: "Remote Fields" })).toBeVisible();
    await expect(titles.filter({ hasText: "Hidden Copy" })).toHaveCount(0);
    // the server's folders at the side, as on disk: a folder leaves its books only
    await libs.locator(".side .tree-row .item", { hasText: "Shelf" }).click(); // the tree: nas › Shelf
    await expect(titles.filter({ hasText: "Local Tales" })).toHaveCount(0);
    await titles.filter({ hasText: "Remote Quanta" }).click();
    await libs.getByRole("button", { name: "Read" }).click();
    await expect.poll(async () => (await request.get(`/api/file?path=${encodeURIComponent(".atlas/remote/copyparty/nas/Physics/Books/Shelf/Remote Quanta.epub")}`, { headers: H })).status(), "its local copy").toBe(200);
  } finally {
    await put(request, `${BOOKS}/plugin.toml`, books("plugin.toml"));
  }
});
