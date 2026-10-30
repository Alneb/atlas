import { test, expect } from "@playwright/test";
import { openFile } from "./open";

// A markdown link [text](url) in a note opens on a click: a vault file in Atlas, the web outside.
const H = { "x-atlas": "1" };

test("a markdown link opens on a click", async ({ page, request }) => {
  await request.put("/api/file", { headers: H, data: { path: "notes/link-target.md", text: "# Link target\n\nreached\n" } });
  await request.put("/api/file", { headers: H, data: { path: "notes/link-from.md", text: "# From\n\nsee [the target](link-target.md) and [the web](https://example.org/x)\n" } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await openFile(page, "link-from.md");
  const popup = page.waitForEvent("popup");
  await page.locator(".cm-link", { hasText: "the web" }).click();
  expect((await popup).url()).toContain("example.org/x");
  await page.locator(".cm-link", { hasText: "the target" }).click();
  await expect(page.locator(".cm-content:visible").first()).toContainText("reached");
});
