import { test, expect, type APIRequestContext } from "@playwright/test";

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
  await page.keyboard.press("Control+p");
  await page.keyboard.type("long.md");
  await expect(page.getByTestId("palette").getByText("long", { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Enter");
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
