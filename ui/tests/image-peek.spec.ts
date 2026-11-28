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

// The large picture covers the small one: moving within it keeps it, leaving it hides it.
test("the large picture stays while the pointer is within it, Ctrl held", async ({ page, request }) => {
  await request.put("/api/file", { headers: H, data: { path: "notes/peek-pic.svg", text: SVG } });
  await request.put("/api/file", { headers: H, data: { path: "notes/peek-stay.md", text: "# Stay\n\n![[peek-pic.svg]]\n\nend\n" } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await openFile(page, "peek-stay.md");
  const img = page.locator(".cm-content img.cm-embed-image").first();
  await expect(img).toBeVisible();
  await img.hover();
  await page.keyboard.down("Control");
  const big = page.locator("img.image-peek");
  await expect(big).toBeVisible();
  const r = (await big.boundingBox())!;
  const s = (await img.boundingBox())!;
  // a point of the large picture off the small one
  const x = s.x + s.width + 20 < r.x + r.width ? s.x + s.width + 20 : r.x + 5, y = r.y + r.height - 5;
  await page.mouse.move(x, y, { steps: 4 });
  await expect(big).toBeVisible();
  await page.mouse.move(r.x + r.width + 30 < 1280 ? r.x + r.width + 30 : 2, 2, { steps: 4 });
  await expect(big).toHaveCount(0);
  await page.keyboard.up("Control");
});

// A display formula grows with Ctrl as a picture does; its preview while edited leaves `\label{…}` out; a quick Ctrl+click
// (an action, not a look) shows nothing large.
test("a formula grows with Ctrl held; its edit preview hides the label; a quick Ctrl+click shows nothing", async ({ page, request }) => {
  await request.put("/api/file", { headers: H, data: { path: "notes/peek-math.md", text: "# Math\n\n$$\nE = mc^2 \\label{eq-peek}\n$$\n\nend\n" } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await openFile(page, "peek-math.md");
  const formula = page.locator(".cm-content .katex-display").first();
  await expect(formula).toBeVisible();
  await formula.hover();
  await page.keyboard.down("Control");
  const big = page.locator(".image-peek.math-peek");
  await expect(big).toBeVisible();
  await expect(big).toContainText("E");
  await page.keyboard.up("Control");
  await expect(big).toHaveCount(0);

  // a quick Ctrl+click on the text: no large copy flashes
  await page.locator(".cm-line", { hasText: "end" }).hover();
  await page.keyboard.down("Control");
  await page.mouse.down();
  await page.mouse.up();
  await page.keyboard.up("Control");
  await page.waitForTimeout(300);
  await expect(page.locator(".image-peek")).toHaveCount(0);

  // the caret in the formula: its source shows, and the preview under it draws no `\label`
  await page.locator(".cm-line", { hasText: "end" }).click();
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  const preview = page.locator(".cm-math-preview-block");
  await expect(preview).toBeVisible();
  await expect(preview).not.toContainText("label");
  await expect(preview.locator(".katex-error")).toHaveCount(0);
});

// Scrolling a note slides pictures under a still pointer; the mouseover WebKit sends then may say Ctrl is down (a stale
// state from a Ctrl+S just before). Only a Ctrl really held for a look opens the large picture, and a wheel ends one.
test("a scroll never opens the large picture: a stale Ctrl on a mouseover, or Ctrl+wheel", async ({ page, request }) => {
  await request.put("/api/file", { headers: H, data: { path: "notes/peek-scroll.svg", text: SVG } });
  await request.put("/api/file", { headers: H, data: { path: "notes/peek-scroll.md", text: "# Scroll\n\n![[peek-scroll.svg]]\n\nend\n" } });
  await page.goto("/");
  await openFile(page, "peek-scroll.md");
  const img = page.locator(".cm-content img.cm-embed-image").first();
  await expect(img).toBeVisible();
  // a mouseover saying Ctrl, with no Ctrl pressed: nothing
  await img.dispatchEvent("mouseover", { ctrlKey: true, bubbles: true });
  await page.waitForTimeout(300);
  await expect(page.locator(".image-peek")).toHaveCount(0);
  // Ctrl held and the wheel turned at once (the pane's zoom): no picture after the hold either
  await img.hover();
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, 40);
  await page.waitForTimeout(300);
  await expect(page.locator(".image-peek")).toHaveCount(0);
  await page.keyboard.up("Control");
  // a real look still works (hovered again: the zoom may have moved the picture)
  await img.hover();
  await page.keyboard.down("Control");
  await expect(page.locator("img.image-peek")).toBeVisible();
  await page.keyboard.up("Control");
});
