import { test, expect } from "@playwright/test";
import { deflateSync } from "node:zlib";
import { openFile } from "./open";

// The image pane (panes/Image.svelte) with a big picture: a long screenshot opens at its width from its top, the wheel
// scrolls down it, and no pan takes it out of the frame — the wheel used to push a picture off into the empty
// checkerboard, and a tall one opened shrunk to a sliver.
const H = { "x-atlas": "1" };

/** A grey PNG of w × h, written here (no fixture file): 8-bit greyscale, one filter byte per row. */
function png(w: number, h: number): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 0; // 8 bits, greyscale
  const rows = Buffer.alloc((w + 1) * h, 0x80);
  for (let y = 0; y < h; y++) rows[y * (w + 1)] = 0; // filter: none
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]);
}

test("a long picture opens at its width from the top; the wheel scrolls it and stops at its end", async ({ page, request }) => {
  expect((await request.put("/api/raw?path=pictures/long-shot.png", { headers: H, data: png(400, 6000) })).ok()).toBe(true);
  await page.goto("/");
  await openFile(page, "long-shot.png");
  const frame = page.locator(".image-pane");
  const img = frame.locator("img");
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)).toBe(400);
  const box = async () => {
    const [f, i] = [await frame.boundingBox(), await img.boundingBox()];
    return { top: i!.y - f!.y, bottom: i!.y + i!.height - (f!.y + f!.height), width: i!.width, frame: f!.width };
  };
  // its width (at most 100 %), its top at the frame's top: readable, not a sliver
  const first = await box();
  expect(first.width).toBeGreaterThan(Math.min(400, first.frame - 48) - 2);
  expect(first.top).toBeGreaterThanOrEqual(0);
  expect(first.top).toBeLessThan(40);
  // the wheel scrolls down it
  await frame.hover();
  await page.mouse.wheel(0, 600);
  await expect.poll(async () => (await box()).top).toBeLessThan(first.top - 300);
  // far past its end: its bottom stops at the frame's bottom, never above it
  for (let i = 0; i < 20; i++) await page.mouse.wheel(0, 2000);
  await expect.poll(async () => (await box()).bottom).toBeGreaterThan(-40);
  expect((await box()).bottom).toBeLessThanOrEqual(1);
  // and back up past its start: its top stops at the frame's top
  for (let i = 0; i < 20; i++) await page.mouse.wheel(0, -2000);
  await expect.poll(async () => (await box()).top).toBeGreaterThanOrEqual(0);
  expect((await box()).top).toBeLessThan(40);
  await request.post(`/api/fs/trash?path=${encodeURIComponent("pictures/long-shot.png")}`, { headers: H });
});
