import { test, expect, type APIRequestContext } from "@playwright/test";
import { openFile } from "./open";

// Typewriter scrolling ([editor] typewriter): the line being written stays at mid-height of the pane.
const H = { "x-atlas": "1" };
async function setTypewriter(request: APIRequestContext, on: boolean) {
  const d = await (await request.get("/api/config", { headers: H })).json();
  d.config.editor.typewriter = on;
  expect((await request.put("/api/config", { headers: H, data: d.config })).ok()).toBeTruthy();
}
test.afterEach(async ({ request }) => { await setTypewriter(request, false); });

test("with typewriter scrolling the caret's line stays in the middle of the pane", async ({ page, request }) => {
  await request.put("/api/file", { headers: H, data: { path: "notes/long.md", text: Array.from({ length: 160 }, (_, i) => `Line ${i + 1} of a long note.`).join("\n\n") + "\n" } });
  await setTypewriter(request, true);
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await openFile(page, "long.md");
  await page.locator(".cm-content").click();
  await page.keyboard.press("Escape");
  await page.keyboard.type("80Gohere"); // vim: line 80, a new line under it, typing
  const off = async () => {
    const line = (await page.locator(".cm-activeLine").first().boundingBox())!, pane = (await page.locator(".cm-scroller").first().boundingBox())!;
    return Math.abs(line.y + line.height / 2 - (pane.y + pane.height / 2));
  };
  await expect.poll(off).toBeLessThan(40);
  for (let i = 0; i < 6; i++) await page.keyboard.press("Enter"); // keep writing: it stays there
  await expect.poll(off).toBeLessThan(40);
});

// CodeMirror draws a tooltip only inside the editor less its scroll margins: the typewriter's left a one-line band, and
// every completion list under the caret was placed off screen (top -10000px) though it was open
test("with typewriter scrolling a completion list shows under the caret", async ({ page, request }) => {
  await setTypewriter(request, true);
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await openFile(page, "journal.md");
  await page.locator(".cm-content").click();
  await page.keyboard.press("Escape");
  await page.keyboard.type("Go");
  await page.keyboard.type("see [[jou", { delay: 40 });
  const list = page.locator(".cm-tooltip-autocomplete");
  await expect(list).toBeVisible();
  await expect.poll(async () => (await list.boundingBox())?.y ?? -1).toBeGreaterThan(0);
  const caret = (await page.locator(".cm-activeLine").first().boundingBox())!;
  expect(Math.abs((await list.boundingBox())!.y - (caret.y + caret.height))).toBeLessThan(40);
});
