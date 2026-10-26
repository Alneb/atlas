// PDFs for the specs, written by hand (no PDF library or Python needed): ASCII objects, so offsets are lengths.

/** A well-formed PDF of `objs` (object 1 is the catalog): the header, the objects, their cross-reference and trailer. */
export function writePdf(objs: string[]): string {
  let out = "%PDF-1.4\n";
  const at: number[] = [];
  objs.forEach((o, i) => { at.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${at.map((n) => `${String(n).padStart(10, "0")} 00000 n \n`).join("")}`;
  return `${out}trailer\n<</Size ${objs.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF\n`;
}

/** A link on a page: a web address, at a rectangle in points from the bottom left. */
export interface PdfLink { rect: [number, number, number, number]; uri: string }

/** Letter-sized pages of Helvetica text (a line every 30 pt from the top), each with its web links. */
export function textPdf(pages: { lines: string[]; links?: PdfLink[] }[]): string {
  const page = (i: number) => 4 + i * 2;
  const objs = ["<</Type/Catalog/Pages 2 0 R>>", `<</Type/Pages/Kids[${pages.map((_, i) => `${page(i)} 0 R`).join(" ")}]/Count ${pages.length}>>`, "<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>"];
  pages.forEach(({ lines, links = [] }, i) => {
    const body = lines.map((l, n) => `BT /F1 14 Tf 72 ${700 - n * 30} Td (${l.replace(/[()\\]/g, "\\$&")}) Tj ET`).join("\n");
    const annots = links.map((l) => `<</Type/Annot/Subtype/Link/Rect[${l.rect.join(" ")}]/Border[0 0 0]/A<</S/URI/URI(${l.uri})>>>>`).join("");
    objs.push(`<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Resources<</Font<</F1 3 0 R>>>>${annots ? `/Annots[${annots}]` : ""}/Contents ${page(i) + 1} 0 R>>`, `<</Length ${body.length}>>\nstream\n${body}\nendstream`);
  });
  return writePdf(objs);
}
