import { test, expect, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { WS } from "../playwright.config";

// Live drawing: two windows on one drawing; each says who else is there, and a stroke made in
// one reaches the other's scene while it draws nothing (lib/draw-live.ts, core live.rs).
const PATH = "notes/drawings/live-shared.excalidraw";

async function open(page: Page): Promise<void> {
  await page.route("**/api/config", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const res = await route.fetch(), body = await res.json();
    body.config.draw = { ...(body.config.draw ?? {}), notepad: false }; // plain Excalidraw
    await route.fulfill({ response: res, json: body });
  });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Control+p");
  await page.keyboard.type("live-shared");
  await expect(page.getByTestId("palette").getByText(/live-shared/).first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator(".draw-pane canvas.interactive")).toBeVisible({ timeout: 15_000 });
}

test("two windows on one drawing: each sees the other, and a stroke made in one arrives in the other", async ({ page, context }) => {
  test.setTimeout(90_000);
  mkdirSync(join(WS, "notes/drawings"), { recursive: true });
  writeFileSync(join(WS, PATH), JSON.stringify({ type: "excalidraw", version: 2, elements: [], appState: {}, files: {} }));
  const other = await context.newPage();
  await open(page);
  await open(other);
  await expect(page.locator(".draw-pane .live")).toHaveText(/Live · desktop/, { timeout: 10_000 });
  await expect(other.locator(".draw-pane .live")).toHaveText(/Live · desktop/, { timeout: 10_000 });

  const host = (p: Page) => p.locator(".draw-pane .host");
  const before = await host(other).getAttribute("data-scene-version");
  // a rectangle drawn in the first window
  const canvas = page.locator(".draw-pane canvas.interactive");
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + box.width - 80, box.y + box.height - 120);
  await page.keyboard.press("r");
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await page.mouse.move(cx - 100, cy - 60);
  await page.mouse.down();
  await page.mouse.move(cx + 120, cy + 80, { steps: 6 });
  await page.mouse.up();
  // the second window's scene moves on although nothing was drawn there
  await expect.poll(() => host(other).getAttribute("data-scene-version"), { timeout: 10_000 }).not.toBe(before);
  // a stroke shows on the other window while it is being drawn, before the pen lifts (as on a drawing tablet)
  const mid = await host(other).getAttribute("data-scene-version");
  await page.keyboard.press("Escape");
  await page.keyboard.press("p"); // the pen (freedraw)
  await page.mouse.move(cx - 150, cy + 100);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(cx - 150 + i * 15, cy + 100 + (i % 3) * 8);
  await expect.poll(() => host(other).getAttribute("data-scene-version"), { timeout: 5_000 }).not.toBe(mid);
  await page.mouse.up();
  // the first one leaves: the second says so
  await page.close();
  await expect(other.locator(".draw-pane .live")).toHaveCount(0, { timeout: 10_000 });
});

// A device already in the room that has said nothing (the Boox, its catch-up missed) still gets this window's strokes:
// "unheard" devices count as others (lib/live.ts).
test("a silent device that was there first still gets the strokes", async ({ page, context }) => {
  test.setTimeout(60_000);
  mkdirSync(join(WS, "notes/drawings"), { recursive: true });
  writeFileSync(join(WS, PATH), JSON.stringify({ type: "excalidraw", version: 2, elements: [], appState: {}, files: {} }));
  // the "Boox": a bare socket in the room (from a page of the app, for its origin) that never says anything
  const boox = await context.newPage();
  await boox.goto("/");
  await boox.evaluate((path) => new Promise<void>((ok, bad) => {
    const w = window as unknown as { got: string[] };
    w.got = [];
    const ws = new WebSocket(`${location.origin.replace(/^http/, "ws")}/api/live?path=${encodeURIComponent(path)}&name=Boox`);
    ws.onmessage = (e) => { const d = JSON.parse(String(e.data)); if (d.m?.t) w.got.push(d.m.t); };
    ws.onopen = () => ok();
    ws.onerror = () => bad(new Error("no live room"));
  }), PATH);
  await open(page);
  const canvas = page.locator(".draw-pane canvas.interactive");
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + box.width - 80, box.y + box.height - 120);
  await page.keyboard.press("r");
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await page.mouse.move(cx - 100, cy - 60);
  await page.mouse.down();
  await page.mouse.move(cx + 120, cy + 80, { steps: 6 });
  await page.mouse.up();
  await expect.poll(() => boox.evaluate(() => (window as unknown as { got: string[] }).got.includes("els")), { timeout: 10_000 }).toBe(true);
});

// Another device's save that adds a picture (a PDF page or a photo put in on the Boox): merged in with its picture, not
// an empty frame until a reload (draw-excalidraw.ts merge).
test("a save from elsewhere that adds a picture brings the picture", async ({ page }) => {
  test.setTimeout(60_000);
  mkdirSync(join(WS, "notes/drawings"), { recursive: true });
  writeFileSync(join(WS, PATH), JSON.stringify({ type: "excalidraw", version: 2, elements: [], appState: {}, files: {} }));
  await open(page);
  const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const image = { id: "boox-image-1", type: "image", x: 10, y: 10, width: 100, height: 100, angle: 0, strokeColor: "transparent", backgroundColor: "transparent",
    fillStyle: "solid", strokeWidth: 1, strokeStyle: "solid", roughness: 0, opacity: 100, groupIds: [], frameId: null, roundness: null, seed: 1, version: 2,
    versionNonce: 2, isDeleted: false, boundElements: null, updated: Date.now(), link: null, locked: false, status: "saved", fileId: "boox-file-1", scale: [1, 1] };
  writeFileSync(join(WS, PATH), JSON.stringify({ type: "excalidraw", version: 2, elements: [image], appState: {},
    files: { "boox-file-1": { id: "boox-file-1", mimeType: "image/png", dataURL: png, created: Date.now() } } }));
  await expect(page.locator(".draw-pane .host")).toHaveAttribute("data-files", "1", { timeout: 10_000 });
});
