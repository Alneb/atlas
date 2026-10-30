import { test, expect } from "@playwright/test";
import { openFile } from "./open";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { WS } from "../playwright.config";
import { textPdf } from "./fixtures/pdf";

// A web link clicked in a PDF used to replace the whole UI. Now it opens
// a new window (the app makes it a browsing window, crates/atlas-app on_new_window); the app stays where it was.
test("a web link inside a PDF opens a new window and leaves the app in place", async ({ page, request, context }) => {
  mkdirSync(join(WS, "pdfs"), { recursive: true });
  writeFileSync(join(WS, "pdfs/weblink.pdf"), textPdf([{ lines: ["Read the article online"], links: [{ rect: [60, 690, 300, 720], uri: "https://example.org/article" }] }]));
  await request.put("/api/file", { headers: { "x-atlas": "1" }, data: { path: "notes/pdf-weblink.md", text: "# Web\n\nsee [[pdfs/weblink.pdf|the article PDF]]\n" } });
  await context.route("https://example.org/**", (r) => r.fulfill({ body: "<title>Article</title>outside", contentType: "text/html" }));
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  const app = page.url();
  await openFile(page, "pdf-weblink.md");
  await page.locator(".cm-content").getByText("the article PDF").click();
  const link = page.locator(".pdf-pane .annotationLayer a[href='https://example.org/article']").last();
  await expect(link).toBeAttached({ timeout: 20_000 });
  expect(await link.getAttribute("target")).toBe("_blank");
  const popup = page.waitForEvent("popup");
  await link.click();
  expect((await popup).url()).toBe("https://example.org/article");
  expect(page.url()).toBe(app); // the app was not replaced
  await expect(page.locator(".pdf-pane").last()).toBeVisible();
});
