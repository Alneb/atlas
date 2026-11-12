import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { vaultLook } from "./look";

// High contrast (`[ui] contrast`): any scheme on black or white paper, full-strength text, and the scheme's accent
// pushed to a bright tone of its own hue that stands at 8:1 on black by night and 7:1 on white by day.
const H = { "x-atlas": "1" };
const cfg = async (request: APIRequestContext) => (await (await request.get("/api/config", { headers: H })).json()).config;

test.describe.configure({ mode: "serial" });
test.beforeEach(({ page }) => vaultLook(page)); // these change the vault's look and expect the page to follow

let before: { theme: string; palette: string; contrast: string } | undefined;
test.beforeAll(async ({ request }) => {
  const c = await cfg(request);
  before = { theme: c.ui.theme, palette: c.ui.palette, contrast: c.ui.contrast };
});
// the config is shared by every spec of the run: leave it as it was
test.afterAll(async ({ request }) => {
  const c = await cfg(request);
  Object.assign(c.ui, before);
  await request.put("/api/config", { headers: H, data: c });
});

const set = async (request: APIRequestContext, ui: Record<string, string>) => {
  const c = await cfg(request);
  Object.assign(c.ui, ui);
  expect((await request.put("/api/config", { headers: H, data: c })).ok()).toBe(true);
};

/** The window's resolved --bg and --accent, and the accent's hue and contrast on the paper (WCAG). */
const look = (page: Page) => page.evaluate(() => {
  const probe = (v: string) => {
    const d = document.createElement("div");
    d.style.color = `var(${v})`;
    document.body.append(d);
    const rgb = getComputedStyle(d).color.match(/[\d.]+/g)!.slice(0, 3).map(Number);
    d.remove();
    return rgb;
  };
  const lum = ([r, g, b]: number[]) => [r, g, b].map((c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; })
    .reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
  const hue = ([r, g, b]: number[]) => {
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    if (!d) return -1;
    const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return (h * 60 + 360) % 360;
  };
  const bg = probe("--bg"), accent = probe("--accent"), text = probe("--text");
  const [a, p] = [lum(accent), lum(bg)];
  return { bg, text, hue: hue(accent), ratio: (Math.max(a, p) + 0.05) / (Math.min(a, p) + 0.05), contrast: document.documentElement.dataset.contrast };
});

test("high contrast turns a scheme up on both sides and keeps its hue", async ({ page, request }) => {
  await set(request, { theme: "dark", palette: "sea", contrast: "normal" });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  const normal = await look(page);
  expect(normal.contrast).toBeUndefined();
  expect(normal.bg).not.toEqual([0, 0, 0]);

  await set(request, { contrast: "high" });
  await expect.poll(async () => (await look(page)).contrast).toBe("high");
  const night = await look(page);
  expect(night.bg).toEqual([0, 0, 0]);
  expect(night.text).toEqual([255, 255, 255]);
  expect(night.ratio).toBeGreaterThanOrEqual(8);
  expect(Math.abs(night.hue - normal.hue)).toBeLessThan(12); // still the sea's teal, brighter
  await page.screenshot({ path: "../target/contrast-high-dark.png" });

  await set(request, { theme: "light" });
  await expect.poll(async () => (await look(page)).bg).toEqual([255, 255, 255]);
  const day = await look(page);
  expect(day.text).toEqual([0, 0, 0]);
  expect(day.ratio).toBeGreaterThanOrEqual(7);
  await page.screenshot({ path: "../target/contrast-high-light.png" });

  // back to normal: the scheme's own colours again, no inline accent left behind
  await set(request, { contrast: "normal" });
  await expect.poll(async () => (await look(page)).contrast).toBeUndefined();
  expect(await page.evaluate(() => document.documentElement.style.getPropertyValue("--accent"))).toBe("");
});
