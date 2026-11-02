import { test, expect } from "@playwright/test";
import { openFile } from "./open";

test("pasting an image saves it beside the note and embeds it", async ({ page, request }) => {
  const h = { "x-atlas": "1" };
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await openFile(page, "paste.md");
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

test("a paste that hands over nothing (WebKitGTK's paste-as-plain-text of a picture) takes the clipboard's picture from the core", async ({ page, request }) => {
  const h = { "x-atlas": "1" };
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  // the desktop's clipboard stands in: a test never reads the real one
  await page.route("**/api/clipboard/image", (r) => r.fulfill({ status: 200, contentType: "image/png", body: png }));
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await openFile(page, "paste.md");
  await expect(page.locator(".cm-content")).toContainText("A figure goes here");
  const before = (await (await request.get("/api/file?path=notes/paste.md", { headers: h })).json()).text as string;
  const count = (before.match(/!\[\[Pasted image/g) ?? []).length;
  await page.locator(".cm-content").click();
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.setData("text/plain", "");
    document.querySelector(".cm-content")!.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await expect.poll(async () => ((await (await request.get("/api/file?path=notes/paste.md", { headers: h })).json()).text.match(/!\[\[Pasted image \d{14}\.png\]\]/g) ?? []).length, { timeout: 15_000 }).toBe(count + 1);
});
