import { test, expect, type Page } from "@playwright/test";
import { writePdf } from "./fixtures/pdf";

// Glance mode (lib/where.svelte.ts): every page tells the vault's live room `.atlas/cache/where` what it shows; one
// following another opens the same file, full screen, and moves when the other turns a PDF's page. Esc stops it.
const H = { "x-atlas": "1" };
/** A three-page PDF, one line of Helvetica a page (ASCII: offsets are lengths). */
function pdf(): string {
  const page = (i: number) => 4 + i * 2;
  const objs = ["<</Type/Catalog/Pages 2 0 R>>", `<</Type/Pages/Kids[${[0, 1, 2].map((i) => `${page(i)} 0 R`).join(" ")}]/Count 3>>`, "<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>"];
  for (const i of [0, 1, 2]) {
    const body = `BT /F1 24 Tf 72 700 Td (Glance page ${i + 1}) Tj ET`;
    objs.push(`<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Resources<</Font<</F1 3 0 R>>>>/Contents ${page(i) + 1} 0 R>>`, `<</Length ${body.length}>>\nstream\n${body}\nendstream`);
  }
  return writePdf(objs);
}
const atlas = (p: Page) => ({
  open: (path: string) => p.evaluate((x) => (window as unknown as { __atlas: { open(p: string): void } }).__atlas.open(x), path),
  run: (id: string) => p.evaluate((x) => (window as unknown as { __atlas: { run(id: string): void } }).__atlas.run(x), id),
});

test("a page follows what another shows: the note, then the PDF and its page; Esc stops", async ({ page, request }, info) => {
  await request.put("/api/file", { headers: H, data: { path: "notes/glance-a.md", text: "# Glance A\n\nShown on the other device.\n" } });
  await request.put("/api/file", { headers: H, data: { path: "books/glance.pdf", text: pdf() } });
  const other = await page.context().newPage();
  for (const p of [page, other]) { await p.goto("/"); await expect(p.getByTestId("sidebar")).toBeVisible({ timeout: 20_000 }); }
  await atlas(other).open("notes/glance-a.md");
  await expect(other.locator(".cm-content", { hasText: "Shown on the other device." })).toBeVisible();

  await expect(async () => { await atlas(page).run("ui.glance"); await expect(page.locator("html.glance")).toHaveCount(1, { timeout: 1000 }); }).toPass({ timeout: 15_000 });
  await expect(page.locator(".cm-content", { hasText: "Shown on the other device." })).toBeVisible();

  await atlas(other).open("books/glance.pdf");
  const there = other.locator(".pdf-pane").last();
  await expect(there.locator(".pager .faint")).toHaveText("/ 3", { timeout: 20_000 });
  await there.locator(".page-in").fill("3");
  await there.locator(".page-in").press("Enter");
  const here = page.locator(".pdf-pane").last();
  await expect(here.locator(".page-in")).toHaveValue("3", { timeout: 20_000 });
  for (const theme of ["light", "dark"]) {
    await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
    await page.screenshot({ path: info.outputPath(`glance-${theme}.png`) });
  }
  await page.keyboard.press("Escape");
  await expect(page.locator("html.glance")).toHaveCount(0);
  for (const p of ["notes/glance-a.md", "books/glance.pdf"]) await request.post(`/api/fs/trash?path=${encodeURIComponent(p)}`, { headers: H });
});
