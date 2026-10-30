import { test, expect } from "@playwright/test";
import { openFile } from "./open";

// The usage journal (toolsmith input) and the live `search` block its drafts use.
const H = { "x-atlas": "1" };

test("opening a file is journaled; a search block shows live results", async ({ page, request }) => {
  await request.put("/api/file", { headers: H, data: { path: "notes/zz-live.page", text: 'title: Live\nrows:\n  - [{ view: search, q: "Finish the GW" }]\n' } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await openFile(page, "zz-live.page");
  const block = page.locator(".search-block");
  await expect(block.locator(".head")).toContainText("“Finish the GW”");
  await expect(block.locator("li").first()).toBeVisible();
  await expect.poll(async () => (await (await request.get("/api/file?path=.atlas/cache/usage.jsonl", { headers: H })).json()).text ?? "")
    .toContain('"kind":"open","path":"notes/zz-live.page"');
  await request.put("/api/file", { headers: H, data: { path: "notes/zz-live.page", text: "" } });
});
