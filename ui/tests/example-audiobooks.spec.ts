import { test, expect, type APIRequestContext } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// The Audiobooks plugin (plugins/beta/audiobooks; docs/design/DESIGN-audiobooks.md) against a stand-in Audiobookshelf:
// the library in the Libraries page, a book opened in the player, its audio played through the core (`atlas.media`:
// the token added by the core, the page holding only a /media/<ticket> address), where you are synced on pause.
const H = { "x-atlas": "1" };
const DIR = ".atlas/plugins/audiobooks";
const put = (r: APIRequestContext, path: string, text: string) => r.put("/api/file", { headers: H, data: { path, text } });
const src = (f: string) => readFileSync(fileURLToPath(new URL(`../../plugins/beta/audiobooks/${f}`, import.meta.url)), "utf8");

/** One second of silence, 8 kHz mono 16-bit: something a media element plays. */
function wav(): Buffer {
  const n = 8000, data = Buffer.alloc(n * 2), h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVE", 8); h.write("fmt ", 12); h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(8000, 24); h.writeUInt32LE(16000, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

let server: Server;
let port = 0;
const seen: { method: string; path: string; auth: string; body: string }[] = [];

test.beforeAll(async ({ request }) => {
  const audio = wav();
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const path = req.url ?? "";
      seen.push({ method: req.method ?? "", path, auth: String(req.headers.authorization ?? ""), body });
      const json = (o: unknown) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
      if (req.headers.authorization !== "Bearer tok-abs") { res.writeHead(401); res.end(); return; }
      if (path === "/api/libraries") return json({ libraries: [{ id: "L1", name: "Books", mediaType: "book" }] });
      if (path.startsWith("/api/libraries/L1/items")) return json({ results: [{ id: "I1", media: { duration: 1, metadata: { title: "The Quiet Hour", authorName: "A. Writer", narratorName: "N. Reader" } } }] });
      if (path === "/api/me") return json({ mediaProgress: [{ libraryItemId: "I1", progress: 0.25, currentTime: 0.25, isFinished: false, lastUpdate: 1 }] });
      if (path === "/api/items/I1/play") return json({ id: "S1", duration: 1, currentTime: 0.25, displayTitle: "The Quiet Hour", displayAuthor: "A. Writer",
        audioTracks: [{ contentUrl: "/api/items/I1/file/1", startOffset: 0, duration: 1, mimeType: "audio/wav" }], chapters: [{ start: 0, end: 1, title: "One" }] });
      if (path === "/api/items/I1/file/1") { res.writeHead(200, { "content-type": "audio/wav", "content-length": String(audio.length), "accept-ranges": "bytes" }); res.end(audio); return; }
      if (path.startsWith("/api/session/S1/")) return json({});
      res.writeHead(404); res.end();
    });
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", () => ok()));
  port = (server.address() as { port: number }).port;
  for (const f of ["main.js", "view.js", "abs.js"]) await put(request, `${DIR}/${f}`, src(f));
  await put(request, `${DIR}/plugin.toml`, `${src("plugin.toml")}\n[settings]\nserver = "http://127.0.0.1:${port}"\n`);
  await put(request, ".atlas/plugin-settings/audiobooks.toml", "");
  await request.put(`/api/plugins/audiobooks/secrets/token`, { headers: H, data: { value: "tok-abs" } });
});
test.afterAll(async ({ request }) => {
  server?.close();
  await put(request, `${DIR}/main.js`, "export function register() {}\n");
});

test("Audiobooks: the server's books in the library, one played through the core with its token, where you are synced", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("F1");
  await page.keyboard.type("Libraries");
  await page.getByTestId("palette").getByText(/^Libraries/).first().click();
  const libs = page.locator(".libraries");
  await libs.getByRole("tab", { name: "Audiobooks" }).click();
  await libs.locator(".library .t", { hasText: "The Quiet Hour" }).click();
  await libs.getByRole("button", { name: "Go on listening" }).click();

  const player = page.locator(".abs-player");
  await expect(player.locator(".abs-title")).toHaveText("The Quiet Hour");
  await expect(player.locator(".abs-chapters li")).toHaveCount(1);
  const audioSrc = await player.locator("audio").evaluate((a: HTMLAudioElement) => a.src);
  expect(audioSrc).toMatch(/\/media\/[0-9a-f]{32}$/);
  expect(audioSrc).not.toContain("tok-abs");
  // the page's request for it: answered with the server's bytes, the token added by the core
  const got = await page.evaluate(async (u) => { const r = await fetch(u, { headers: { range: "bytes=0-" } }); return [r.status, (await r.arrayBuffer()).byteLength]; }, audioSrc);
  expect(got[0]).toBeLessThan(300);
  expect(got[1]).toBeGreaterThan(1000);
  expect(seen.some((s) => s.path === "/api/items/I1/file/1" && s.auth === "Bearer tok-abs")).toBe(true);

  // play, pause: where you are goes back to the server
  await player.getByRole("button", { name: "Play" }).click();
  await page.waitForTimeout(400);
  await player.getByRole("button", { name: "Pause" }).click();
  await expect.poll(() => seen.filter((s) => s.path === "/api/session/S1/sync").length).toBeGreaterThan(0);
  const sync = JSON.parse(seen.filter((s) => s.path === "/api/session/S1/sync").at(-1)!.body);
  expect(sync.currentTime).toBeGreaterThanOrEqual(0.25);
  expect(sync.duration).toBe(1);
});
