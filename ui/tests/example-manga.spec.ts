import { test, expect } from "@playwright/test";
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { crc32, deflateRawSync, deflateSync } from "node:zlib";
import { WS } from "../playwright.config";
import { installZipPlugin } from "./fixtures/plugins";
import { createServer, type Server } from "node:http";
// @ts-expect-error a plugin's module is plain JavaScript, loaded as the page loads it
import { said } from "../../plugins/beta/manga/suwayomi.js";

// The manga plugin's web side (plugins/beta/manga/view.js): the library from the vault's manga/ folder, a series, and
// a .cbz unzipped in the page; where you are written to the series' note (its folder's own), as the Android screens write it.
const PLUGIN = join(WS, ".atlas/plugins/manga");
// a 2×3 PNG per page, each a different grey so the pages differ
function png(grey: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(2, 0); ihdr.writeUInt32BE(3, 4); ihdr[8] = 8; ihdr[9] = 0;
  const raw = Buffer.alloc(3 * 3); for (let r = 0; r < 3; r++) { raw[r * 3] = 0; raw[r * 3 + 1] = grey; raw[r * 3 + 2] = grey; }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
// a zip as a .cbz is written (some pages deflated, one stored), names out of order to check the natural sort
function cbz(pages: [string, Buffer, boolean][]): Buffer {
  const locals: Buffer[] = [], central: Buffer[] = [];
  let at = 0;
  for (const [name, data, deflate] of pages) {
    const body = deflate ? deflateRawSync(data) : data, n = Buffer.from(name);
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(deflate ? 8 : 0, 8);
    h.writeUInt32LE(crc32(data), 14); h.writeUInt32LE(body.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(n.length, 26);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(deflate ? 8 : 0, 10);
    c.writeUInt32LE(crc32(data), 16); c.writeUInt32LE(body.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(at, 42);
    locals.push(h, n, body); central.push(c, n);
    at += 30 + n.length + body.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(pages.length, 8); end.writeUInt16LE(pages.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(at, 16);
  return Buffer.concat([...locals, cd, end]);
}

test.beforeAll(() => {
  installZipPlugin(); // view.js imports ../zip/zip.js
  mkdirSync(PLUGIN, { recursive: true });
  for (const f of ["plugin.toml", "main.js", "view.js", "suwayomi.js"]) copyFileSync(new URL(`../../plugins/beta/manga/${f}`, import.meta.url), join(PLUGIN, f));
  const series = join(WS, "manga/Blue Period");
  rmSync(join(WS, "manga"), { recursive: true, force: true });
  mkdirSync(series, { recursive: true });
  writeFileSync(join(series, "Chapter 10.cbz"), cbz([["p1.png", png(200), true]]));
  writeFileSync(join(series, "Chapter 9.cbz"), cbz([["p10.png", png(30), true], ["p2.png", png(90), false], ["p1.png", png(10), true], ["__MACOSX/p1.png", png(0), false]]));
});
test.afterAll(() => { rmSync(PLUGIN, { recursive: true, force: true }); rmSync(join(WS, "manga"), { recursive: true, force: true }); });

test("a chapter's pen ink: beside it (a folder's too), its strokes drawn at the picture's size", async () => {
  const view = "../../plugins/beta/manga/view.js";
  const { inkPath, inkPaths } = (await import(view)) as { inkPath(ch: string): string; inkPaths(s: number[][] | undefined, w: number, h: number): { d: string; width: number }[] };
  expect(inkPath("manga/One/ch 1.cbz")).toBe("manga/One/ch 1.cbz.ink.json"); // as the app's PageInk.file
  expect(inkPath("manga/One/ch 2/")).toBe("manga/One/ch 2.ink.json");
  expect(inkPaths([[0.002, 0.1, 0.2, 0.5, 0.2, 0.5, 0.9]], 1000, 1500)).toEqual([{ d: "M100 300L500 300L500 1350", width: 2, color: "#000", opacity: 1 }]);
  // the app's highlighter and colours (InkStore): an object with its points
  expect(inkPaths([{ w: 0.014, color: "#d32f2f", opacity: 0.4, pts: [0.1, 0.2, 0.5, 0.2] }] as never, 1000, 1500))
    .toEqual([{ d: "M100 300L500 300", width: 14, color: "#d32f2f", opacity: 0.4 }]);
  expect(inkPaths([[0.002, 0.1, 0.2]], 1000, 1500)).toEqual([]); // a single point is no stroke
  expect(inkPaths(undefined, 10, 10)).toEqual([]);
});

test("manga: the library, a series, a .cbz read in the page, and where you are saved for the phone too", async ({ page }) => {
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push(e.message));
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("F1");
  await page.keyboard.type("Manga: library");
  await page.getByTestId("palette").getByText("Manga: library", { exact: true }).first().click();
  const pane = page.locator(".manga");
  const card = pane.locator(".m-card", { hasText: "Blue Period" });
  await expect(card.locator(".m-badge")).toHaveText("2"); // two chapters, none read
  await expect(card.locator("img")).toHaveAttribute("src", /^blob:/); // the cover: chapter 9's first page
  await page.screenshot({ path: test.info().outputPath("library.png") });
  await card.click();
  // natural order: 9 before 10
  await expect(pane.locator(".m-ch .m-ch-name")).toHaveText(["Chapter 9", "Chapter 10"]);
  await pane.getByRole("button", { name: "Start" }).click();
  await expect(pane.locator(".m-num")).toHaveText("1 / 3"); // three pictures: __MACOSX left out
  await expect(pane.locator(".m-page")).toHaveAttribute("src", /^blob:/);
  // right to left (the default): ← goes on; past the last page, the next chapter
  await page.keyboard.press("ArrowLeft");
  await expect(pane.locator(".m-num")).toHaveText("2 / 3");
  // where you are: the series' note (one note per thing), no reading.json
  const note = join(WS, "manga/Blue Period/Blue Period.md");
  const prop = (k: string) => {
    const m = existsSync(note) ? new RegExp(`^${k}: (.*)$`, "m").exec(readFileSync(note, "utf8")) : null;
    return m ? m[1].replace(/^'(.*)'$/, "$1").replace(/''/g, "'").replace(/^"(.*)"$/, "$1") : undefined;
  };
  const progress = () => JSON.parse(prop("chapter_progress") ?? "{}");
  await expect.poll(() => [prop("reading_chapter"), prop("reading_page"), progress()["Chapter 9.cbz"]]).toEqual(["Chapter 9.cbz", "1", 1]);
  expect(existsSync(join(WS, "manga/Blue Period/reading.json"))).toBe(false);
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await expect(pane.locator(".m-num")).toHaveText("1 / 1");
  await expect.poll(() => [prop("reading_chapter"), progress()]).toEqual(["Chapter 10.cbz", { "Chapter 9.cbz": "read", "Chapter 10.cbz": "read" }]);
  // back to the series: both read, "Read again"
  await page.keyboard.press("Escape");
  await expect(pane.getByRole("button", { name: "Read again" })).toBeVisible();
  await expect(pane.locator(".m-count")).toContainText("all read");
  await page.screenshot({ path: test.info().outputPath("series.png") });
  // a right-click marks a chapter unread again (Mihon's long press)
  await pane.locator(".m-ch", { hasText: "Chapter 10" }).click({ button: "right" });
  await expect(pane.getByRole("button", { name: "Continue" })).toBeVisible();
  await expect.poll(() => progress()["Chapter 10.cbz"]).toBeUndefined(); // unread, from its first page
  expect(errs).toEqual([]);
});

test("manga on e-ink: a refresh asked on each page turn (flash_every = 1)", async ({ page }) => {
  await page.route("**/api/config", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const res = await route.fetch(), body = await res.json();
    body.config.ui.eink = "on";
    body.config.ui.eink_refresh = "manual"; // only the reader's own refreshes
    await route.fulfill({ response: res, json: body });
  });
  await page.addInitScript(() => {
    // every refresh the reader asks for (eink.ts keeps at most one every 5 s, calm: no flash to see in a browser)
    (window as unknown as { flashes: number }).flashes = 0;
    document.addEventListener("atlas-eink-refresh", () => { (window as unknown as { flashes: number }).flashes++; });
  });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("F1");
  await page.keyboard.type("Manga: library");
  await page.getByTestId("palette").getByText("Manga: library", { exact: true }).first().click();
  const pane = page.locator(".manga");
  await pane.locator(".m-card", { hasText: "Blue Period" }).click();
  await pane.locator(".m-ch", { hasText: "Chapter 9" }).click();
  await expect(pane.locator(".m-num")).toHaveText(/^\d \/ 3$/);
  const flashes = () => page.evaluate(() => (window as unknown as { flashes: number }).flashes);
  await page.waitForTimeout(500); // past the refresh of the chapter's first page
  const before = await flashes();
  await page.keyboard.press("ArrowLeft"); // right to left: ← turns on
  await page.waitForTimeout(300);
  await page.keyboard.press("ArrowLeft");
  await expect.poll(flashes).toBeGreaterThanOrEqual(before + 2);
  await expect(pane.locator(".m-num")).toHaveText("3 / 3");
  // taps, right to left: the right third goes back, the middle shows the bar, a tap then only puts it away
  const reader = pane.locator(".m-reader"), box = (await reader.boundingBox())!;
  await reader.click({ position: { x: box.width * 0.9, y: box.height / 2 } });
  await expect(pane.locator(".m-num")).toHaveText("2 / 3");
  await reader.click({ position: { x: box.width / 2, y: box.height / 2 } });
  await expect(pane.locator(".m-over")).toHaveClass(/\bon\b/);
  await reader.click({ position: { x: box.width * 0.9, y: box.height / 2 } });
  await expect(pane.locator(".m-over")).not.toHaveClass(/\bon\b/);
  await expect(pane.locator(".m-num")).toHaveText("2 / 3");
});

// The user's Suwayomi (plugins/beta/manga/suwayomi.js; its GraphQL API as a real server answers it): a
// stand-in server with one series of two chapters; its library beside the vault's, a chapter read from it page by page,
// where you are written back with updateChapter, and the Libraries page's Comics listing both.
test("Suwayomi: its library beside the vault's, a chapter read from it, where you are written back", async ({ page, request }) => {
  const marks: { id: number; page: number; read: boolean }[] = [];
  const server: Server = createServer((req, res) => {
    const url = req.url ?? "";
    // the cover as JPEG XL, as some sources serve it: no browser here decodes it, so it shows only through the core's
    // thumbnail (WebKit's decoder could hang the page on one)
    if (url.includes("thumbnail")) { res.writeHead(200, { "content-type": "image/jxl" }); res.end(readFileSync(new URL("../../crates/atlas-android/tests/fixtures/tiny.jxl", import.meta.url))); return; }
    if (url.startsWith("/api/v1/")) { res.writeHead(200, { "content-type": "image/png" }); res.end(png(60)); return; }
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const { query, variables } = JSON.parse(body) as { query: string; variables: Record<string, unknown> };
      const data = query.includes("mangas(") ? { mangas: { nodes: [{ id: 6, title: "BLAME!", thumbnailUrl: "/api/v1/manga/6/thumbnail", user: { unreadCount: 2 } }] } }
        : query.includes("chapters(") ? { chapters: { nodes: [
          { id: 9597, name: "Chapter 001 - The Net's Offspring", user: { isRead: false, lastPageRead: 0, lastReadAt: "0" } },
          { id: 9598, name: "Chapter 002 - Fifteen Billion", user: { isRead: false, lastPageRead: 0, lastReadAt: "0" } }] } }
        : query.includes("fetchChapterPages") ? { fetchChapterPages: { pages: ["/api/v1/manga/6/chapter/1/page/0", "/api/v1/manga/6/chapter/1/page/1", "/api/v1/manga/6/chapter/1/page/2"] } }
        : query.includes("updateChapter") ? (marks.push(variables as never), { updateChapter: { chapter: { id: variables.id } } }) : null;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(data ? { data } : { errors: [{ message: "unknown query" }] }));
    });
  });
  await new Promise<void>((r) => server.listen(7743, "127.0.0.1", r));
  await request.put("/api/file", { headers: { "x-atlas": "1" }, data: { path: ".atlas/plugin-settings/manga.toml", text: 'suwayomi = "http://127.0.0.1:7743"\n' } });
  try {
    await page.goto("/");
    await page.getByText("Finish the GW notes.").waitFor();
    await page.keyboard.press("F1");
    await page.keyboard.type("Manga: library");
    await page.getByTestId("palette").getByText("Manga: library", { exact: true }).first().click();
    const pane = page.locator(".manga");
    await expect(pane.locator(".m-card", { hasText: "Blue Period" })).toBeVisible(); // the vault's
    const blame = pane.locator(".m-card", { hasText: "BLAME!" });
    await expect(blame.locator(".m-badge")).toHaveText("2"); // the server's unread count
    await expect(blame.locator("img")).toHaveAttribute("src", /^blob:/); // its cover, from the server
    await expect.poll(() => blame.locator("img").evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(3); // decoded: PNG by now
    await blame.click();
    await expect(pane.locator(".m-ch .m-ch-name")).toHaveText(["Chapter 001 - The Net's Offspring", "Chapter 002 - Fifteen Billion"]);
    await pane.getByRole("button", { name: "Start" }).click();
    await expect(pane.locator(".m-num")).toHaveText("1 / 3");
    await expect(pane.locator(".m-page")).toHaveAttribute("src", /^blob:/);
    await page.keyboard.press("ArrowLeft");
    await expect(pane.locator(".m-num")).toHaveText("2 / 3");
    await expect.poll(() => marks.at(-1)).toEqual({ id: 9597, page: 1, read: false }); // where you are, on the server

    // the Libraries page: Comics, the vault's and the server's
    await page.keyboard.press("F1");
    await page.keyboard.type("Libraries");
    await page.getByTestId("palette").getByText("Libraries (drawings, references, films, comics…)").click();
    const libs = page.locator(".libraries");
    await libs.getByRole("tab", { name: "Comics" }).click();
    await expect(libs.locator(".library .t", { hasText: "BLAME!" })).toBeVisible();
    await expect(libs.locator(".library .t", { hasText: "Blue Period" })).toBeVisible();
  } finally {
    await request.put("/api/file", { headers: { "x-atlas": "1" }, data: { path: ".atlas/plugin-settings/manga.toml", text: "" } });
    server.close();
  }
});

// On the phone only the reader is the app's: the Libraries page shows the plugin's own Comics, and a chapter goes to the app by atlas.openNative.
test("on the phone the library is the page's, and a chapter is handed to the app's reader", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 412, height: 760 }, hasTouch: true });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    const w = window as unknown as { AtlasNative: unknown; opened: string[] };
    w.opened = [];
    w.AtlasNative = { ready() {}, tabs() {}, nativeOpens: (p: string) => String(p.endsWith(".cbz")), openNative: (p: string) => w.opened.push(p) };
  });
  await page.goto("/");
  await page.waitForFunction(() => "atlasShell" in window);
  await page.evaluate(() => (window as unknown as { atlasShell: { view(k: string): void } }).atlasShell.view("libraries"));
  const tabs = page.locator(".libraries .which");
  await expect(tabs.getByRole("tab")).not.toHaveText([/↗/]); // no tab leaves the page for a native library
  await tabs.getByRole("tab", { name: /Comics/ }).click();
  await page.locator(".libraries .card", { hasText: "Blue Period" }).click();
  await page.locator(".libraries .detail").getByRole("button", { name: "Read" }).click();
  const pane = page.locator(".manga");
  await pane.getByRole("button", { name: /Start|Continue|Read again/ }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { opened: string[] }).opened)).toEqual([expect.stringMatching(/^manga\/Blue Period\/Chapter (9|10)\.cbz$/)]);
  await expect(pane.locator(".m-reader")).toHaveCount(0); // not read in the page as well
  await ctx.close();
});

test("a Suwayomi error is one line, and a source gone says what to do", () => {
  // a capture from a phone: the reader showed Suwayomi's whole Java stack trace
  const trace = "Exception while fetching data (/fetchChapterPages) : Source not installed: 1998944621602463790\n\nsuwayomi.tachidesk.manga.impl.util.source.StubSource$SourceNotInstalledException: Source not installed: 1998944621602463790\n\tat suwayomi.tachidesk.manga.impl.util.source.StubSource.getPageList(StubSource.kt:65)";
  expect(said(trace)).toBe("this series' source is not installed in Suwayomi (source 1998944621602463790): install its extension in Suwayomi's Extensions, or migrate the series to another source");
  expect(said("Exception while fetching data (/x) : boom\n\tat a.B.c(B.kt:1)")).toBe("Suwayomi: Exception while fetching data (/x) : boom");
});
