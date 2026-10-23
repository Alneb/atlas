import { test, expect, type Page } from "@playwright/test";
import { shownName } from "../src/lib/paths";
import { outline } from "../src/lib/draw-ink";

// The e-ink mode against ghosting (lib/eink.ts): black on white with nothing moving, and a full refresh (the
// black-then-white veil, in a browser) when another tab comes to the front and when a scroll comes to rest.
async function open(page: Page, refresh: "often" | "navigation" | "manual") {
  await page.route("**/api/config", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const res = await route.fetch(), body = await res.json();
    body.config.ui.eink = "on";
    body.config.ui.eink_refresh = refresh;
    await route.fulfill({ response: res, json: body });
  });
  // every veil the page puts up, counted as it appears (it is gone again after ~180 ms)
  await page.addInitScript(() => {
    (window as unknown as { flashes: number }).flashes = 0;
    new MutationObserver((ms) => {
      for (const m of ms) for (const n of m.addedNodes) if (n instanceof HTMLElement && n.classList.contains("eink-flash")) (window as unknown as { flashes: number }).flashes++;
    }).observe(document, { childList: true, subtree: true });
  });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
}
const flashes = (page: Page) => page.evaluate(() => (window as unknown as { flashes: number }).flashes);
async function openNote(page: Page, name: string) {
  await page.keyboard.press("Control+p");
  await page.keyboard.type(name);
  await expect(page.getByTestId("palette").getByText(shownName(name), { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator(".cm-content").first()).toBeVisible();
}

test("e-ink: black on white, nothing moving, and a calm refresh after a tab change and after a scroll", async ({ page }) => {
  await open(page, "often");
  const root = page.locator("html");
  await expect(root).toHaveClass(/\beink\b/);
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(255, 255, 255)");
  // bigger, heavier text: 10 % over the set size, weight 500
  const body = await page.evaluate(() => { const s = getComputedStyle(document.body); return [parseFloat(s.fontSize), s.fontWeight]; });
  expect(body[0]).toBeCloseTo(14 * 1.25 * (await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--ui-scale-set") || "1"))), 1);
  expect(body[1]).toBe("500");
  // no transition or animation anywhere: each frame of one is a partial update, and a ghost
  const moving = await page.evaluate(() => [...document.querySelectorAll("*")].filter((e) => {
    const s = getComputedStyle(e);
    return parseFloat(s.transitionDuration) > 0 || (s.animationName !== "none" && parseFloat(s.animationDuration) > 0);
  }).length);
  expect(moving).toBe(0);

  // the automatic refreshes are the app's calm one, at most every 5 s (afa80a7: "the app does a full refresh too often
  // and it's strident"): a browser has none and puts up no veil; the phone app's bridge is asked — stubbed here after
  // the start, so the shell stays the desktop's
  await page.evaluate(() => {
    const w = window as unknown as { calm: number; AtlasNative: unknown };
    w.calm = 0;
    w.AtlasNative = { einkRefresh: () => { w.calm++; } };
  });
  const calm = () => page.evaluate(() => (window as unknown as { calm: number }).calm);
  await page.waitForTimeout(5_100); // the start's own refresh counts towards the 5 s too
  const before = await flashes(page);
  // a note long enough to scroll at any window height (the fixtures' notes fit the window)
  await page.request.put("/api/file", { headers: { "x-atlas": "1" }, data: { path: "eink-long.md", text: Array.from({ length: 200 }, (_, i) => `Line ${i + 1}`).join("\n\n") } });
  await openNote(page, "eink-long.md");
  await expect.poll(calm, { message: "a refresh once the new tab has drawn" }).toBeGreaterThan(0);
  expect(await flashes(page), "calm: no veil").toBe(before);

  const afterTab = await calm();
  await page.waitForTimeout(5_100); // past the 5 s automatic refreshes keep between them
  const scroller = page.locator(".cm-scroller").first();
  await scroller.hover();
  await page.mouse.wheel(0, 600);
  await expect.poll(() => scroller.evaluate((e) => e.scrollTop), { message: "the note scrolled" }).toBeGreaterThan(0);
  await expect.poll(calm, { message: "a refresh when the scroll came to rest" }).toBeGreaterThan(afterTab);
  expect(await flashes(page), "calm: no veil").toBe(before);
});

test("e-ink, refresh by hand only: no veil on a tab change, one from the command", async ({ page }) => {
  await open(page, "manual");
  const before = await flashes(page);
  // a note long enough to scroll at any window height (the fixtures' notes fit the window)
  await page.request.put("/api/file", { headers: { "x-atlas": "1" }, data: { path: "eink-long.md", text: Array.from({ length: 200 }, (_, i) => `Line ${i + 1}`).join("\n\n") } });
  await openNote(page, "eink-long.md");
  await page.waitForTimeout(600);
  expect(await flashes(page)).toBe(before);
  await page.keyboard.press("F1");
  await page.keyboard.type("E-ink: clear the screen");
  await page.keyboard.press("Enter");
  await expect.poll(() => flashes(page)).toBe(before + 1);
});

test("e-ink: a drawing opens as a notepad — its own toolbar with the fine pen, thin black ink, undo, fullscreen", async ({ page }) => {
  await open(page, "manual");
  await page.keyboard.press("Meta+Shift+d"); await page.getByTestId("palette").getByText("Infinite canvas", { exact: true }).click(); // the format asked first (draw-new.ts)
  const canvas = page.locator(".draw-pane canvas.interactive");
  await expect(canvas).toBeVisible({ timeout: 15_000 });
  const bar = page.getByTestId("notepad-bar");
  await expect(bar.getByRole("button", { name: "Fountain pen" })).toHaveClass(/\bon\b/);
  await expect(bar.getByRole("button", { name: "Fine line" })).toHaveClass(/\bon\b/);
  await expect(page.locator(".draw-pane .App-toolbar")).toBeHidden(); // Excalidraw's shape tools: under "All tools"
  const box = (await canvas.boundingBox())!;
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await page.mouse.move(cx - 80, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 80, cy + 40, { steps: 8 });
  await page.mouse.up();
  // this drawing's strokes only: other tests' drawings share the folder (one changing meanwhile moved the count)
  const mine = /[^\s/]+\.excalidraw/.exec(await page.locator(".dv-tab.dv-active-tab").innerText())![0];
  const strokes = () => page.evaluate(async (mine) => {
    const r = await fetch("/api/tree?path=notes/drawings", { headers: { "x-atlas": "1" } }).then((r) => r.json());
    const out: string[] = [];
    for (const e of (Array.isArray(r) ? r : r.entries) as { path: string }[]) {
      if (!e.path.endsWith(`/${mine}`)) continue;
      const t = await fetch(`/api/file?path=${encodeURIComponent(e.path)}`, { headers: { "x-atlas": "1" } }).then((r) => r.json());
      for (const el of JSON.parse(t.text).elements) if (el.type === "freedraw") out.push([el.strokeWidth, el.roughness, el.strokeColor].join(" "));
    }
    return out;
  }, mine);
  await expect.poll(strokes, { timeout: 10_000 }).toContain("0.5 0 #000000");
  const before = (await strokes()).length;
  await bar.getByRole("button", { name: "Undo" }).click();
  await expect.poll(async () => (await strokes()).length, { timeout: 10_000 }).toBe(before - 1);
  // "More": the paper by name, a short list of Excalidraw's tools, its whole interface only as the last line
  await expect(bar.getByRole("button", { name: "Paper" })).toHaveText(/Paper: /);
  await bar.getByRole("button", { name: "More tools" }).click();
  await page.getByRole("menu").getByRole("menuitemradio", { name: "Text" }).click(); // the menu lies over the canvas, beside the bar
  await expect(bar.getByRole("button", { name: "More tools" })).toHaveClass(/\bon\b/); // the text tool is on: More shows it
  await bar.getByRole("button", { name: "More tools" }).click();
  await page.getByRole("menu").getByRole("menuitemcheckbox", { name: "All tools" }).click();
  await expect(page.locator(".draw-pane .App-toolbar")).toBeVisible();
  await bar.getByRole("button", { name: "Fullscreen" }).click();
  await expect(page.locator(".shell")).toHaveClass(/\bfull\b/);
});

test("e-ink in the Boox app: Onyx's instant ink is placed over the drawing while the pen tool is on, and taken off", async ({ page }) => {
  await open(page, "manual");
  // the app's bridge (AtlasActivity.Bridge), recording what the page asks of it — put in after the start, so the page
  // stays the desktop's (with the bridge from the start it is the phone app's shell); a drawing reads it when it opens
  await page.evaluate(() => {
    const calls: number[][] = [];
    (window as unknown as { inkCalls: number[][] }).inkCalls = calls;
    (window as unknown as { AtlasNative: unknown }).AtlasNative = { ink: (...a: number[]) => calls.push(a) };
  });
  await page.keyboard.press("Meta+Shift+d"); await page.getByTestId("palette").getByText("Infinite canvas", { exact: true }).click(); // the format asked first (draw-new.ts)
  await expect(page.locator(".draw-pane canvas.interactive")).toBeVisible({ timeout: 15_000 });
  const calls = () => page.evaluate(() => (window as unknown as { inkCalls: number[][] }).inkCalls);
  await expect.poll(async () => (await calls()).at(-1)?.[2] ?? 0).toBeGreaterThan(100); // a region as wide as the drawing
  const [left, top, width, height, line, style] = (await calls()).at(-1)!;
  const host = (await page.locator(".draw-pane .host").boundingBox())!;
  expect(left).toBeCloseTo(host.x, 0);
  expect(top).toBeCloseTo(host.y + 72, 0); // below the toolbar
  expect(width).toBeCloseTo(host.width, 0);
  expect(height).toBeCloseTo(host.height - 72, 0);
  expect(line).toBeCloseTo(0.5 * outline("fountain", 0.39), 1); // the fine pen (0.5) at zoom 1, as wide as the stroke at the Boox's usual pressure (linear: PenInput.linear)
  expect(style).toBe(1); // the fountain pen: Onyx's pressure brush
  // another tool: off
  await page.getByTestId("notepad-bar").getByRole("button", { name: "Select" }).click();
  await expect.poll(async () => (await calls()).at(-1)).toEqual([0, 0, 0, 0, 0, 0]);
});

// "if i click on more or paper in the toolbar, then i cannot click on the menu that appears i can only draw on top"
// (2026-10-20): a menu open over the drawing gives the pen back to the page (pen-target.ts holdPen), so it takes a tap
test("e-ink in the Boox app: the toolbar's menus take the pen's taps — the instant ink off while one is open", async ({ page }) => {
  await open(page, "manual");
  await page.evaluate(() => {
    const calls: number[][] = [];
    (window as unknown as { inkCalls: number[][] }).inkCalls = calls;
    (window as unknown as { AtlasNative: unknown }).AtlasNative = { ink: (...a: number[]) => calls.push(a) };
  });
  await page.keyboard.press("Meta+Shift+d"); await page.getByTestId("palette").getByText("Infinite canvas", { exact: true }).click();
  await expect(page.locator(".draw-pane canvas.interactive")).toBeVisible({ timeout: 15_000 });
  const last = () => page.evaluate(() => (window as unknown as { inkCalls: number[][] }).inkCalls.at(-1)?.[2] ?? 0);
  await expect.poll(last).toBeGreaterThan(100);
  const bar = page.getByTestId("notepad-bar");
  await bar.getByRole("button", { name: "Paper" }).click();
  await expect.poll(last, "off while the menu is open").toBe(0);
  await page.getByRole("menuitemradio", { name: "Lines" }).click();
  await expect.poll(last, "back once it closes").toBeGreaterThan(100);
  // the held pages switch off and stay off on this device
  await bar.getByRole("button", { name: "More tools" }).click();
  await page.getByRole("menuitemcheckbox", { name: /Pages held in place/ }).click();
  await bar.getByRole("button", { name: "More tools" }).click();
  await expect(page.getByRole("menuitemcheckbox", { name: /Pages held in place/ })).toHaveAttribute("aria-checked", "false");
  expect(await page.evaluate(() => localStorage.getItem("atlas.draw.pages-held"))).toBe("off");
});

// "there should also be a zen mode there where the tab is hidden" (2026-10-20): the page alone, a corner button back
test("e-ink: zen leaves the page alone — the toolbar and the app hidden — and its corner button brings them back", async ({ page }) => {
  await open(page, "manual");
  await page.keyboard.press("Meta+Shift+d"); await page.getByTestId("palette").getByText("Infinite canvas", { exact: true }).click();
  await expect(page.locator(".draw-pane canvas.interactive")).toBeVisible({ timeout: 15_000 });
  const bar = page.getByTestId("notepad-bar"), sidebar = page.getByTestId("sidebar");
  await expect(sidebar).toBeVisible();
  await bar.getByRole("button", { name: "Zen" }).click();
  await expect(bar).toHaveCount(0);
  await expect(sidebar).toBeHidden();
  await page.getByRole("button", { name: "Leave zen" }).click();
  await expect(bar).toBeVisible();
  await expect(sidebar).toBeVisible();
});

test("e-ink: fingers move the page — two of them pinch-zoom it, the pen still draws at that zoom", async ({ page }) => {
  await open(page, "manual");
  await page.keyboard.press("Meta+Shift+d"); await page.getByTestId("palette").getByText("Infinite canvas", { exact: true }).click(); // the format asked first (draw-new.ts)
  const canvas = page.locator(".draw-pane canvas.interactive");
  await expect(canvas).toBeVisible({ timeout: 15_000 });
  const box = (await canvas.boundingBox())!;
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  // two fingers 100 px apart spread to 200: zoom ×2 (draw-notepad.ts fingerGestures)
  await page.evaluate(([cx, cy]) => {
    const c = document.querySelector(".draw-pane canvas.interactive")!;
    const ev = (type: string, id: number, x: number) => c.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: "touch", clientX: x, clientY: cy, bubbles: true, cancelable: true }));
    ev("pointerdown", 11, cx - 50); ev("pointerdown", 12, cx + 50);
    ev("pointermove", 11, cx - 100); ev("pointermove", 12, cx + 100);
  }, [cx, cy]);
  await page.waitForTimeout(100); // the view changes once a frame
  await page.evaluate(([cx, cy]) => {
    const c = document.querySelector(".draw-pane canvas.interactive")!;
    for (const [id, x] of [[11, cx - 100], [12, cx + 100]]) c.dispatchEvent(new PointerEvent("pointerup", { pointerId: id, pointerType: "touch", clientX: x, clientY: cy, bubbles: true, cancelable: true }));
  }, [cx, cy]);
  // a 160 px stroke is 80 scene units wide at zoom 2
  await page.mouse.move(cx - 80, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 80, cy, { steps: 8 });
  await page.mouse.up();
  const widths = () => page.evaluate(async () => {
    const r = await fetch("/api/tree?path=notes/drawings", { headers: { "x-atlas": "1" } }).then((r) => r.json());
    const out: number[] = [];
    for (const e of (Array.isArray(r) ? r : r.entries) as { path: string }[]) {
      if (!e.path.endsWith(".excalidraw")) continue;
      const t = await fetch(`/api/file?path=${encodeURIComponent(e.path)}`, { headers: { "x-atlas": "1" } }).then((r) => r.json());
      for (const el of JSON.parse(t.text).elements) if (el.type === "freedraw") out.push(Math.round(el.width));
    }
    return out;
  });
  await expect.poll(async () => (await widths()).some((w) => w > 70 && w < 90), { timeout: 10_000 }).toBe(true);
});

test("e-ink: the notepad's pens and paper — a highlighter is wide and see-through, lines move with the page", async ({ page }) => {
  await open(page, "manual");
  await page.keyboard.press("Meta+Shift+d"); await page.getByTestId("palette").getByText("Infinite canvas", { exact: true }).click(); // the format asked first (draw-new.ts)
  const canvas = page.locator(".draw-pane canvas.interactive");
  await expect(canvas).toBeVisible({ timeout: 15_000 });
  const bar = page.getByTestId("notepad-bar");
  await bar.getByRole("button", { name: "Highlighter" }).click();
  await expect(bar.getByRole("button", { name: "Highlighter" })).toHaveClass(/\bon\b/);
  await bar.getByRole("button", { name: "Paper" }).click();
  await page.getByRole("menuitemradio", { name: "Lines" }).click();
  const host = page.locator(".draw-pane .host .atlas-paper"); // the paper's own layer (on the pages only, when there are pages)
  await expect(host).toHaveCSS("background-image", /linear-gradient/);
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 100, box.y + 200);
  await page.mouse.down();
  await page.mouse.move(box.x + 260, box.y + 200, { steps: 8 });
  await page.mouse.up();
  const marks = () => page.evaluate(async () => {
    const r = await fetch("/api/tree?path=notes/drawings", { headers: { "x-atlas": "1" } }).then((r) => r.json());
    const out: string[] = [];
    for (const e of (Array.isArray(r) ? r : r.entries) as { path: string }[]) {
      if (!e.path.endsWith(".excalidraw")) continue;
      const t = await fetch(`/api/file?path=${encodeURIComponent(e.path)}`, { headers: { "x-atlas": "1" } }).then((r) => r.json());
      const scene = JSON.parse(t.text);
      for (const el of scene.elements) if (el.type === "freedraw") out.push(`${el.strokeWidth} ${el.opacity} ${scene.appState?.viewBackgroundColor}`);
    }
    return out;
  });
  await expect.poll(marks, { timeout: 10_000 }).toContain("4 35 transparent");
  // the page moved by a finger: the lines with it
  const before = await host.evaluate((h) => getComputedStyle(h).backgroundPosition);
  await page.evaluate(([x, y]) => {
    const c = document.querySelector(".draw-pane canvas.interactive")!;
    const ev = (type: string, yy: number) => c.dispatchEvent(new PointerEvent(type, { pointerId: 21, pointerType: "touch", clientX: x, clientY: yy, bubbles: true, cancelable: true }));
    ev("pointerdown", y); ev("pointermove", y + 10);
  }, [box.x + 300, box.y + 300]);
  await expect.poll(() => host.evaluate((h) => getComputedStyle(h).backgroundPosition)).not.toBe(before);
  await page.evaluate(([x, y]) => document.querySelector(".draw-pane canvas.interactive")!.dispatchEvent(new PointerEvent("pointerup", { pointerId: 21, pointerType: "touch", clientX: x, clientY: y, bubbles: true })), [box.x + 300, box.y + 310]);
});

// The user: "some traces are not recorded" · "i dont like how writing looks". A palm's brief two contacts
// while the pen writes were a two-finger tap — undo, the stroke gone; and a pen stroke is saved marked for the crisp
// outline (draw-ink.ts; vite.config.ts inkStroke makes Excalidraw ask it).
test("e-ink: a palm while the pen writes neither undoes nor moves the page; pen strokes are kept crisp", async ({ page }) => {
  await open(page, "manual");
  await page.keyboard.press("Meta+Shift+d"); await page.getByTestId("palette").getByText("Infinite canvas", { exact: true }).click(); // the format asked first (draw-new.ts)
  const canvas = page.locator(".draw-pane canvas.interactive");
  await expect(canvas).toBeVisible({ timeout: 15_000 });
  const box = (await canvas.boundingBox())!;
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  const pens = () => page.evaluate(async () => {
    const r = await fetch("/api/tree?path=notes/drawings", { headers: { "x-atlas": "1" } }).then((r) => r.json());
    const out: string[] = [];
    for (const e of (Array.isArray(r) ? r : r.entries) as { path: string }[]) {
      if (!e.path.endsWith(".excalidraw")) continue;
      const t = await fetch(`/api/file?path=${encodeURIComponent(e.path)}`, { headers: { "x-atlas": "1" } }).then((r) => r.json());
      for (const el of JSON.parse(t.text).elements) if (el.type === "freedraw" && !el.isDeleted) out.push(String(el.customData?.atlasPen ?? "none"));
    }
    return out;
  });
  const before = (await pens()).length, fountains = (await pens()).filter((p) => p === "fountain").length;
  // a real pen stroke (Chromium's input, pointerType "pen"), with a palm landing twice beside it mid-stroke (a quick tap)
  const cdp = await page.context().newCDPSession(page);
  const pen = (type: "mousePressed" | "mouseMoved" | "mouseReleased", x: number, y: number) =>
    cdp.send("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1, pointerType: "pen", force: 0.4 });
  const palm = () => page.evaluate(([cx, cy]) => {
    const c = document.querySelector(".draw-pane canvas.interactive")!;
    const touch = (type: string, id: number, x: number) => c.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: "touch", clientX: x, clientY: cy + 120, bubbles: true, cancelable: true }));
    touch("pointerdown", 21, cx - 40); touch("pointerdown", 22, cx + 40); touch("pointerup", 21, cx - 40); touch("pointerup", 22, cx + 40);
  }, [cx, cy]);
  await pen("mousePressed", cx - 80, cy);
  for (let i = 1; i <= 6; i++) await pen("mouseMoved", cx - 80 + i * 14, cy + i * 3);
  await palm();
  for (let i = 7; i <= 12; i++) await pen("mouseMoved", cx - 80 + i * 14, cy + i * 3);
  await pen("mouseReleased", cx + 88, cy + 36);
  await palm(); // and once more right after the pen lifted
  await expect.poll(async () => (await pens()).length, { timeout: 10_000 }).toBe(before + 1); // kept, not undone
  // marked for the crisp outline (other tests' drawings share the folder: count, do not take "the last")
  await expect.poll(async () => (await pens()).filter((p) => p === "fountain").length, { timeout: 10_000 }).toBe(fountains + 1);
  expect(await page.evaluate(() => typeof (globalThis as unknown as { __atlasInk?: unknown }).__atlasInk)).toBe("function");
});

// A notebook of pages ("pages are very important"): frames under one another, moved between from the bar.
test("e-ink: the notepad makes pages, one under the other, and moves between them", async ({ page }) => {
  await open(page, "manual");
  await page.keyboard.press("Meta+Shift+d"); await page.getByTestId("palette").getByText("Infinite canvas", { exact: true }).click(); // the format asked first (draw-new.ts)
  await expect(page.locator(".draw-pane canvas.interactive")).toBeVisible({ timeout: 15_000 });
  const bar = page.getByTestId("notepad-bar");
  await bar.getByRole("button", { name: "New page" }).click();
  await expect(bar.getByLabel("Page 1 of 1")).toBeVisible();
  await bar.getByRole("button", { name: "New page" }).click();
  await expect(bar.getByLabel("Page 2 of 2")).toBeVisible(); // the new page is shown
  await bar.getByRole("button", { name: "Previous page" }).click();
  await expect(bar.getByLabel("Page 1 of 2")).toBeVisible();
  await expect(bar.getByRole("button", { name: "Previous page" })).toBeDisabled();
  await bar.getByRole("button", { name: "Next page" }).click();
  await expect(bar.getByLabel("Page 2 of 2")).toBeVisible();
});
