// `$$align` … `$$`: display math whose first line is `align` (or `align*`) is written as plain lines and drawn as that
// environment, each line aligned at its first relation. The note keeps the short form; only the drawing expands it.
// Obsidian shows such a block as a plain formula (the word `align` and the lines run together).

const RELATIONS = [":=", "=:", "\\leq", "\\geq", "\\leqslant", "\\geqslant", "\\le", "\\ge", "\\neq", "\\ne", "\\approx", "\\equiv",
  "\\simeq", "\\sim", "\\cong", "\\propto", "\\Rightarrow", "\\Leftarrow", "\\Leftrightarrow", "\\implies",
  "\\impliedby", "\\iff", "\\ll", "\\gg", "=", "<", ">"];

/** Where the first relation outside every bracket starts (`a_{i=1} = b` → the second `=`), or -1. */
export function firstRelation(line: string): number {
  let depth = 0;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === "\\") {
      const name = /^\\([A-Za-z]+|.)/.exec(line.slice(i))![0];
      const sized = /^\\(left|right|big|Big|bigg|Bigg)[lr]?$/.exec(name);
      if (sized) { // its bracket follows, a character or a command (`\\left\\{`): counted here, not again
        const delimiter = /^(\\([A-Za-z]+|.)|.)/.exec(line.slice(i + name.length))?.[0] ?? "";
        const opens = name === "\\left" || /l$/.test(name) || (!/r$/.test(name) && name !== "\\right" && "{([".includes(delimiter.slice(-1)));
        depth += opens ? 1 : -1;
        i += name.length + delimiter.length - 1;
        continue;
      }
      if (depth === 0 && RELATIONS.includes(name) && !/[A-Za-z]/.test(line[i + name.length] ?? "")) return i;
      i += name.length - 1;
      continue;
    }
    if ("{([".includes(c)) depth++;
    else if ("})]".includes(c)) depth--;
    else if (depth === 0 && "=<>:".includes(c)) {
      if (c === ":" && line[i + 1] !== "=") continue;
      if (c === "=" && line[i - 1] === ":") continue;
      return i;
    }
  }
  return -1;
}

/** One line, aligned: `&` before its first relation; a line that goes on a sum (`+ c`) sits after the relation. */
function alignLine(line: string): string {
  if (/(^|[^\\])&/.test(line)) return line; // aligned by hand
  if (/^[+\-]/.test(line) || /^\\(cdot|times|pm|mp)\b/.test(line)) return `&\\quad ${line}`;
  const at = firstRelation(line);
  return at <= 0 ? `&${line}` : `${line.slice(0, at).trimEnd()} &${line.slice(at)}`;
}

/** The environment for a `$$align` block, or the source as it was. */
export function expandAlign(source: string): string {
  const m = /^\s*(align\*?)[ \t]*(?:\n|$)([\s\S]*)$/.exec(source);
  if (!m) return source;
  const lines = m[2].split("\n").map((l) => l.trim().replace(/\\\\$/, "").trim()).filter(Boolean);
  return `\\begin{${m[1]}}${lines.length ? `\n${lines.map(alignLine).join(" \\\\\n")}\n` : ""}\\end{${m[1]}}`;
}
