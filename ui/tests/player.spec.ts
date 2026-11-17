import { test, expect } from "@playwright/test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { WS } from "../playwright.config";
import { chapterAt, clockOf, nextChapter, placeOf, previousChapter, timeOfFragment } from "../src/lib/player-time";

// The app's one player (`atlas.player`, lib/player.svelte.ts): a plugin plays its audio outside any pane, the lower
// bar shows what plays and pauses it, and where you are is reported to the plugin's `[media] progress` helper method —
// whose answer may replace the item's key (Audiobookshelf: a new play session). The phone's MediaService needs the
// device; its arithmetic is PlayerTimeline.java's, tested on the JVM with the same cases as the first test here.
const H = { "x-atlas": "1" };
const DIR = ".atlas/plugins/tape";
const TOML = `title = "Tape"\napi = 29\n\n[helper]\njs = "helper.js"\n\n[media]\nprogress = "progress"\n`;
// each report appended to a file of the vault; the answer's key counts them
const HELPER = `atlas.methods({
  progress: async (p) => {
    let seen = "";
    try { seen = await atlas.read("tape-reports.txt"); } catch {}
    await atlas.write("tape-reports.txt", seen + JSON.stringify({ key: p.key, at: p.at, state: p.state, listened: p.listened }) + "\\n");
    return { key: { n: (p.key?.n ?? 0) + 1 } };
  },
});
`;
const MAIN = `export function register(atlas) {
  atlas.registerCommand({ id: "play", title: "Tape: play", run: async () => atlas.player.play({
    key: { n: 0 }, title: "The Tape", author: "Nobody",
    tracks: [{ src: await atlas.fileUrl("tape/a.wav"), start: 0, duration: 2 }, { src: await atlas.fileUrl("tape/b.wav"), start: 2, duration: 2 }],
    chapters: [{ start: 0, end: 2, title: "Side A" }, { start: 2, end: 4, title: "Side B" }], at: 0.5,
  }) });
}
`;

/** `seconds` of silence as a WAV (8 kHz, 16-bit mono): a file the browser plays. */
function wav(seconds: number): Buffer {
  const n = 8000 * seconds, b = Buffer.alloc(44 + n * 2);
  b.write("RIFF", 0); b.writeUInt32LE(36 + n * 2, 4); b.write("WAVE", 8); b.write("fmt ", 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(8000, 24); b.writeUInt32LE(16000, 28);
  b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write("data", 36); b.writeUInt32LE(n * 2, 40);
  return b;
}

test.beforeAll(async ({ request }) => {
  for (const [path, text] of [["helper.js", HELPER], ["main.js", MAIN], ["plugin.toml", TOML]])
    await request.put("/api/file", { headers: H, data: { path: `${DIR}/${path}`, text } });
  mkdirSync(join(WS, "tape"), { recursive: true });
  for (const f of ["a", "b"]) writeFileSync(join(WS, `tape/${f}.wav`), wav(2));
  rmSync(join(WS, "tape-reports.txt"), { force: true });
});
test.afterAll(async ({ request }) => {
  await request.post("/api/plugins/tape/remove", { headers: H });
  rmSync(join(WS, "tape"), { recursive: true, force: true });
  rmSync(join(WS, "tape-reports.txt"), { force: true });
});

test("the time arithmetic: tracks laid over the item, chapters, previous and next", () => {
  const tracks = [{ src: "", start: 0, duration: 100 }, { src: "", start: 100, duration: 50 }];
  expect(placeOf(tracks, 0)).toEqual({ i: 0, offset: 0 });
  expect(placeOf(tracks, 99.5)).toEqual({ i: 0, offset: 99.5 });
  expect(placeOf(tracks, 100)).toEqual({ i: 1, offset: 0 }); // a track's start is that track's
  expect(placeOf(tracks, 150)).toEqual({ i: 1, offset: 50 }); // past the end: the last track's end
  expect(placeOf(tracks, -5)).toEqual({ i: 0, offset: 0 });
  const ch = [{ start: 0, end: 60, title: "1" }, { start: 60, end: 120, title: "2" }];
  expect([chapterAt(ch, 59.9), chapterAt(ch, 60), chapterAt(ch, 500)]).toEqual([0, 1, -1]);
  expect(previousChapter(ch, 70)).toBe(60); // past 3 s in: this chapter's start
  expect(previousChapter(ch, 62)).toBe(0); // within its first 3 s: the one before
  expect(previousChapter(ch, 1)).toBe(0);
  expect([nextChapter(ch, 10), nextChapter(ch, 70)]).toEqual([60, null]);
  expect([clockOf(3725), clockOf(65), clockOf(3725, true), clockOf(600, true)]).toEqual(["1:02:05", "1:05", "1h 02m", "10m"]);
});

test("a time link's fragment: h:mm:ss, m:ss, seconds; anything else names no time", () => {
  expect(timeOfFragment("t=1:02:03")).toBe(3723);
  expect(timeOfFragment("t=4:07")).toBe(247);
  expect(timeOfFragment("t=83.5")).toBe(83.5);
  expect(timeOfFragment(" t=0:00:09 ")).toBe(9);
  for (const no of ["", "t=", "Heading", "t=1:2:3:4", "t=abc", "page=3"]) expect(timeOfFragment(no)).toBeNull();
  // what the note commands write reads back as the same second
  for (const t of [0, 59, 61, 3599, 3723, 7322]) expect(timeOfFragment(`t=${clockOf(t)}`)).toBe(t);
});

test("a plugin's audio plays outside any pane: the lower bar shows and pauses it, the plugin hears where you are", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await expect(async () => {
    if (await page.getByTestId("palette").isVisible()) await page.keyboard.press("Escape");
    await page.keyboard.press("F1");
    await page.keyboard.type("Tape: play");
    await page.getByTestId("palette").getByText("Tape: play", { exact: true }).first().click({ timeout: 1000 });
  }).toPass({ timeout: 10_000 });

  const cell = page.getByTestId("now-playing");
  await expect(cell).toContainText("The Tape");
  await expect(cell.getByRole("button", { name: "Pause" })).toBeVisible(); // playing, from 0:00
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme }); // judged in both themes (docs/guides/UI-STYLE.md)
    await cell.screenshot({ path: `test-results/player-cell-${scheme}.png` });
  }
  await cell.getByRole("button", { name: "Pause" }).click();
  await expect(cell.getByRole("button", { name: "Play" })).toBeVisible();

  const reports = async () => {
    let text = "";
    try { text = readFileSync(join(WS, "tape-reports.txt"), "utf8"); } catch { /* none yet */ }
    return text.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
  };
  await expect.poll(async () => (await reports()).map((r) => r.state)).toContain("paused");
  const first = (await reports()).find((r) => r.state === "paused");
  expect(first.key).toEqual({ n: 0 });
  expect(first.at).toBeGreaterThanOrEqual(0.5); // started where it was asked to

  // played on and paused again: the report carries the key the first answer gave
  await cell.getByRole("button", { name: "Play" }).click();
  await expect(cell.getByRole("button", { name: "Pause" })).toBeVisible();
  await cell.getByRole("button", { name: "Pause" }).click();
  await expect.poll(async () => (await reports()).filter((r) => r.state === "paused").length).toBeGreaterThanOrEqual(2);
  const second = (await reports()).filter((r) => r.state === "paused")[1];
  expect(second.key.n).toBeGreaterThanOrEqual(1);
});
