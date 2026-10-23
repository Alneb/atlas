import { test, expect } from "@playwright/test";

// Syncthing kept another device's version beside a note and the core could not merge it (no base here: as when both
// changed the same lines; core sync_merge.rs, DESIGN-mirror-v2.md §4): the note says so, and settles it either way.
const H = { "x-atlas": "1" };
const NOTE = "notes/apart.md";
const COPY = "notes/apart.sync-conflict-20261020-231529-H3IIIUW.md";
const read = async (request: import("@playwright/test").APIRequestContext, path: string) => {
  const r = await request.get(`/api/file?path=${encodeURIComponent(path)}`, { headers: H });
  return r.ok() ? (await r.json()).text as string : null;
};

async function openNote(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Control+p");
  await page.keyboard.type("apart.md");
  await expect(page.getByTestId("palette").getByText("apart", { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Enter");
}

test("the other device's version: taken into the note, the copy gone", async ({ page, request }) => {
  await request.put("/api/file", { headers: H, data: { path: NOTE, text: "# Apart\n\nwritten here\n" } });
  await request.put("/api/file", { headers: H, data: { path: COPY, text: "# Apart\n\nwritten on the phone\n" } });
  await openNote(page);
  const banner = page.getByTestId("sync-copy");
  await expect(banner).toContainText("Another device changed the same lines");
  await banner.getByRole("button", { name: "Take the other" }).click();
  await expect(page.locator(".cm-content")).toContainText("written on the phone");
  await expect.poll(() => read(request, NOTE), { timeout: 15_000 }).toBe("# Apart\n\nwritten on the phone\n");
  await expect.poll(() => read(request, COPY)).toBeNull();
  await expect(banner).toHaveCount(0);
});

test("or this one kept, the other version to the trash", async ({ page, request }) => {
  await request.put("/api/file", { headers: H, data: { path: NOTE, text: "# Apart\n\nkept here\n" } });
  await request.put("/api/file", { headers: H, data: { path: COPY, text: "# Apart\n\nfrom elsewhere\n" } });
  await openNote(page);
  const banner = page.getByTestId("sync-copy");
  await banner.getByRole("button", { name: "Keep this one" }).click();
  await expect(banner).toHaveCount(0);
  await expect.poll(() => read(request, COPY)).toBeNull();
  expect(await read(request, NOTE)).toBe("# Apart\n\nkept here\n");
});
