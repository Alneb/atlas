import { test, expect } from "@playwright/test";

test("pasting an image saves it beside the note and embeds it", async ({ page, request }) => {
  const h = { "x-atlas": "1" };
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Control+p");
  await page.keyboard.type("paste.md");
  await expect(page.getByTestId("palette").getByText("paste", { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Enter");
  // the note must be loaded first: as the suite's first test the server is cold (flaky otherwise)
  await expect(page.locator(".cm-content")).toContainText("A figure goes here");
  await page.locator(".cm-content").click();
  // a 1×1 PNG pasted the way a screenshot tool hands it over: a File named "image.png"
  await page.evaluate(() => {
    const b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], "image.png", { type: "image/png" }));
    document.querySelector(".cm-content")!.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  // the folder does not exist until the paste lands (a 404 object, not a list): keep polling
  await expect.poll(async () => {
    const j = await (await request.get("/api/tree?path=notes/attachments", { headers: h })).json();
    return Array.isArray(j) ? j.map((e: { name: string }) => e.name).join() : "";
  }, { timeout: 15_000 }).toMatch(/^Pasted image \d{14}\.png$/);
  await expect.poll(async () => (await (await request.get("/api/file?path=notes/paste.md", { headers: h })).json()).text)
    .toMatch(/!\[\[Pasted image \d{14}\.png\]\]/);
});
