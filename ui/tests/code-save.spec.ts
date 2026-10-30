import { test, expect, type Page } from "@playwright/test";

// Code files are not autosaved: a code file is saved by
// Ctrl+S only; meanwhile its text is kept in a recovery copy, offered back when the file is opened again.
const H = { "x-atlas": "1" };
const disk = async (page: Page, path: string) => ((await (await page.request.get(`/api/file?path=${encodeURIComponent(path)}`, { headers: H })).json()) as { text: string }).text;
const text = (page: Page) => page.evaluate(() => (window as any).__atlas.editor().text as string);

async function open(page: Page, name: string) {
  await page.request.post("/api/cmd/open", { headers: H, data: { args: { path: `notes/${name}` } } });
  await expect(page.locator(".cm-content:visible").first()).toContainText("a = 1");
}

test("a code file waits for Ctrl+S; its unsaved text comes back after the tab was closed", async ({ page }) => {
  await page.request.put("/api/file", { headers: H, data: { path: "notes/keep.py", text: "a = 1\n" } });
  await page.request.put("/api/file", { headers: H, data: { path: ".atlas/cache/recovery/notes/keep.py", text: "" } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await open(page, "keep.py");
  await page.locator(".cm-content:visible").first().getByText("a = 1").click();
  if (await page.locator(".cm-fat-cursor").count()) await page.keyboard.press("A"); else await page.keyboard.press("End");
  await page.keyboard.type("  # one");
  await page.waitForTimeout(1500);
  expect(await disk(page, "notes/keep.py"), "not saved by itself").toBe("a = 1\n");
  await expect.poll(() => disk(page, ".atlas/cache/recovery/notes/keep.py")).toBe("a = 1  # one\n");
  await page.keyboard.press("Control+s");
  await expect.poll(() => disk(page, "notes/keep.py")).toBe("a = 1  # one\n");
  await expect.poll(() => disk(page, ".atlas/cache/recovery/notes/keep.py"), "a saved file needs no copy").toBe("");

  await page.keyboard.type(" two");
  await page.waitForTimeout(800);
  await page.getByTestId("sidebar").locator(".tab", { hasText: "keep.py" }).getByRole("button", { name: /Close/ }).click();
  await expect(page.getByText("keep.py was not saved")).toBeVisible();
  expect(await disk(page, "notes/keep.py")).toBe("a = 1  # one\n");
  await open(page, "keep.py");
  const banner = page.getByRole("alert").filter({ hasText: "Unsaved changes" });
  await expect(banner).toBeVisible();
  await banner.getByRole("button", { name: "Restore" }).click();
  await expect.poll(() => text(page)).toBe("a = 1  # one two\n");
  expect(await disk(page, "notes/keep.py"), "restored, still not saved").toBe("a = 1  # one\n");
});
