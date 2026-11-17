import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { WS } from "../playwright.config";
import { openFile } from "./open";

// Video on the desktop (docs/design/DESIGN-video-player.md): a time link to a video of the vault starts it in mpv at
// that time, a second time link to what plays seeks it, and "Player: insert the time" writes the link back into the
// note. mpv itself stands behind `/api/player/mpv` here (the core's mpv.rs is tested against the real mpv in Rust):
// the page's engine is what this checks — the commands it sends, the state it shows.
const H = { "x-atlas": "1" };
const NOTE = "notes/watching.md";
const cfg = async (request: APIRequestContext) => (await (await request.get("/api/config", { headers: H })).json()).config;
const noteText = async (request: APIRequestContext) => (await (await request.get(`/api/file?path=${encodeURIComponent(NOTE)}`, { headers: H })).json()).text as string;

test.describe.configure({ mode: "serial" });

/** mpv stands behind its route: what the page sent, and a film that plays from `at`. */
async function fakeMpv(page: Page) {
  const sent: { cmd: string; [k: string]: unknown }[] = [];
  const st = { at: 0, playing: false };
  await page.route("**/api/player/mpv", async (r) => {
    if (r.request().method() === "POST") {
      const c = r.request().postDataJSON();
      sent.push(c);
      if (c.cmd === "play") { st.at = c.at; st.playing = true; }
      if (c.cmd === "seek") st.at = c.at;
      if (c.cmd === "pause" || c.cmd === "close") st.playing = false;
      if (c.cmd === "resume") st.playing = true;
      return r.fulfill({ status: 200, contentType: "application/json", body: "null" });
    }
    return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ running: true, at: st.at, duration: 5400, playing: st.playing, speed: 1, ended: false, sub_text: "", error: "" }) });
  });
  return { sent, st };
}

test.beforeAll(async ({ request }) => {
  writeFileSync(join(WS, "film.mkv"), Buffer.alloc(16)); // never played: mpv is faked
  await request.put("/api/file", { headers: H, data: { path: NOTE, text: "# Watching\n\nThe opening [[film.mkv#t=1:00]] and later [[film.mkv#t=2:00]].\n\nNotes: \n" } });
});
test.afterAll(async ({ request }) => {
  rmSync(join(WS, "film.mkv"), { force: true });
  await request.delete(`/api/file?path=${encodeURIComponent(NOTE)}`, { headers: H }).catch(() => {});
});

test("a time link plays a vault video in mpv from there, seeks it, and the time goes back into the note", async ({ page, request }) => {
  const { sent } = await fakeMpv(page);
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await openFile(page, "watching.md");
  await expect(page.locator(".cm-content")).toContainText("Watching");

  await page.locator(".cm-content .cm-hmd-internal-link", { hasText: "t=1:00" }).first().click();
  await expect.poll(() => sent.find((c) => c.cmd === "play")).toMatchObject({ cmd: "play", tracks: [{ file: "film.mkv" }], at: 60 });
  const cell = page.getByTestId("now-playing");
  await expect(cell).toContainText("film.mkv");
  await expect(cell.getByRole("button", { name: "Pause" })).toBeVisible();
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await cell.screenshot({ path: `test-results/player-video-cell-${scheme}.png` });
  }

  // the same thing playing: a link seeks it, nothing else starts
  await page.locator(".cm-content .cm-hmd-internal-link", { hasText: "t=2:00" }).first().click();
  await expect.poll(() => sent.filter((c) => c.cmd === "seek").at(-1)).toEqual({ cmd: "seek", at: 120 });
  expect(sent.filter((c) => c.cmd === "play")).toHaveLength(1);

  // the time, written where the caret is
  await page.locator(".cm-content").getByText("Notes:").click();
  await page.keyboard.press("End");
  await expect.poll(async () => (await cell.textContent()) ?? "").toContain("2:00");
  await page.keyboard.press("Meta+Alt+t");
  await expect.poll(async () => (await (await request.get(`/api/file?path=${encodeURIComponent(NOTE)}`, { headers: H })).json()).text, { timeout: 15_000 })
    .toContain("Notes: [[film.mkv#t=2:00]]");

  await cell.getByRole("button", { name: "Pause" }).click();
  await expect.poll(() => sent.at(-1)?.cmd).toBe("pause");
});

// `[player] stamp_lines` and `pause_on_type`: a line started while the film plays begins with its time, and typing
// pauses the film, which plays on `resume_after` seconds after the last key.
test("while a film plays, a new line starts with its time and typing pauses it until the keys stop", async ({ page, request }) => {
  const before = await cfg(request);
  await request.put("/api/config", { headers: H, data: { ...before, player: { pause_on_type: true, resume_after: 1, stamp_lines: true } } });
  try {
    const { sent } = await fakeMpv(page);
    await page.goto("/");
    await page.getByText("Finish the GW notes.").waitFor();
    await openFile(page, "watching.md");
    await page.locator(".cm-content .cm-hmd-internal-link", { hasText: "t=1:00" }).first().click();
    await expect(page.getByTestId("now-playing").getByRole("button", { name: "Pause" })).toBeVisible();

    await page.locator(".cm-content").getByText("Notes:").click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("x");
    await expect.poll(() => noteText(request), { timeout: 15_000 }).toMatch(/\n\[\[film\.mkv#t=1:0\d\]\] x/);
    // the key paused it; a second later it plays on by itself
    await expect.poll(() => sent.map((c) => c.cmd)).toContain("pause");
    await expect.poll(() => sent.map((c) => c.cmd), { timeout: 5_000 }).toContain("resume");
  } finally {
    await request.put("/api/config", { headers: H, data: before });
  }
});
