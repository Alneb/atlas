// An EPUB built in the test (EPUB 3: container, package, nav, two chapters, a stylesheet) and the Books plugin copied
// into the test workspace — shared by the Books specs (example-books, books-ink).
import { copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { crc32, deflateRawSync } from "node:zlib";

/** A zip of `[name, text, deflated]` entries, as an EPUB is. */
export function zip(files: [string, string, boolean][]): Buffer {
  const locals: Buffer[] = [], central: Buffer[] = [];
  let at = 0;
  for (const [name, text, deflate] of files) {
    const data = Buffer.from(text), body = deflate ? deflateRawSync(data) : data, n = Buffer.from(name);
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(deflate ? 8 : 0, 8);
    h.writeUInt32LE(crc32(data), 14); h.writeUInt32LE(body.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(n.length, 26);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(deflate ? 8 : 0, 10);
    c.writeUInt32LE(crc32(data), 16); c.writeUInt32LE(body.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(at, 42);
    locals.push(h, n, body); central.push(c, n);
    at += 30 + n.length + body.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(at, 16);
  return Buffer.concat([...locals, cd, end]);
}
export const xhtml = (title: string, body: string) => `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>${title}</title><link rel="stylesheet" href="../style/book.css"/></head><body>${body}</body></html>`;
export const para = (n: number) => Array.from({ length: n }, (_, i) => `<p>Paragraph ${i + 1} of a long chapter about superconducting qubits, written long enough that it needs several pages on a small screen.</p>`).join("");

export const EPUB = zip([
  ["mimetype", "application/epub+zip", false],
  ["META-INF/container.xml", `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`, true],
  ["OEBPS/content.opf", `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Quantum Notes</dc:title><dc:creator>A. Author</dc:creator></metadata>
    <manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="c1" href="text/one.xhtml" media-type="application/xhtml+xml"/><item id="c2" href="text/two.xhtml" media-type="application/xhtml+xml"/><item id="css" href="style/book.css" media-type="text/css"/></manifest>
    <spine><itemref idref="c1"/><itemref idref="c2"/></spine></package>`, true],
  ["OEBPS/nav.xhtml", xhtml("Contents", `<nav epub:type="toc"><ol><li><a href="text/one.xhtml">One: qubits</a></li><li><a href="text/two.xhtml#end">Two: readout</a></li></ol></nav>`), true],
  ["OEBPS/text/one.xhtml", xhtml("One", `<h1>One</h1><p><a href="two.xhtml">to chapter two</a></p>${para(40)}<script>document.title = "ran";</script>`), true],
  ["OEBPS/text/two.xhtml", xhtml("Two", `<h1>Two</h1>${para(3)}<p id="end">The end of the book.</p>`), true],
  ["OEBPS/style/book.css", "h1 { letter-spacing: 2px; }", false],
]);

/** The Books plugin's run-time files into `dir` (a workspace's `.atlas/plugins/books`). */
export function installBooks(dir: string) {
  mkdirSync(join(dir, "shared"), { recursive: true }); // view.js imports shared/marks.js and shared/ink.js
  for (const f of ["plugin.toml", "main.js", "view.js", "shared/marks.js", "shared/ink.js", "helper.js"]) copyFileSync(new URL(`../../plugins/beta/books/${f}`, import.meta.url), join(dir, f));
}
