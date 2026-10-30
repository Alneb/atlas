import { test, expect } from "@playwright/test";
import { openFile } from "./open";

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
  await openFile(page, "apart.md");
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

test("or compared side by side, a choice per difference", async ({ page, request }, info) => {
  const same = Array.from({ length: 12 }, (_, i) => `line ${i + 1}`).join("\n");
  await request.put("/api/file", { headers: H, data: { path: NOTE, text: `# Apart\n\nmine first\n${same}\nmine last\n` } });
  await request.put("/api/file", { headers: H, data: { path: COPY, text: `# Apart\n\nphone first\n${same}\nphone last\n` } });
  await openNote(page);
  await page.getByTestId("sync-copy").getByRole("button", { name: "Compare…" }).click();
  const dlg = page.getByTestId("sync-compare");
  await expect(dlg).toContainText("2 differences");
  await expect(dlg.locator(".fold")).toHaveText("8 lines the same");
  const diffs = dlg.locator(".diff");
  await expect(diffs).toHaveCount(2);
  await diffs.nth(0).locator(".side.theirs").click();
  await diffs.nth(1).getByRole("button", { name: "Both" }).click();
  for (const theme of ["light", "dark"]) {
    await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
    await dlg.screenshot({ path: info.outputPath(`compare-${theme}.png`) });
  }
  await dlg.getByRole("button", { name: "Use this" }).click();
  await expect(dlg).toHaveCount(0);
  await expect.poll(() => read(request, NOTE), { timeout: 15_000 }).toBe(`# Apart\n\nphone first\n${same}\nmine last\nphone last\n`);
  await expect.poll(() => read(request, COPY)).toBeNull();
});
