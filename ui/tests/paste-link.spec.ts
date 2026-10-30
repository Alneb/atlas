import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { openFile } from "./open";
const H = { "x-atlas": "1" };
const text = (r: APIRequestContext, f: string) => r.get(`/api/file?path=${f}`, { headers: H }).then((x) => x.json()).then((j) => j.text as string);

async function openWithClipboard(page: Page, request: APIRequestContext, f: string, body: string, clip: string) {
  await request.put("/api/file", { headers: H, data: { path: f, text: body } });
  await page.goto("/");
  await openFile(page, f.split("/").pop()!);
  await page.locator(".cm-content").click();
  await page.evaluate((c) => navigator.clipboard.writeText(c), clip);
  await page.keyboard.press("Escape");
}

// With vim, Ctrl+V is block-visual, so pasting is Ctrl+Shift+V — and vim used to drop the visual
// selection on that keystroke, so the paste landed at the caret (depth audit, POLISH §1).
test.describe("paste over a vim visual selection", () => {
  test.beforeEach(async ({ context }) => { await context.grantPermissions(["clipboard-read", "clipboard-write"]); });

  test("a URL makes [text](url) in a note, back in NORMAL", async ({ page, request }) => {
    await openWithClipboard(page, request, "notes/paste-link.md", "# Paste\n\nSee the docs here.\n", "https://example.org");
    await page.keyboard.type("ggjj0wve"); // the "See" line, second word: "the"
    await expect(page.getByTestId("vim-mode")).toHaveText(/VISUAL/);
    await page.keyboard.press("Control+Shift+v");
    await expect.poll(() => text(request, "notes/paste-link.md")).toContain("See [the](https://example.org) docs here.");
    await expect(page.getByTestId("vim-mode")).toHaveText(/NORMAL/);
  });

  test("plain text replaces the selection (code file too)", async ({ page, request }) => {
    await openWithClipboard(page, request, "notes/paste-plain.py", "x = old_name + 1\n", "new_name");
    await page.keyboard.type("gg0wwve"); // "old_name"
    await page.keyboard.press("Control+Shift+v");
    await expect(page.getByTestId("vim-mode")).toHaveText(/NORMAL/);
    await page.keyboard.press("Control+s"); // a code file is saved by Ctrl+S only ([editor] autosave_code off)
    await expect.poll(() => text(request, "notes/paste-plain.py")).toBe("x = new_name + 1\n");
    await expect(page.getByTestId("vim-mode")).toHaveText(/NORMAL/);
  });
});
