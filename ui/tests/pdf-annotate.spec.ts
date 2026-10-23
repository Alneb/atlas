import { test, expect, type Page } from "@playwright/test";
import { copyFileSync, mkdirSync, writeFileSync, readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { WS } from "../playwright.config";

// Fixtures added at test time (the shared config stays untouched): one real paper copied read-only
// from a papers library (`ATLAS_TEST_PAPERS`) and the annotation-export
// command pointing at this checkout. Without that paper the tests are skipped, and say so.
const PAPERS = process.env.ATLAS_TEST_PAPERS ?? "";
const PHD_PAPER = join(PAPERS, "georges1996dynamical");
test.skip(!existsSync(PHD_PAPER), `needs the paper georges1996dynamical in ${PAPERS} (set ATLAS_TEST_PAPERS)`);
// Outside refs/papers so the Library tests keep their fixture count; notes go to <name>.notes.md.
const PDF_REL = "pdfs/annotate-me.pdf";
const TOOLS = join(process.cwd(), "..", "scripts", "vault"); // playwright runs from ui/

test.beforeAll(() => {
  mkdirSync(join(WS, "pdfs"), { recursive: true });
  const pdf = readdirSync(PHD_PAPER).find((f) => f.endsWith(".pdf"))!;
  copyFileSync(join(PHD_PAPER, pdf), join(WS, PDF_REL));
  mkdirSync(join(WS, ".atlas/commands"), { recursive: true });
  writeFileSync(join(WS, ".atlas/commands/pdf.annotations.toml"), `title = "PDF: export annotations"\nrun = "uv run --script ${TOOLS}/pdf_annotations.py"\n`);
});

function trackErrors(page: Page): string[] {
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push(e.message));
  page.on("console", (m) => m.type() === "error" && errs.push(m.text()));
  return errs;
}

test("PDF: ink + highlight, Ctrl+S saves them into its drawing (the PDF untouched), find, export to notes", async ({ page }) => {
  const errs = trackErrors(page);
  const abs = join(WS, PDF_REL);
  const before = statSync(abs).size;
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Control+p");
  await page.keyboard.type("annotate-me");
  await expect(page.getByTestId("palette").getByText("annotate-me.pdf").first()).toBeVisible();
  await page.keyboard.press("Enter");
  const pdfPane = page.locator(".pdf-pane");
  const firstPage = page.locator(".pdfViewer .page").first();
  await expect(page.locator(".textLayer").first()).toContainText(/mean-field/i, { timeout: 15_000 });

  // Pen stroke (a stylus produces the same pointer events).
  await pdfPane.getByTitle("Pen / stylus (P)").click();
  const box = (await firstPage.boundingBox())!;
  // In the page's visible top margin (the page itself is taller than the viewport).
  const y0 = Math.max(box.y, 80) + 40;
  await page.mouse.move(box.x + box.width * 0.3, y0);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(box.x + box.width * (0.3 + i * 0.02), y0 + (i % 2) * 8);
  await page.mouse.up();
  await pdfPane.getByTitle("Select (V)").click(); // commits the ink editor

  // Highlight: drag across the first line of text.
  await pdfPane.getByTitle("Highlight (H)").click();
  const span = page.locator(".textLayer span").filter({ hasText: /\w{4,}/ }).nth(2);
  const sb = (await span.boundingBox())!;
  await page.mouse.move(sb.x + 1, sb.y + sb.height / 2);
  await page.mouse.down();
  await page.mouse.move(sb.x + sb.width - 1, sb.y + sb.height / 2, { steps: 8 });
  await page.mouse.up();
  await pdfPane.getByTitle("Select (V)").click();

  await expect(pdfPane.locator(".dot")).toBeVisible(); // unsaved annotations
  await page.screenshot({ path: "test-results/pdf-annotated.png" });
  // saved into the PDF's companion drawing, the store every device writes: the PDF itself untouched, the marks shown over its page from the drawing
  const pdfBytes = readFileSync(abs);
  await page.keyboard.press("Control+s");
  await expect(pdfPane.locator(".status")).toContainText("Saved into");
  await expect(pdfPane.locator(".dot")).toHaveCount(0);
  expect(statSync(abs).size).toBe(before);
  expect(readFileSync(abs).equals(pdfBytes)).toBe(true);
  const drawing = JSON.parse(readFileSync(`${abs}.excalidraw`, "utf8")) as { elements: { type: string; customData?: Record<string, unknown> }[] };
  expect(drawing.elements.some((e) => e.type === "freedraw")).toBe(true);
  expect(drawing.elements.some((e) => e.customData?.atlasHighlight)).toBe(true);
  expect(drawing.elements.some((e) => (e.customData?.atlasPage as { page?: number } | undefined)?.page === 1)).toBe(true);
  await expect(page.locator('.page[data-page-number="1"] > img.atlas-ink')).toHaveCount(1, { timeout: 20_000 });

  await page.keyboard.press("Control+f");
  await page.keyboard.type("impurity");
  await expect(pdfPane.locator(".findbar .faint")).toHaveText(/\d+\/\d+/);

  await pdfPane.getByRole("button", { name: "Highlights into the note" }).click();
  await expect(pdfPane.locator(".status")).toContainText("annotations →", { timeout: 30_000 });
  const notes = readFileSync(join(WS, "pdfs/annotate-me.notes.md"), "utf8");
  expect(notes).toContain("<!-- atlas:annotations -->");
  expect(notes).toMatch(/\[\[pdfs\/annotate-me\.pdf#page=1\|p\.1\]\] — > \S+/); // the drawing's highlight, its passage read under it
  expect(notes).toContain("handwritten mark");
  expect(errs).toEqual([]);
});
