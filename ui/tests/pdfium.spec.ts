import { test, expect } from "@playwright/test";

// PDF pages are drawn by PDFium in its worker (lib/pdf-pages.ts), the reader's included (lib/pdf-reader.ts): a PDF
// whose first page is turned (/Rotate 90, left half red, right half blue: red on top once turned) and whose others are
// one colour each, sampled a quarter and three quarters down each picture.
const H = { "x-atlas": "1" };
const PATH = "pdfium-test/colours.pdf";

interface Page { draw: string; rotate?: number }
const fill = ([r, g, b]: number[], x = 0, w = 200) => `${r} ${g} ${b} rg ${x} 0 ${w} 260 re f`;
const PAGES: Page[] = [
  { draw: `${fill([1, 0, 0], 0, 100)} ${fill([0, 0, 1], 100, 100)}`, rotate: 90 },
  { draw: fill([0, 0, 1]) }, { draw: fill([1, 0, 0]) }, { draw: fill([0, 1, 0]) },
];
/** Each picture's samples, "top/bottom" as rgb bits ("001" = blue). */
const EXPECTED = ["100/001", "001/001", "100/100", "010/010"];

/** A well-formed 200×260 pt PDF of `pages` (ASCII only, so offsets = lengths). */
function makePdf(pages: Page[]): string {
  const objs: string[] = ["<</Type/Catalog/Pages 2 0 R>>", ""];
  const kids: string[] = [];
  for (const { draw, rotate } of pages) {
    const page = objs.length + 1, content = page + 1;
    kids.push(`${page} 0 R`);
    objs.push(`<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 260]${rotate ? `/Rotate ${rotate}` : ""}/Contents ${content} 0 R>>`, `<</Length ${draw.length}>>\nstream\n${draw}\nendstream`);
  }
  objs[1] = `<</Type/Pages/Kids[${kids.join(" ")}]/Count ${pages.length}>>`;
  let out = "%PDF-1.4\n";
  const at: number[] = [];
  objs.forEach((o, i) => { at.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${at.map((n) => `${String(n).padStart(10, "0")} 00000 n \n`).join("")}`;
  return `${out}trailer\n<</Size ${objs.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF\n`;
}

test.beforeAll(async ({ request }) => {
  await request.put("/api/file", { headers: H, data: { path: PATH, text: makePdf(PAGES) } });
});
test.afterAll(async ({ request }) => {
  await request.post(`/api/fs/trash?path=${encodeURIComponent("pdfium-test")}`, { headers: H }).catch(() => {});
});

/** A canvas's samples a quarter and three quarters down its middle, as "top/bottom" rgb bits. */
const samples = (c: Element) => [0.25, 0.75].map((f) => {
  const k = c as HTMLCanvasElement, d = k.getContext("2d")!.getImageData(k.width >> 1, Math.floor(k.height * f), 1, 1).data;
  return [d[0], d[1], d[2]].map((v) => (v > 128 ? 1 : 0)).join("");
}).join("/");

/** Opens the PDF in the reader; returns its pane once the page count shows. */
async function openReader(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.request.post("/api/cmd/open", { headers: H, data: { args: { path: PATH } } });
  const pane = page.locator(".pdf-pane").last();
  await expect(pane.locator(".pager .faint")).toHaveText(`/ ${PAGES.length}`, { timeout: 20000 });
  return pane;
}

/** The page thumbnails' samples. */
async function thumbColours(page: import("@playwright/test").Page): Promise<string[]> {
  const pane = await openReader(page);
  await pane.getByRole("button", { name: "Pages", exact: true }).click();
  const canvases = pane.locator(".thumbs .thumb canvas");
  await expect(canvases).toHaveCount(PAGES.length);
  for (let i = 0; i < PAGES.length; i++) await expect(canvases.nth(i)).toHaveAttribute("data-rendered", "1");
  return canvases.evaluateAll((cs, f) => cs.map(new Function(`return ${f}`)()), samples.toString());
}

test("page thumbnails are drawn by PDFium, each page its own, a turned page turned", async ({ page }) => {
  const workers: string[] = [];
  page.on("worker", (w) => workers.push(w.url()));
  expect(await thumbColours(page)).toEqual(EXPECTED);
  expect(workers.some((u) => /pdfium/.test(u)), `workers started: ${workers.join(", ")}`).toBe(true);
});

test("the reader's own page is drawn by PDFium, the right way up, with its text layer over it", async ({ page }) => {
  const workers: string[] = [];
  page.on("worker", (w) => workers.push(w.url()));
  const pane = await openReader(page); // thumbnails closed: only the reader can have started PDFium
  const canvas = pane.locator('.page[data-page-number="1"] canvas').first();
  await expect.poll(() => canvas.evaluate(samples), { timeout: 20000 }).toBe(EXPECTED[0]);
  expect(workers.some((u) => /pdfium/.test(u)), `workers started: ${workers.join(", ")}`).toBe(true);
  await expect(pane.locator('.page[data-page-number="1"] .textLayer')).toHaveCount(1);
});

test("PDFium unavailable (its wasm cannot load): the reader says so and opens the file with pdf.js on request", async ({ page }) => {
  await page.route(/pdfium[^/]*\.wasm/, (r) => r.abort());
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.request.post("/api/cmd/open", { headers: H, data: { args: { path: PATH } } });
  const pane = page.locator(".pdf-pane").last();
  await expect(pane).toContainText("PDFium could not open this PDF", { timeout: 20000 });
  await pane.getByRole("button", { name: "Open with pdf.js" }).click();
  // pictures only, no text: the page drawn is the sign it opened
  await expect(pane.locator('.page[data-page-number="1"] canvas').first()).toBeAttached({ timeout: 20000 });
  await expect(pane.locator(".overlay")).toHaveCount(0);
  await expect(pane.locator(".title .engine")).toHaveText("pdf.js");
});
