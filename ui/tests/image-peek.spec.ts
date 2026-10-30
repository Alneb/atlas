import { test, expect } from "@playwright/test";
import { openFile } from "./open";

// Pictures in a note: shown while their link is being written (caret inside), large while Ctrl is
// held over them (lib/image-peek.ts), opened in a tab of their own by a click.
const H = { "x-atlas": "1" };
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="120"><rect width="200" height="120" fill="teal"/></svg>`;

test("a picture shows while its link is written, grows with Ctrl, opens on a click", async ({ page, request }) => {
  await request.put("/api/file", { headers: H, data: { path: "notes/peek-pic.svg", text: SVG } });
  await request.put("/api/file", { headers: H, data: { path: "notes/peek.md", text: "# Peek\n\n![[peek-pic.svg]]\n\nend\n" } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await openFile(page, "peek.md");
  const img = page.locator(".cm-content img.cm-embed-image").first();
  await expect(img).toBeVisible();

  // Ctrl over it: the large copy; Ctrl let go: gone
  await img.hover();
  await page.keyboard.down("Control");
  await expect(page.locator("img.image-peek")).toBeVisible();
  await page.keyboard.up("Control");
  await expect(page.locator("img.image-peek")).toHaveCount(0);

  // writing a link: the picture shows while the caret is still in it
  await page.locator(".cm-line", { hasText: "end" }).click();
  const vim = (await page.locator(".cm-fat-cursor").count()) > 0;
  await page.keyboard.press(vim ? "Shift+A" : "End"); // vim: append at the end of the line, in insert mode
  await page.keyboard.press("Enter");
  await page.keyboard.type("![[peek-pic.svg]]", { delay: 20 });
  await page.keyboard.press("Escape"); // close the [[ list (and, in vim, leave insert: the caret stays in the link)
  await expect(page.locator(".cm-line", { hasText: "peek-pic.svg" })).toBeVisible();
  await expect(page.locator(".cm-content img.cm-embed-image")).toHaveCount(2);

  // Ctrl+click opens it in its own tab (a plain click edits)
  await page.locator(".cm-content img.cm-embed-image").first().click({ modifiers: ["Control"] });
  await expect(page.getByRole("option", { name: /peek-pic\.svg/ }).first()).toBeVisible();
});
