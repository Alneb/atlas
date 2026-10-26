import { test, expect, type APIRequestContext } from "@playwright/test";

// The page's list of every file (lib/vault.ts, what links resolve against) follows file events without fetching the
// whole list again: a new file or folder is asked for alone (`/api/files?under=`), a removal drops what was under it.
const H = { "x-atlas": "1" };
const trash = (r: APIRequestContext, path: string) => r.post(`/api/fs/trash?path=${encodeURIComponent(path)}`, { headers: H });

test("a new file, a new folder and a removal reach the links without listing the whole vault again", async ({ page, request }) => {
  // a page showing the note rendered (NoteBlock → Markdown, which resolves links against the list)
  await request.put("/api/file", { headers: H, data: { path: "notes/delta-host.md", text: "# Delta host\n\nSee [[delta-new]] and [[delta-inner]].\n" } });
  await request.put("/api/file", { headers: H, data: { path: "Delta.page", text: "title: Delta\nrows:\n  - [{note: notes/delta-host.md}]\n" } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Control+p");
  await page.keyboard.type("Delta.page");
  await expect(page.getByTestId("palette").getByText("Delta", { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Enter");
  const unresolved = page.locator(".internal-link.is-unresolved", { hasText: /delta-/ });
  await expect(unresolved).toHaveCount(2);

  const asked: string[] = [];
  page.on("request", (r) => { const u = new URL(r.url()); if (u.pathname === "/api/files") asked.push(u.search); });
  await request.put("/api/file", { headers: H, data: { path: "notes/delta-new.md", text: "# New\n" } });
  await expect(unresolved).toHaveCount(1);
  await request.put("/api/file", { headers: H, data: { path: "notes/delta-dir/delta-inner.md", text: "# Inner\n" } });
  await expect(unresolved).toHaveCount(0);
  expect((await trash(request, "notes/delta-dir")).ok()).toBe(true);
  await expect(unresolved).toHaveCount(1);
  expect(asked.length, "asked for the new paths").toBeGreaterThan(0);
  expect(asked.every((q) => q.includes("under=")), `never the whole list: ${asked.join(" ")}`).toBe(true);

  for (const p of ["notes/delta-host.md", "notes/delta-new.md", "Delta.page"]) await trash(request, p);
});
