import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { WS } from "../playwright.config";
import { runCommand } from "./open";

const H = { "x-atlas": "1" };
const FILE = ".atlas/bookmarks.yaml";

// A bookmark whose file was moved or deleted said nothing and opened a blank "new file";
// a bookmarked heading that was renamed opened the note at the top without a word.
test("Bookmarks: a gone file is reported (and can be removed), a gone heading is said", async ({ page, request }) => {
  const put = (text: string) => request.put("/api/file", { headers: H, data: { path: FILE, text } });
  await put("pins: []\nbookmarks:\n  - notes/side-gone-away.md\n  - {path: notes/hubbard.md, heading: Nowhere}\n");
  try {
    await page.goto("/");
    await page.getByText("Finish the GW notes.").waitFor();
    const list = page.getByTestId("bookmarks");
    await list.getByText("side-gone-away").click();
    const gone = page.locator(".toast", { hasText: "The bookmarked file is gone" });
    await expect(gone).toContainText("notes/side-gone-away.md");
    await expect(page.getByTestId("sidebar").locator(".tab", { hasText: "side-gone-away" })).toHaveCount(0);

    await list.getByText(/Nowhere/).click();
    await expect(page.locator(".toast", { hasText: "Heading not found" })).toBeVisible();
    await expect(page.locator(".cm-content").first()).toContainText("Energy");

    await gone.getByRole("button", { name: "Remove bookmark" }).click();
    await expect(list.getByText("side-gone-away")).toHaveCount(0);
    await expect.poll(() => readFileSync(join(WS, FILE), "utf8")).not.toContain("side-gone-away");
  } finally {
    await put("pins: []\nbookmarks: []\n");
  }
});

// With none kept, "Bookmarks: open…" offers adding one instead of a row Enter does nothing on.
test("Bookmarks: open… with none kept leads into adding one", async ({ page, request }) => {
  await request.put("/api/file", { headers: H, data: { path: FILE, text: "pins: []\nbookmarks: []\n" } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await runCommand(page, "Bookmarks: open", "Bookmarks: open…");
  const bar = page.getByTestId("palette");
  await expect(bar.locator(".item.sel")).toContainText("No bookmarks yet: add one…");
  await page.keyboard.press("Enter");
  await expect(bar.getByRole("textbox")).toHaveAttribute("placeholder", /^Bookmark this tab or heading/);
  await page.keyboard.press("Escape");
});
