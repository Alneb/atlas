// Delimited text → table. Shape-based: the delimiter is the one giving the most consistent
// column count, a header is a first row that is text while the rows below are numbers, and a
// trailing `# a b c` comment line (common in physics output) also counts as a header.
export interface Table { header: string[]; rows: string[][]; numeric: boolean[]; delimiterName: string }

const NUM = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$|^[-+]?(inf|nan)$/i;
const isNum = (s: string) => NUM.test(s.trim());

function splitQuoted(line: string, d: string): string[] {
  if (!line.includes('"')) return line.split(d);
  const out: string[] = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === d) { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

type Splitter = { name: string; split: (l: string) => string[] };
const SPLITTERS: Splitter[] = [
  { name: "tab-separated", split: (l) => l.split("\t") },
  { name: "comma-separated", split: (l) => splitQuoted(l, ",") },
  { name: "semicolon-separated", split: (l) => splitQuoted(l, ";") },
  { name: "whitespace-separated", split: (l) => l.trim().split(/\s+/) },
];

/** The splitter whose column count is >1 and most constant over a sample of lines. */
function sniff(lines: string[], path: string): Splitter {
  const sample = lines.slice(0, 50);
  let best = SPLITTERS[3], bestScore = -1;
  for (const s of SPLITTERS) {
    const counts = sample.map((l) => s.split(l).length);
    const mode = counts.sort((a, b) => counts.filter((x) => x === b).length - counts.filter((x) => x === a).length)[0] ?? 1;
    if (mode < 2) continue;
    const score = sample.filter((l) => s.split(l).length === mode).length / sample.length + (s.name.startsWith(/\.csv$/i.test(path) ? "comma" : "tab") ? 0.01 : 0);
    if (score > bestScore) { best = s; bestScore = score; }
  }
  return best;
}

export function parseTable(text: string, path = ""): Table {
  const all = text.replace(/\r\n?/g, "\n").split("\n");
  const comments: string[] = [];
  let i = 0;
  while (i < all.length && /^\s*[#%]/.test(all[i])) comments.push(all[i++]);
  const lines = all.slice(i).filter((l) => l.trim() !== "");
  const sp = sniff(lines, path);
  let rows = lines.map((l) => sp.split(l).map((c) => c.trim()));
  const width = Math.max(1, ...rows.slice(0, 200).map((r) => r.length));
  let header: string[];
  const first = rows[0] ?? [];
  const textFirst = first.length > 0 && first.filter(isNum).length < first.length / 2;
  const numericBelow = rows.slice(1, 20).some((r) => r.filter(isNum).length >= r.length / 2);
  const commentHeader = comments.length ? sp.split(comments[comments.length - 1].replace(/^\s*[#%]\s*/, "")).map((c) => c.trim()) : [];
  if (textFirst && (numericBelow || rows.length === 1)) { header = first; rows = rows.slice(1); }
  else if (commentHeader.length === width) header = commentHeader;
  else header = Array.from({ length: width }, (_, k) => `col ${k + 1}`);
  const numeric = header.map((_, k) => {
    const vals = rows.slice(0, 500).map((r) => r[k] ?? "").filter((v) => v !== "");
    return vals.length > 0 && vals.filter(isNum).length / vals.length >= 0.9;
  });
  return { header, rows, numeric, delimiterName: sp.name };
}
