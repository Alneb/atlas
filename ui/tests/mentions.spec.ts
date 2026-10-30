import { test, expect } from "@playwright/test";
import { openFile } from "./open";
const H = { "x-atlas": "1" };

// docs/guides/MALLEABLE.md R4 (Embark's mentions): `[@key]` is a chip for a Library paper — hover shows the
// paper, a click opens its reading note; an unknown key is marked, not hidden. The file stays plain.
test("@citekey mentions: chip, hover card, missing key, click opens the reading note", async ({ page, request }) => {
  await request.put("/api/file", { headers: H, data: { path: "notes/reading.md", text: "# Reading\n\nAs [@anderson1972more] argued; see also @nosuchpaper2001.\n\nmail me@example.org\n" } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await openFile(page, "reading.md");
  const chip = page.locator('.cm-content .atlas-mention[data-mention="anderson1972more"]');
  await expect(chip).toBeVisible();
  await expect(page.locator('.cm-content .atlas-mention[data-mention="nosuchpaper2001"]')).toHaveClass(/is-missing/);
  await expect(page.locator(".cm-content .atlas-mention")).toHaveCount(2); // the e-mail is not a mention
  await chip.hover();
  await expect(page.locator(".atlas-mention-card")).toContainText("More Is Different");
  await expect(page.locator(".atlas-mention-card")).toContainText("1972");
  // the reading note is <citekey>.md, made on the first click: properties, the paper's block, a place to write
  await chip.click();
  await expect(page.locator(".dv-tab.dv-active-tab")).toContainText("anderson1972more");
  await expect(page.locator(".breadcrumb, .crumbs, [class*=crumb]").first()).toContainText("anderson1972more");
  const note = await (await request.get("/api/file?path=refs/papers/anderson1972more/anderson1972more.md", { headers: H })).json();
  expect(note.text).toMatch(/^---\ntype: literature\ncitekey: anderson1972more\n[^]*\nsource: https:\/\/doi\.org\/10\.1126\/science\.177\.4047\.393\n[^]*```view\ntype: library\.paper\n```\n\n## Notes\n/);
  await expect(page.locator(".paper-block")).toContainText("Anderson, P. W.");
});
