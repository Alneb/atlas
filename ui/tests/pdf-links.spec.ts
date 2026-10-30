import { test, expect } from "@playwright/test";
import { openFile } from "./open";
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { WS } from "../playwright.config";

// Places in a PDF are linked the Obsidian way: [[x.pdf#page=N]] opens that page; the PDF's "Copy link" gives such a link (lib/pdf-place.ts).
const PAPERS = process.env.ATLAS_TEST_PAPERS ?? "";
const PAPER = join(PAPERS, "georges1996dynamical");
test.skip(!existsSync(PAPER), `needs the paper georges1996dynamical in ${PAPERS} (set ATLAS_TEST_PAPERS)`);
const H = { "x-atlas": "1" };

test("a link to a PDF page opens there, and the PDF copies a link to where it is", async ({ page, request, context }) => {
  mkdirSync(join(WS, "pdfs"), { recursive: true });
  copyFileSync(join(PAPER, readdirSync(PAPER).find((f) => f.endsWith(".pdf"))!), join(WS, "pdfs/linked.pdf"));
  await request.put("/api/file", { headers: H, data: { path: "notes/pdf-link.md", text: "# Places\n\nsee [[pdfs/linked.pdf#page=3|the third page]]\n" } });
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await openFile(page, "pdf-link.md");
  await page.locator(".cm-content").getByText("the third page").click();
  const pdf = page; // the PDF pane is the one in front
  await expect(pdf.getByRole("textbox", { name: "Page", exact: true })).toHaveValue("3", { timeout: 20_000 });
  await pdf.getByRole("button", { name: "Copy link" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("[[pdfs/linked.pdf#page=3]]");
});

// "Highlights → note" writes [[x.pdf#page=N&annotation=<id>|p.N]] for each highlight: the link opens that page and
// flashes the highlight (pdf.js's annotation id = the object number + "R").
test("a link to an annotation opens its page and points at it", async ({ page, request }) => {
  mkdirSync(join(WS, "pdfs"), { recursive: true });
  const made = execFileSync("uv", ["run", "-q", "--with", "pymupdf", "python", "-c", [
    "import pymupdf, sys", "d = pymupdf.open()", "for i in range(3): d.new_page().insert_text((72, 90), f'Page {i+1} of the model')",
    "a = d[2].add_highlight_annot(d[2].search_for('of the model')[0])", "d.save(sys.argv[1])", "print(a.xref)",
  ].join("\n"), join(WS, "pdfs/annotated.pdf")], { encoding: "utf8" }).trim();
  await request.put("/api/file", { headers: H, data: { path: "notes/pdf-annot-link.md", text: `# Highlights\n\n- [[pdfs/annotated.pdf#page=3&annotation=${made}R|p.3]] — > of the model\n` } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await openFile(page, "pdf-annot-link.md");
  await page.locator(".cm-content").getByText("p.3").click();
  await expect(page.getByRole("textbox", { name: "Page", exact: true })).toHaveValue("3", { timeout: 20_000 });
  await expect(page.locator(`.pdf-pane .page[data-page-number="3"] [data-annotation-id="${made}R"].atlas-flash`)).toBeAttached();
});
