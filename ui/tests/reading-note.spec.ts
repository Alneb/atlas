import { test, expect } from "@playwright/test";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { WS } from "../playwright.config";

// docs/guides/ZOTERO.md, "The reading note": a paper's note is `<folder>/<citekey>.md` (so `[[citekey]]` is
// unique and matches `[@citekey]`), made on first use with the paper's properties and the
// `library.paper` block (details + the PDF); a legacy `notes.md` is renamed on first use.
const H = { "x-atlas": "1" };
const DIR = "refs/papers/hubbard1963electron";

/** A one-page PDF that pdf.js reads (offsets computed, so no repair is needed). */
function tinyPdf(): string {
  const text = "BT /F1 18 Tf 20 100 Td (Hubbard model) Tj ET";
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const at: number[] = [];
  objs.forEach((o, i) => { at.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${at.map((n) => `${String(n).padStart(10, "0")} 00000 n \n`).join("")}`;
  return `${out}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
}

test("the Library's Notes renames a legacy notes.md to <citekey>.md, which shows the paper and its PDF", async ({ page, request }) => {
  await request.put("/api/file", { headers: H, data: { path: `${DIR}/notes.md`, text: "Old note from Zotero.\n" } });
  writeFileSync(join(WS, DIR, "hubbard.pdf"), tinyPdf(), "latin1");
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Meta+Shift+L");
  const lib = page.locator(".library");
  await lib.getByPlaceholder(/Search title/).fill("hubbard 1963");
  await expect(lib.locator(".row")).toHaveCount(1);
  await expect(lib.locator(".row .flag", { hasText: "notes" })).toBeVisible(); // a legacy note counts
  await lib.locator(".detail").getByRole("button", { name: "Notes" }).click();
  await expect(page.locator(".dv-tab.dv-active-tab")).toContainText("hubbard1963electron");

  const note = await (await request.get(`/api/file?path=${DIR}/hubbard1963electron.md`, { headers: H })).json();
  // the properties (their order follows the vault's literature template when an earlier test installed one)
  const fm = note.text.match(/^---\n([^]*?)\n---\n/)?.[1] ?? "";
  for (const line of ["type: literature", "citekey: hubbard1963electron", "title: Electron correlations in narrow energy bands", "authors:\n  - Hubbard, J.", "year: 1963"]) expect(fm).toContain(line);
  // the creation stamp the vault's spec names: `date`, "YYYY-MM-DD HH:mm" (playwright.config.ts's properties.yaml)
  expect(fm).toMatch(/^date: \d{4}-\d\d-\d\d \d\d:\d\d$/m);
  expect(fm).not.toMatch(/^created:/m);
  expect(note.text).toContain("```view\ntype: library.paper\n```\n\nOld note from Zotero.\n");
  expect(existsSync(join(WS, DIR, "notes.md"))).toBe(false);

  const block = page.locator(".paper-block");
  await expect(block).toContainText("Hubbard, J.");
  // in its own note the heading above already says it (the embedded PDF pane's bar has a title of its own)
  await expect.poll(() => block.evaluate((b) => [...b.querySelectorAll(".title")].filter((t) => !t.closest(".atlas-pane")).length)).toBe(0);
  await expect(block).toContainText("Proc. R. Soc. Lond. A");
  await expect(block.locator(".atlas-pane-pdf")).toBeVisible();
  await expect(block.locator(".textLayer").first()).toContainText("Hubbard model", { timeout: 15_000 });
});

test("a library.paper block elsewhere names its paper by key; an unknown key says so", async ({ page, request }) => {
  await request.put("/api/file", { headers: H, data: { path: "notes/cited.md", text: "# Cited\n\n```view\ntype: library.paper\nkey: anderson1972more\nhide_pdf: true\n```\n\n```view\ntype: library.paper\nkey: nosuch2001\n```\n" } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Control+p");
  await page.keyboard.type("cited.md");
  await expect(page.getByTestId("palette").getByText("cited", { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Enter");
  const blocks = page.locator(".paper-block");
  await expect(blocks.first().locator(".title")).toHaveText("More Is Different");
  await expect(blocks.first().getByRole("link", { name: /doi:10\.1126/ })).toBeVisible();
  await expect(blocks.first().locator(".abstract summary")).toHaveText("Abstract");
  await expect(blocks.nth(1)).toContainText("No paper “nosuch2001” in the Library.");
});
