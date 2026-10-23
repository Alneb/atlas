// A Sheet back to text in the file's own layout: rows never edited keep their bytes as read, edited ones are written
// with the same delimiter, quoting and spacing, and comment lines stay where they were.
import type { Layout, Sheet } from "./parse";

/** One field as the layout writes it: quoted when it must be (or when the file quotes everything). */
function field(v: string, l: Layout): string {
  if (l.delimiter === " ") return v.replace(/\s+/g, "_") || "-"; // whitespace columns cannot hold a blank
  const must = v.includes(l.delimiter) || v.includes('"') || /[\r\n]/.test(v) || v !== v.trim();
  return l.quoteAll || must ? `"${v.replace(/"/g, '""')}"` : v;
}

export function rowText(cells: string[], l: Layout): string {
  if (l.columnEnds && cells.length === l.columnEnds.length) {
    // right-aligned on the file's column edges, a field too wide pushing the rest along by one space
    let out = "";
    cells.forEach((v, k) => { const f = field(v, l); out += " ".repeat(Math.max(k ? 1 : 0, l.columnEnds![k] - out.length - f.length)) + f; });
    return out;
  }
  return cells.map((v) => field(v, l)).join(l.delimiter === " " ? " " : l.spaceAfter ? `${l.delimiter} ` : l.delimiter);
}

export function writeSheet(s: Sheet): string {
  const l = s.layout, lines: string[] = [];
  const before = new Map<number, string[]>();
  for (const c of s.comments) before.set(c.at, [...(before.get(c.at) ?? []), c.text]);
  const comments = (at: number) => lines.push(...(before.get(at) ?? []));
  comments(-1);
  if (s.headerSource === "row") lines.push(s.headerRaw ?? rowText(s.header, l));
  s.rows.forEach((r, i) => {
    comments(i);
    lines.push(s.raw[i] ?? rowText(r, l));
  });
  comments(s.rows.length);
  return (l.bom ? "\ufeff" : "") + lines.join(l.eol) + (l.trailingEol ? l.eol : "");
}
