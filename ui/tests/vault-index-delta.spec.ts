import { test, expect, type APIRequestContext } from "@playwright/test";
import { openFile } from "./open";

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
  await openFile(page, "Delta.page");
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

// The editor colours a link by the same list: a note made after the link was drawn turns it from missing to found
// without the line being touched (the editor redraws on the list's change).
test("a link in the editor stops looking missing once its note is made", async ({ page, request }) => {
  await request.put("/api/file", { headers: H, data: { path: "notes/delta-editor.md", text: "# Delta editor\n\nSee [[delta-later]].\n" } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await openFile(page, "delta-editor.md");
  const link = page.locator(".cm-content .cm-hmd-internal-link", { hasText: "delta-later" });
  await expect(link).toHaveClass(/is-unresolved/);
  await request.put("/api/file", { headers: H, data: { path: "notes/delta-later.md", text: "# Later\n" } });
  await expect(link).not.toHaveClass(/is-unresolved/);
  await trash(request, "notes/delta-later.md");
  await expect(link, "and missing again once it is gone").toHaveClass(/is-unresolved/);
  for (const p of ["notes/delta-editor.md"]) await trash(request, p);
});
