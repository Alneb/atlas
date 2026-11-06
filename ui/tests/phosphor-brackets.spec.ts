import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { openFile } from "./open";

// Phosphor: black on white and white on black at full strength (the former Contrast scheme), its own green as accent;
// and a formula's source with its brackets coloured by depth and the caret's pair ringed — shot in both themes.
const H = { "x-atlas": "1" };
const cfg = async (request: APIRequestContext) => (await (await request.get("/api/config", { headers: H })).json()).config;
const set = async (request: APIRequestContext, ui: Record<string, string>) => {
  const c = await cfg(request);
  Object.assign(c.ui, ui);
  expect((await request.put("/api/config", { headers: H, data: c })).ok()).toBe(true);
};

/** A token as the browser resolves it (the build may shorten `#ffffff` to `#fff`). */
const resolved = (page: Page, token: string) => page.evaluate((t) => {
  const probe = document.body.appendChild(document.createElement("i"));
  probe.style.color = `var(${t})`;
  const c = getComputedStyle(probe).color;
  probe.remove();
  return c;
}, token);

test.describe.configure({ mode: "serial" });
let before: Record<string, string> | undefined;
test.beforeAll(async ({ request }) => {
  const c = await cfg(request);
  before = { theme: c.ui.theme, palette: c.ui.palette, contrast: c.ui.contrast };
});
test.afterAll(async ({ request }) => {
  const c = await cfg(request);
  Object.assign(c.ui, before);
  await request.put("/api/config", { headers: H, data: c });
});

const NOTE = "# Brackets\n\nAbove the formula.\n\n$$\n\\left( f(x[{y_1}]) + \\{a\\} \\right) \\langle b \\rangle\n$$\n\nBelow it.\n";

test("phosphor is black and white with its green; a formula's brackets are coloured by depth", async ({ page, request }) => {
  await request.put("/api/file", { headers: H, data: { path: "notes/brackets-look.md", text: NOTE } });
  for (const theme of ["light", "dark"]) {
    await set(request, { theme, palette: "phosphor", contrast: "normal" });
    await page.goto("/");
    await page.getByText("Finish the GW notes.").waitFor();
    await openFile(page, "brackets-look.md");
    await expect.poll(() => resolved(page, "--bg")).toBe(theme === "light" ? "rgb(255, 255, 255)" : "rgb(0, 0, 0)");
    expect(await resolved(page, "--text")).toBe(theme === "light" ? "rgb(0, 0, 0)" : "rgb(255, 255, 255)");
    expect(await resolved(page, "--accent")).toBe(theme === "light" ? "rgb(31, 122, 52)" : "rgb(125, 228, 134)");
    // the caret inside `{y_1}`: the formula shows its source, the innermost pair ringed
    await page.locator(".cm-content").getByText("Above the formula.").click();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Home");
    for (let i = 0; i < "\\left( f(x[{y".length; i++) await page.keyboard.press("ArrowRight");
    await expect(page.locator(".cm-math-br-here")).toHaveCount(2);
    await expect(page.locator(".cm-math-br-here").first()).toHaveText("{");
    await expect(page.locator(".cm-math-br-1").first()).toBeVisible();
    await page.screenshot({ path: `../target/phosphor-brackets-${theme}.png` });
  }
});
