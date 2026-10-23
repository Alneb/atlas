import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { WS } from "../playwright.config";

// A PDF's ink on the desktop (lib/pdf-ink.ts): what a device
// wrote to `x.pdf.excalidraw` — a frame per page holding the page's picture (`atlasPage`, never stored) and the ink over
// it, as the Boox's Notepad writes it (InkStore.java) — is drawn over that page of the PDF pane, and follows a new save.
const H = { "x-atlas": "1" };

/** A one-page PDF (A4, a line of text), with its cross-reference table counted. */
function onePagePdf(): Buffer {
  const body = "BT /F1 24 Tf 72 760 Td (Ink over a page) Tj ET";
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${body.length} >>\nstream\n${body}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const at: number[] = [];
  objs.forEach((o, i) => { at.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${at.map((n) => `${String(n).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

const base = { angle: 0, strokeColor: "#000000", backgroundColor: "transparent", fillStyle: "solid", strokeWidth: 2, strokeStyle: "solid", roughness: 0, opacity: 100, groupIds: [], roundness: null, seed: 1, version: 1, versionNonce: 1, isDeleted: false, boundElements: null, updated: 1, link: null, locked: false };
const companion = (strokes: number) => JSON.stringify({
  type: "excalidraw", version: 2, source: "atlas (notepad)", files: {}, appState: {},
  elements: [
    { ...base, id: "page-1", type: "frame", x: 0, y: 0, width: 794, height: 1123, name: "Page 1", frameId: null, locked: true },
    { ...base, id: "picture-1", type: "image", x: 0, y: 0, width: 794, height: 1123, frameId: "page-1", fileId: "pdf-page-1", status: "saved", scale: [1, 1], crop: null, link: "[[inked.pdf#page=1]]", locked: true, customData: { atlasPage: { file: "pdf-ink/inked.pdf", page: 1 } } },
    ...Array.from({ length: strokes }, (_, i) => ({ ...base, id: `ink-${i}`, type: "freedraw", x: 100, y: 200 + i * 60, width: 400, height: 0, points: [[0, 0], [200, 0], [400, 0]], pressures: [], simulatePressure: false, lastCommittedPoint: null, frameId: "page-1" })),
  ],
});

test("the ink of a PDF's companion drawing lies over its page, and follows another save", async ({ page }) => {
  mkdirSync(join(WS, "pdf-ink"), { recursive: true });
  writeFileSync(join(WS, "pdf-ink/inked.pdf"), onePagePdf());
  await page.request.put("/api/file", { headers: H, data: { path: "pdf-ink/inked.pdf.excalidraw", text: companion(1) } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Control+p");
  await page.keyboard.type("inked.pdf");
  await page.getByTestId("palette").getByRole("button", { name: /^inked\.pdf/ }).first().click();
  const ink = page.locator('.page[data-page-number="1"] > img.atlas-ink');
  await expect(ink).toHaveCount(1, { timeout: 20_000 });
  const first = await ink.getAttribute("src");
  // drawn over the whole page, never in the way of the text under it
  const [img, pg] = await Promise.all([ink.boundingBox(), page.locator('.page[data-page-number="1"]').boundingBox()]);
  expect(Math.abs(img!.width - pg!.width)).toBeLessThan(4);
  await expect(ink).toHaveCSS("pointer-events", "none");
  // another device saves more ink: drawn again
  await page.request.put("/api/file", { headers: H, data: { path: "pdf-ink/inked.pdf.excalidraw", text: companion(3) } });
  await expect.poll(() => ink.getAttribute("src")).not.toBe(first);
});

// a saved mark taken out from the PDF pane: the eraser clicks it, the drawing marks it deleted (as Excalidraw does, so
// another device merging takes it out too), and the page shows no ink
test("the PDF pane's eraser takes a saved mark out of the drawing", async ({ page }) => {
  mkdirSync(join(WS, "pdf-ink"), { recursive: true });
  writeFileSync(join(WS, "pdf-ink/erased.pdf"), onePagePdf());
  await page.request.put("/api/file", { headers: H, data: { path: "pdf-ink/erased.pdf.excalidraw", text: companion(1) } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Control+p");
  await page.keyboard.type("erased.pdf");
  await page.getByTestId("palette").getByRole("button", { name: /^erased\.pdf/ }).first().click();
  const pg = page.locator('.page[data-page-number="1"]');
  await expect(pg.locator("> img.atlas-ink")).toHaveCount(1, { timeout: 20_000 });
  await page.locator(".pdf-pane").getByRole("button", { name: "Eraser" }).click();
  const box = (await pg.boundingBox())!;
  // the stroke: scene (100…500, 200) on a 794-wide page frame
  await page.mouse.click(box.x + box.width * (300 / 794), box.y + box.height * (200 / 1123));
  await expect.poll(async () => {
    const f = await (await page.request.get("/api/file?path=pdf-ink/erased.pdf.excalidraw", { headers: H })).json();
    return (JSON.parse(f.text).elements as { id: string; isDeleted?: boolean }[]).find((e) => e.id === "ink-0")?.isDeleted;
  }).toBe(true);
  await expect(pg.locator("> img.atlas-ink")).toHaveCount(0);
});
