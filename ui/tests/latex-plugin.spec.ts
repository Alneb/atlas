import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

// LaTeX is a built-in plugin (lib/builtin-plugins.ts): its id in `[plugins] off` takes its snippets, Tab stops and
// LaTeX completions out of the editor and its routes out of the core; its settings are its own page under Plugins.
const H = { "x-atlas": "1" };
const NOTE = "latex-plugin-note.md";
async function setOff(request: APIRequestContext, off: string[]) {
  const d = await (await request.get("/api/config", { headers: H })).json();
  d.config.plugins.off = off;
  expect((await request.put("/api/config", { headers: H, data: d.config })).ok()).toBeTruthy();
}
test.beforeEach(async ({ request }) => {
  await request.put("/api/file", { headers: H, data: { path: NOTE, text: "# LaTeX plugin\n\nfirst line\n" } });
});
test.afterEach(async ({ request }) => {
  await setOff(request, []);
  await request.post(`/api/fs/trash?path=${NOTE}`, { headers: H });
});

async function typeAtEnd(page: Page, text: string) {
  await page.keyboard.press("Control+p");
  await page.keyboard.type(NOTE.replace(/\.md$/, ""));
  await expect(page.getByTestId("palette").getByText(NOTE.replace(/\.md$/, ""), { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator(".cm-content")).toContainText("first line");
  await page.locator(".cm-content").click();
  await page.keyboard.press("Escape");
  await page.keyboard.type("Go"); // vim: a new line at the end, in insert mode
  await page.keyboard.type(text);
}

test("switched off, LaTeX has no snippets and no route; its page sits under Plugins", async ({ page, request }) => {
  await setOff(request, ["latex"]);
  expect((await request.get("/api/snippets", { headers: H })).status()).toBe(404);
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await typeAtEnd(page, "mk x// y");
  await expect(page.locator(".cm-line").last()).toHaveText("mk x// y"); // nothing expanded

  await page.keyboard.press("Escape");
  await page.keyboard.press("Meta+,");
  const nav = page.getByRole("navigation", { name: "Settings pages" });
  const entry = nav.getByRole("button", { name: /^LaTeX/ });
  await expect(entry).toHaveClass(/off/);
  await entry.click();
  await expect(page.getByText("Snippets file", { exact: true })).toBeVisible();
  await nav.getByRole("button", { name: /^Plugins( \d+)?$/ }).click();
  await page.getByRole("switch", { name: "Plugin LaTeX" }).click();
  await expect(entry).not.toHaveClass(/off/);
  expect((await request.get("/api/snippets", { headers: H })).status()).toBe(200);
});

test("on (the default), the same keys expand", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await typeAtEnd(page, "mkx//");
  await expect(page.locator(".cm-line").last()).toHaveText("$x\\frac{}{}$");
});
