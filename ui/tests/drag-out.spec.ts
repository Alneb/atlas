import { test, expect } from "@playwright/test";

// A vault row dragged out of the app is a file to the desktop: `text/uri-list` (file://, the vault being on this
// computer) for Linux file managers, `DownloadURL` for Chromium (WebView2 on Windows); inside the app, the path.
test("a file row dragged from the tree carries the path, a file:// URI and a download URL", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Meta+Shift+f"); // the Files pane
  await page.locator('.row.is-dir[data-path="notes"]').first().click(); // opened
  const row = page.locator('.row[data-path="notes/hubbard.md"]').first();
  await row.waitFor();
  const got = await row.evaluate((el) => {
    const dt = new DataTransfer();
    el.dispatchEvent(new DragEvent("dragstart", { dataTransfer: dt, bubbles: true, cancelable: true }));
    return { path: dt.getData("application/x-atlas-path"), text: dt.getData("text/plain"), uri: dt.getData("text/uri-list"), dl: dt.getData("DownloadURL") };
  });
  expect(got.path).toBe("notes/hubbard.md");
  expect(got.text).toBe("notes/hubbard.md");
  expect(got.uri).toMatch(/^file:\/\/\/.+\/notes\/hubbard\.md$/);
  expect(got.dl).toMatch(/^application\/octet-stream:hubbard\.md:http:\/\/127\.0\.0\.1:\d+\/api\/raw\?path=notes%2Fhubbard\.md$/);
  // the file:// URI names the real file: the server serves the same bytes under /api/raw
  const raw = await (await page.request.get(got.dl.split(":").slice(2).join(":"))).text();
  expect(raw.length).toBeGreaterThan(0);
});

test("a folder row dragged out carries its file:// URI but no download", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Meta+Shift+f");
  const row = page.locator('.row.is-dir[data-path="notes"]').first();
  await row.waitFor();
  const got = await row.evaluate((el) => {
    const dt = new DataTransfer();
    el.dispatchEvent(new DragEvent("dragstart", { dataTransfer: dt, bubbles: true, cancelable: true }));
    return { uri: dt.getData("text/uri-list"), dl: dt.getData("DownloadURL") };
  });
  expect(got.uri).toMatch(/^file:\/\/\/.+\/notes$/);
  expect(got.dl).toBe("");
});
