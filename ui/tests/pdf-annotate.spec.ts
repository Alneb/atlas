import { test, expect, type Page } from "@playwright/test";
import { copyFileSync, mkdirSync, readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { WS } from "../playwright.config";

// Fixtures added at test time (the shared config stays untouched): one real paper copied read-only
// from a papers library (`ATLAS_TEST_PAPERS`). Without that paper the tests are skipped, and say so.
const PAPERS = process.env.ATLAS_TEST_PAPERS ?? "";
const PHD_PAPER = join(PAPERS, "georges1996dynamical");
test.skip(!existsSync(PHD_PAPER), `needs the paper georges1996dynamical in ${PAPERS} (set ATLAS_TEST_PAPERS)`);
// Outside refs/papers so the Library tests keep their fixture count; notes go to <name>.notes.md.
const PDF_REL = "pdfs/annotate-me.pdf";

test.beforeAll(() => {
  mkdirSync(join(WS, "pdfs"), { recursive: true });
  const pdf = readdirSync(PHD_PAPER).find((f) => f.endsWith(".pdf"))!;
  copyFileSync(join(PHD_PAPER, pdf), join(WS, PDF_REL));
});

function trackErrors(page: Page): string[] {
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push(e.message));
  page.on("console", (m) => m.type() === "error" && errs.push(m.text()));
  return errs;
}

test("PDF: ink + highlight are saved into its note as they are made (the PDF untouched), find", async ({ page }) => {
  const errs = trackErrors(page);
  const abs = join(WS, PDF_REL);
  const before = statSync(abs).size, pdfBytes = readFileSync(abs);
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

  // Highlight: drag across words; letting go marks them.
  await pdfPane.getByTitle(/^Highlight \(H\)/).click();
  const span = page.locator(".textLayer span").filter({ hasText: /\w{4,}/ }).nth(2);
  const sb = (await span.boundingBox())!;
  await page.mouse.move(sb.x + 1, sb.y + sb.height / 2);
  await page.mouse.down();
  await page.mouse.move(sb.x + sb.width - 1, sb.y + sb.height / 2, { steps: 8 });
  await page.mouse.up();
  const words = (await span.textContent())!.trim();
  await pdfPane.getByTitle("Select (V)").click();

  await page.screenshot({ path: "test-results/pdf-annotated.png" });
  // saved into the PDF's note (its pdf-marks block), the store every device writes: the PDF itself untouched
  type Mark = { kind: string; page: number; quote?: { exact: string }; strokes?: { samples: string }[] };
  const marks = async (): Promise<Mark[]> => (await (await page.request.get(`/api/pdf-marks?pdf=${encodeURIComponent(PDF_REL)}`, { headers: { "x-atlas": "1" } })).json()).marks;
  await expect.poll(async () => (await marks()).map((m) => m.kind).sort().join(","), { timeout: 20_000 }).toBe("highlight,ink");
  expect(statSync(abs).size).toBe(before);
  expect(readFileSync(abs).equals(pdfBytes)).toBe(true);
  const ms = await marks();
  expect(ms.find((m) => m.kind === "ink")!.strokes![0].samples.length).toBeGreaterThan(10);
  // the highlight keeps its words (the span's own text, give or take its edges)
  const quote = ms.find((m) => m.kind === "highlight")!.quote!.exact;
  expect(words.replace(/\s+/g, " ")).toContain(quote.split(" ")[0]);
  expect(readFileSync(join(WS, "pdfs/annotate-me.md"), "utf8").trimEnd().endsWith("```")).toBe(true);
  await expect(page.locator('.page[data-page-number="1"] svg.atlas-marks [data-mark]')).toHaveCount(2, { timeout: 20_000 });

  await page.keyboard.press("Control+f");
  await page.keyboard.type("impurity");
  await expect(pdfPane.locator(".findbar .faint")).toHaveText(/\d+\/\d+/);

  expect(errs).toEqual([]);
});
