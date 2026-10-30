import { test, expect, type Page } from "@playwright/test";
import { openFile } from "./open";
import { copyFileSync, mkdirSync, readFileSync, existsSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { WS } from "../playwright.config";

// Real fixtures, copied read-only: a drawing converted from the user's Obsidian vault (when the converter output
// exists), and an .rnote in the shape of the user's own (Rnote 0.11: a pen stroke with its pressures), which opens as
// the Excalidraw drawing converted from it (the Rnote plugin, plugins/beta/rnote, installed here as it is).

test.beforeAll(() => {
  mkdirSync(join(WS, "notes/drawings"), { recursive: true });
  mkdirSync(join(WS, "fixtures"), { recursive: true });
  writeRnote();
  const plugin = join(WS, ".atlas/plugins/rnote");
  mkdirSync(plugin, { recursive: true });
  for (const f of ["plugin.toml", "main.js", "view.js", "convert.js"]) copyFileSync(new URL(`../../plugins/beta/rnote/${f}`, import.meta.url), join(plugin, f));
});

test.afterAll(() => rmSync(join(WS, ".atlas/plugins/rnote"), { recursive: true, force: true }));

function writeRnote() {
  const stroke = { brushstroke: { path: { start: { pos: [10, 20], pressure: 0.2 }, segments: [{ lineto: { end: { pos: [60, 80], pressure: 0.6 } } }] },
    style: { smooth: { stroke_width: 4, stroke_color: { r: 0, g: 0, b: 0, a: 1 } } } } };
  const doc = { version: "0.11.0", data: { engine_snapshot: { document: { background: { color: { r: 1, g: 1, b: 1, a: 1 }, pattern: "none" } },
    stroke_components: [{ value: stroke, version: 1 }] } } };
  writeFileSync(join(WS, "notes/drawings/derivation.rnote"), gzipSync(JSON.stringify(doc)));
}

function track(page: Page): { errs: string[]; external: string[] } {
  const errs: string[] = [], external: string[] = [];
  page.on("pageerror", (e) => errs.push(e.message));
  page.on("console", (m) => m.type() === "error" && errs.push(m.text()));
  page.on("response", (r) => r.status() === 404 && errs.push(`404 ${new URL(r.url()).pathname}${new URL(r.url()).search}`)); // which one
  page.on("request", (r) => { const u = new URL(r.url()); if (!["127.0.0.1", "localhost"].includes(u.hostname) && u.protocol.startsWith("http")) external.push(r.url()); });
  return { errs, external };
}

test("New drawing: draw a rectangle, autosave writes .excalidraw + .svg, fonts stay offline", async ({ page }) => {
  const t = track(page);
  // plain Excalidraw, as `draw.notepad = false` gives it (the notepad's look is the default since 65e4fed)
  await page.route("**/api/config", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const res = await route.fetch(), body = await res.json();
    body.config.draw = { ...(body.config.draw ?? {}), notepad: false };
    await route.fulfill({ response: res, json: body });
  });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Meta+Shift+d"); await page.getByTestId("palette").getByText("Infinite canvas", { exact: true }).click(); // the format asked first (draw-new.ts)
  const canvas = page.locator(".draw-pane canvas.interactive");
  await expect(canvas).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("notepad-bar")).toHaveCount(0);
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + box.width - 80, box.y + box.height - 120); // focus the canvas, as a user would
  await page.keyboard.press("r");
  await expect(page.getByRole("radio", { name: "Rectangle" })).toBeChecked();
  // Mid-canvas: a shape tool opens Excalidraw's properties panel on the left edge.
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await page.mouse.move(cx - 100, cy - 60);
  await page.mouse.down();
  await page.mouse.move(cx + 120, cy + 80, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.press("Escape");
  const dir = join(WS, "notes/drawings");
  const file = () => readdirSync(dir).find((f) => f.endsWith(".excalidraw"));
  await expect.poll(() => {
    const f = file();
    if (!f) return 0;
    const scene = JSON.parse(readFileSync(join(dir, f), "utf8"));
    return scene.elements.filter((e: { type: string; isDeleted?: boolean }) => e.type === "rectangle" && !e.isDeleted).length;
  }, { timeout: 10_000 }).toBe(1);
  // no image beside it on a save; on demand it is
  expect(existsSync(join(dir, `${file()}.svg`)), "no SVG written on save").toBe(false);
  await page.keyboard.press("F1");
  await page.keyboard.type("export as SVG");
  await page.getByTestId("palette").getByText("Drawing: export as SVG (beside it)").waitFor();
  await page.keyboard.press("Enter");
  await expect.poll(() => existsSync(join(dir, `${file()}.svg`)) && readFileSync(join(dir, `${file()}.svg`), "utf8").includes("<svg")).toBe(true);
  await page.screenshot({ path: "test-results/excalidraw.png" });
  expect(t.external, "no CDN requests").toEqual([]);
  expect(t.errs).toEqual([]);
});

// The Boox: Android's shared storage reports one mtime after a save and another later, so the next
// autosave looked like someone else's change — "This drawing changed on disk" while drawing. Same text = our write.
test("an mtime that moves under the same content is not a conflict: autosave goes on, no banner", async ({ page }) => {
  const file = join(WS, "notes/drawings/drift.excalidraw");
  writeFileSync(file, JSON.stringify({ type: "excalidraw", version: 2, source: "atlas", elements: [], appState: {}, files: {} }));
  const t = track(page);
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Control+p");
  await page.keyboard.type("drift");
  await expect(page.getByTestId("palette").getByText("drift.excalidraw").first()).toBeVisible();
  await page.keyboard.press("Enter");
  const canvas = page.locator(".draw-pane canvas.interactive");
  await expect(canvas).toBeVisible({ timeout: 15_000 });
  const later = new Date(Date.now() + 5_000);
  utimesSync(file, later, later); // the storage's second opinion of the mtime; the text unchanged
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + box.width - 80, box.y + box.height - 120);
  await page.keyboard.press("r");
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await page.mouse.move(cx - 100, cy - 60);
  await page.mouse.down();
  await page.mouse.move(cx + 120, cy + 80, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.press("Escape");
  await expect.poll(() => JSON.parse(readFileSync(file, "utf8")).elements.filter((e: { type: string }) => e.type === "rectangle").length, { timeout: 10_000 }).toBe(1);
  await expect(page.locator(".draw-pane .banner")).toHaveCount(0);
  expect(t.errs.filter((e) => !e.includes("409")), "a 409 recognised as our own write is the browser's log line only").toEqual([]);
});

test("a drawing converted from the Obsidian vault opens with its strokes", async ({ page }) => {
  const converted = process.env.ATLAS_TEST_DRAWINGS ?? "";
  test.skip(!converted || !existsSync(converted), "set ATLAS_TEST_DRAWINGS to a folder of drawings converted from an Obsidian vault");
  const src = readdirSync(converted).find((f) => f.endsWith(".excalidraw"))!;
  copyFileSync(join(converted, src), join(WS, "notes/drawings/from-vault.excalidraw"));
  const n = JSON.parse(readFileSync(join(converted, src), "utf8")).elements.length;
  expect(n).toBeGreaterThan(5);
  const t = track(page);
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Control+p");
  await page.keyboard.type("from-vault");
  await expect(page.getByTestId("palette").getByText("from-vault.excalidraw").first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator(".draw-pane canvas").first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: "test-results/excalidraw-vault.png" });
  expect(t.external, "no CDN requests").toEqual([]);
  expect(t.errs).toEqual([]);
});

test("an .rnote opens as the Excalidraw drawing converted from it, the strokes' pressure kept and the .rnote left", async ({ page }) => {
  const t = track(page);
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await openFile(page, "derivation.rnote");
  await expect(page.locator(".draw-pane canvas").first()).toBeVisible({ timeout: 15_000 });
  const out = join(WS, "notes/drawings/derivation.excalidraw");
  await expect.poll(() => existsSync(out)).toBe(true);
  const scene = JSON.parse(readFileSync(out, "utf8"));
  const pen = scene.elements.find((e: { type: string }) => e.type === "freedraw");
  expect(pen.pressures).toEqual([0.2, 0.6]);
  expect(pen.simulatePressure).toBe(false);
  expect(existsSync(join(WS, "notes/drawings/derivation.rnote"))).toBe(true); // an input: kept
  await expect(page.locator(".rnote-pane")).toHaveCount(0); // the converting pane gave way to the drawing
  expect(t.errs).toEqual([]);
});

test("a pen's folded moves all reach the stroke: one event carrying 20 samples draws 20 points", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Meta+Shift+d"); await page.getByTestId("palette").getByText("Infinite canvas", { exact: true }).click(); // the format asked first (draw-new.ts)
  const canvas = page.locator(".draw-pane canvas.interactive");
  await expect(canvas).toBeVisible({ timeout: 15_000 });
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + box.width - 80, box.y + box.height - 120);
  await page.keyboard.press("p"); // the pen tool
  const [points, width] = await page.evaluate(async ({ x, y }) => {
    const c = document.querySelector(".draw-pane canvas.interactive")!;
    const base = { bubbles: true, cancelable: true, composed: true, pointerId: 1, pointerType: "pen", isPrimary: true, pressure: 0.5 };
    const at = (i: number) => ({ clientX: x + i * 6, clientY: y + Math.sin(i / 3) * 30 });
    c.dispatchEvent(new PointerEvent("pointerdown", { ...base, ...at(0), buttons: 1, button: 0 }));
    const folded = Array.from({ length: 20 }, (_, i) => new PointerEvent("pointermove", { ...base, ...at(i + 1), buttons: 1 }));
    c.dispatchEvent(new PointerEvent("pointermove", { ...base, ...at(20), buttons: 1, coalescedEvents: folded } as PointerEventInit));
    await new Promise((r) => requestAnimationFrame(r));
    window.dispatchEvent(new PointerEvent("pointerup", { ...base, ...at(20), buttons: 0, button: 0 }));
    await new Promise((r) => setTimeout(r, 1500)); // the autosave
    const tree = await fetch("/api/tree?path=notes/drawings", { headers: { "x-atlas": "1" } }).then((r) => r.json());
    let most = 0, width = 0;
    for (const e of tree as { path: string }[]) {
      if (!e.path.endsWith(".excalidraw")) continue;
      const f = await fetch(`/api/file?path=${encodeURIComponent(e.path)}`, { headers: { "x-atlas": "1" } }).then((r) => r.json());
      for (const el of JSON.parse(f.text).elements) if (el.type === "freedraw" && el.points.length > most) { most = el.points.length; width = el.width; }
    }
    return [most, width];
  }, { x: box.x + box.width / 2 - 60, y: box.y + box.height / 2 });
  expect(points).toBeGreaterThanOrEqual(20); // without the collector: 3
  expect(width).toBeCloseTo(120, -1); // 20 samples 6 px apart at zoom 1: the stroke lies where the pen went
});

// "when creating a note I should be able to select the size and format of the pages", then its
// paper ("once you select the size it should prompt you for the background", 2026-10-20): the Boox's screen turned gives
// a first page of that shape, locked, carrying its paper as the Boox's Notepad writes it (draw-new.ts)
test("a new drawing asks its page format, then its paper, and starts with that page", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Meta+Shift+d");
  const palette = page.getByTestId("palette");
  await expect(palette.getByText("A5 pages", { exact: true })).toHaveCount(0); // taken out
  await palette.getByText("Boox Note Air pages, landscape", { exact: true }).click();
  await palette.getByText("Lines", { exact: true }).click();
  await expect(page.locator(".draw-pane canvas.interactive")).toBeVisible({ timeout: 15_000 });
  const dir = join(WS, "notes/drawings");
  const newest = () => readdirSync(dir).filter((f) => /^\d{4}-.*\.excalidraw$/.test(f)).map((f) => join(dir, f)).sort().pop()!; // the dated ones: new drawings
  await expect.poll(() => { const s = JSON.parse(readFileSync(newest(), "utf8")); const f = s.elements.find((e: { type: string }) => e.type === "frame"); return f ? [f.width, f.height, f.locked, f.customData?.atlasTemplate] : null; }).toEqual([1059, 794, true, "lines"]);
});

// A canvas with a corner: it opens at its corner, and the view never goes left of
// or above it
test("a canvas with a corner opens at the corner and keeps the view right of and below it", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Meta+Shift+d");
  await page.getByTestId("palette").getByText("Canvas with a corner", { exact: true }).click();
  const canvas = page.locator(".draw-pane canvas.interactive");
  await expect(canvas).toBeVisible({ timeout: 15_000 });
  const box = (await canvas.boundingBox())!;
  // the wheel pans right-and-down past the corner: the view comes back to it
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(-600, -600);
  const view = () => page.locator(".draw-pane .host").getAttribute("data-view").then((v) => (v ?? "NaN,NaN").split(",").map(Number));
  await expect.poll(async () => { const [x, y] = await view(); return x <= 40 && y <= 40 && x > -10_000; }, "held at the corner").toBe(true);
  // right and down it goes as far as wanted
  await page.mouse.wheel(800, 800);
  await expect.poll(async () => (await view())[0]).toBeLessThan(-300);
});

// "if I draw outside of the page in the boox web app thats all okey, but in the desktop it appears below the background"
// A page's stroke that runs past its edge is drawn there too — pages are sheets, not masks
test("a page's stroke running past the page's edge is drawn beyond it", async ({ page }) => {
  const base = { angle: 0, strokeColor: "#000000", backgroundColor: "transparent", fillStyle: "solid", strokeWidth: 4, strokeStyle: "solid", roughness: 0, opacity: 100, groupIds: [], roundness: null, seed: 1, version: 1, versionNonce: 1, isDeleted: false, boundElements: null, updated: 1, link: null, locked: false };
  const frame = { ...base, strokeWidth: 1, id: "p1", type: "frame", x: 0, y: 0, width: 400, height: 500, name: "Page 1", frameId: null, locked: true };
  const stroke = { ...base, id: "s1", type: "freedraw", x: 300, y: 100, width: 300, height: 0, points: [[0, 0], [100, 0], [200, 0], [300, 0]], pressures: [], simulatePressure: false, lastCommittedPoint: null, frameId: "p1" };
  await page.request.put("/api/file", { headers: { "x-atlas": "1" }, data: { path: "draw-edge/edge.excalidraw", text: JSON.stringify({ type: "excalidraw", version: 2, elements: [frame, stroke], appState: {}, files: {} }) } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Control+p"); await page.keyboard.type("edge.excalidraw");
  await page.getByTestId("palette").getByRole("button", { name: /edge\.excalidraw draw-edge/ }).click();
  await expect(page.locator(".draw-pane canvas.interactive")).toBeVisible({ timeout: 15_000 });
  const host = page.locator(".draw-pane .host");
  await expect(host).toHaveAttribute("data-view", /,/);
  // the scene point (500, 100): on the stroke, 100 units right of the page's edge — dark on the drawing's canvas
  await expect.poll(() => host.evaluate((h) => {
    const [sx, sy, z] = (h.dataset.view ?? "").split(",").map(Number);
    const c = h.querySelector("canvas.static") as HTMLCanvasElement;
    const k = c.width / c.clientWidth;
    const px = c.getContext("2d")!.getImageData(Math.round((500 + sx) * z * k), Math.round((100 + sy) * z * k), 1, 1).data;
    return px[3] > 0 && px[0] + px[1] + px[2] < 300;
  }), "the stroke shows past the edge").toBe(true);
});


test("a folder's Rnote files converted at once from its menu in a dialog, each beside itself, again only counted", async ({ page }) => {
  const stroke = { brushstroke: { path: { start: { pos: [0, 0], pressure: 0.5 }, segments: [{ lineto: { end: { pos: [40, 40], pressure: 0.5 } } }] },
    style: { smooth: { stroke_width: 2, stroke_color: { r: 0, g: 0, b: 0, a: 1 } } } } };
  const doc = gzipSync(JSON.stringify({ version: "0.11.0", data: { engine_snapshot: { document: {}, stroke_components: [{ value: stroke, version: 1 }] } } }));
  mkdirSync(join(WS, "rnotes/sub"), { recursive: true });
  writeFileSync(join(WS, "rnotes/a.rnote"), doc);
  writeFileSync(join(WS, "rnotes/sub/b.rnote"), doc);
  try {
    await page.goto("/");
    await page.getByText("Finish the GW notes.").waitFor();
    await page.keyboard.press("Meta+Shift+f");
    const convert = async () => {
      await page.locator('.row[data-path="rnotes"]').first().click({ button: "right" });
      await page.getByRole("menuitem", { name: "Convert the Rnote files here to drawings" }).click();
    };
    await convert();
    const dialog = page.locator(".rnc");
    await expect(dialog.locator(".rnc-said")).toHaveText("2 drawings made.");
    for (const f of ["a.rnote", "sub/b.rnote"]) await expect(dialog.locator("li", { hasText: f }).locator(".what")).toHaveText("made");
    expect(existsSync(join(WS, "rnotes/a.excalidraw")) && existsSync(join(WS, "rnotes/sub/b.excalidraw"))).toBe(true);
    expect(existsSync(join(WS, "rnotes/a.rnote"))).toBe(true); // inputs: kept
    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(dialog).toHaveCount(0);
    await convert();
    await expect(dialog.locator(".rnc-said")).toHaveText("0 drawings made, 2 made before.");
    await dialog.locator("li", { hasText: "a.rnote" }).click(); // a line opens its drawing
    await expect(page.locator(".draw-pane canvas.interactive")).toBeVisible({ timeout: 15_000 });
  } finally {
    rmSync(join(WS, "rnotes"), { recursive: true, force: true });
  }
});
