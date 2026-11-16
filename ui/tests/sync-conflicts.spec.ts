import { test, expect } from "@playwright/test";

// The Sync conflicts view: every Syncthing conflict copy the core left for the user (no base here, as when both devices
// changed the same lines; core sync_merge.rs `left_copies`, GET /api/sync/conflicts), one row each with the note, the
// device and the date, and the ways out a note's banner offers. Another program's copy (.obsidian/) is not listed.
const H = { "x-atlas": "1" };
const A = "notes/apart-list.md", A_COPY = "notes/apart-list.sync-conflict-20261028-113314-J3SZH65.md";
const B = "apart-two.md", B_COPY = "apart-two.sync-conflict-20261101-080512-FAF6EWY.md";
const OTHER = ".obsidian/workspace.sync-conflict-20261101-080512-FAF6EWY.json";
const read = async (request: import("@playwright/test").APIRequestContext, path: string) => {
  const r = await request.get(`/api/file?path=${encodeURIComponent(path)}`, { headers: H });
  return r.ok() ? (await r.json()).text as string : null;
};

test("every copy left, listed with its device and date, settled from the list", async ({ page, request }, info) => {
  for (const [path, text] of [[A, "# Apart\n\nwritten here\n"], [A_COPY, "# Apart\n\nwritten on the phone\n"], [B, "# Two\n\nkept here\n"], [B_COPY, "# Two\n\nfrom the laptop\n"], [OTHER, "{}"]]) {
    await request.put("/api/file", { headers: H, data: { path, text } });
  }
  const listed = await (await request.get("/api/sync/conflicts", { headers: H })).json() as { path: string; original: string; device: string; made: string }[];
  expect(listed.map((c) => c.path)).toEqual(expect.arrayContaining([A_COPY, B_COPY]));
  expect(listed.some((c) => c.path === OTHER)).toBe(false);
  expect(listed.find((c) => c.path === A_COPY)).toMatchObject({ original: A, device: "J3SZH65", made: "2026-10-28T11:33:14" });
  const ofA = await (await request.get(`/api/sync/conflicts?path=${encodeURIComponent(A)}`, { headers: H })).json() as { path: string }[];
  expect(ofA.map((c) => c.path)).toEqual([A_COPY]);

  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("F1");
  await page.keyboard.type("Sync conflicts");
  await page.keyboard.press("Enter");
  const view = page.getByTestId("sync-conflicts");
  const rowA = view.getByTestId("sync-conflict").filter({ hasText: "apart-list" });
  const rowB = view.getByTestId("sync-conflict").filter({ hasText: "apart-two" });
  await expect(rowA).toContainText("J3SZH65");
  await expect(rowB).toContainText("FAF6EWY");
  await expect(view).not.toContainText("workspace");
  for (const theme of ["light", "dark"]) {
    await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
    await view.screenshot({ path: info.outputPath(`list-${theme}.png`) });
  }

  // Take the other: the note on disk becomes the copy's text, the copy goes to the trash
  await rowA.getByRole("button", { name: "Take the other" }).click();
  await expect(rowA).toHaveCount(0);
  await expect.poll(() => read(request, A), { timeout: 15_000 }).toBe("# Apart\n\nwritten on the phone\n");
  await expect.poll(() => read(request, A_COPY)).toBeNull();

  // Keep this one: the copy to the trash, the note as it was
  await rowB.getByRole("button", { name: "Keep this one" }).click();
  await expect(rowB).toHaveCount(0);
  await expect.poll(() => read(request, B_COPY)).toBeNull();
  expect(await read(request, B)).toBe("# Two\n\nkept here\n");
});
