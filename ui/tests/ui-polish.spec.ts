import { test, expect } from "@playwright/test";
import { shownName } from "../src/lib/paths";
const H = { "x-atlas": "1" };
const put = (r: import("@playwright/test").APIRequestContext, path: string, text: string) => r.put("/api/file", { headers: H, data: { path, text } });

async function openFile(page: import("@playwright/test").Page, name: string) {
  await page.keyboard.press("Control+p");
  await page.keyboard.type(name);
  await expect(page.getByTestId("palette").getByText(shownName(name), { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Enter");
}

// From the user's own list (round 31) — each a thing they hit in the desktop app.
test("tree: a folder holding the open file stays collapsed; rows keep their alignment", async ({ page, request }) => {
  await put(request, "pol/a-very-long-folder-name-that-would-squeeze-the-row/pol-reveal-target.md", "x\n");
  await put(request, "pol/some-file-with-a-really-really-long-name-for-the-row.py", "x = 1\n");
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await openFile(page, "pol-reveal-target.md");
  await page.keyboard.press("Meta+Shift+f");
  const dir = page.locator('.row[data-path="pol/a-very-long-folder-name-that-would-squeeze-the-row"]');
  await expect(dir).toBeVisible(); // revealed
  await dir.click(); // collapse
  await page.waitForTimeout(400);
  await expect(page.locator('.row[data-path="pol/a-very-long-folder-name-that-would-squeeze-the-row/pol-reveal-target.md"]')).toHaveCount(0);
  // a file row and a folder row at the same depth put their icons at the same x
  const x = (sel: string) => page.locator(sel).locator(".ico").evaluate((e) => Math.round(e.getBoundingClientRect().left));
  expect(await x('.row[data-path="pol/some-file-with-a-really-really-long-name-for-the-row.py"]'))
    .toBe(await x('.row[data-path="pol/a-very-long-folder-name-that-would-squeeze-the-row"]'));
});

test("tabs: two files with the same name say which folder; Today survives a tab switch", async ({ page, request }) => {
  await put(request, "pol/one/averages.tsv", "a\tb\n1\t2\n");
  await put(request, "pol/two/averages.tsv", "a\tb\n3\t4\n");
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Control+p"); await page.keyboard.type("one averages"); await page.waitForTimeout(400); await page.keyboard.press("Enter");
  await page.keyboard.press("Control+p"); await page.keyboard.type("two averages"); await page.waitForTimeout(400); await page.keyboard.press("Enter");
  const sb = page.getByTestId("sidebar");
  await expect(sb.locator(".tab", { hasText: "averages.tsv" }).locator(".tab-hint")).toHaveText(["one", "two"]);
  await sb.getByTestId("apps").getByRole("button", { name: "Home", exact: true }).click(); // Home is an app at the top
  await expect(page.getByText("Finish the GW notes.")).toBeVisible(); // blocks still there after the switch
  await expect(page.getByTestId("capture")).toBeVisible();
  // the terminal section comes before the tabs
  await page.keyboard.press("Control+`");
  await expect(page.locator(".xterm").first()).toBeVisible();
  const labels = await sb.locator(".group-head > span:first-child").allTextContents();
  expect(labels.findIndex((l) => /terminal/i.test(l))).toBeLessThan(labels.findIndex((l) => /^tabs$/i.test(l.trim())));
});
