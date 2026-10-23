import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { WS } from "../playwright.config";

// The user (2026-10-16, on the phone): "the notes renderer still has some problems, pdf's, some blocks … dont render
// correctly". `![[x.pdf]]` and `![[Note#Heading]]` were link chips; Obsidian embeds both (lib/embeds.ts).
const H = { "x-atlas": "1" };

/** A one-page PDF with the word "Embedded" on it, small enough to write here. */
function tinyPdf(): Buffer {
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    "<< /Length 44 >>\nstream\nBT /F1 24 Tf 40 100 Td (Embedded) Tj ET\nendstream",
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

test("a PDF and a note's section are embedded, not shown as links", async ({ page, request }) => {
  mkdirSync(join(WS, "embeds"), { recursive: true });
  writeFileSync(join(WS, "embeds/tiny.pdf"), tinyPdf());
  await request.put("/api/file", { headers: H, data: { path: "embeds/Source.md", text: "# Source\n\nintro\n\n## Part\n\nonly this part\n\n## Other\n\nnot this\n" } });
  await request.put("/api/file", { headers: H, data: { path: "embeds/Host.md", text: "# Host\n\n![[embeds/Source#Part]]\n\nbetween\n\n![[embeds/tiny.pdf]]\n" } });
  // written beside the core, not through it: wait until the vault's index has it, as a link resolves against that
  await expect.poll(async () => ((await (await request.get("/api/files", { headers: H })).json()) as string[]).includes("embeds/tiny.pdf")).toBe(true);
  await page.goto("/");
  await page.keyboard.press("Control+p");
  await page.keyboard.type("Host");
  await expect(page.getByTestId("palette").getByText("Host", { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Enter");
  const note = page.locator(".note-embed").first();
  await expect(note).toContainText("only this part");
  await expect(note).not.toContainText("not this");
  // the PDF viewer, drawn in place
  await expect(page.locator(".pdf-embed.atlas-block").getByRole("toolbar", { name: "Annotation tools" })).toBeVisible();
  await expect(page.locator(".pdf-embed canvas").first()).toBeVisible({ timeout: 15000 });
});

// "all files should be able to render when embedded": a table as the table, a sound as a player,
// a file nothing draws as a card that opens it
test("any file embeds: a table drawn, a sound played, the rest a card", async ({ page, request }) => {
  mkdirSync(join(WS, "embeds"), { recursive: true });
  writeFileSync(join(WS, "embeds/runs.tsv"), "T\tE\n0.5\t-1.2\n1.0\t-0.8\n");
  writeFileSync(join(WS, "embeds/beep.ogg"), Buffer.from("OggS"));
  writeFileSync(join(WS, "embeds/data.zip"), Buffer.from("PK\x03\x04"));
  await request.put("/api/file", { headers: H, data: { path: "embeds/Shelf of files.md", text: "# Shelf of files\n\n![[embeds/runs.tsv]]\n\n![[embeds/beep.ogg]]\n\n![[embeds/data.zip]]\n" } });
  await expect.poll(async () => ((await (await request.get("/api/files", { headers: H })).json()) as string[]).includes("embeds/data.zip")).toBe(true);
  await page.goto("/");
  await page.keyboard.press("Control+p");
  await page.keyboard.type("Shelf of files");
  await expect(page.getByTestId("palette").getByText("Shelf of files", { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator(".file-embed.atlas-block").first()).toContainText("-1.2", { timeout: 15000 });
  await expect(page.locator(".file-embed audio.embed-audio")).toHaveCount(1);
  const zip = page.locator(".file-embed .file-card");
  await expect(zip).toHaveText("data.zip");
});
