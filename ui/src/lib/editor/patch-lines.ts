// Reading a unified diff into marks for the lines of the new file. No imports: the git gutter uses it, and a test reads it directly.
export type LineChange = "added" | "changed" | "removed";

/** What a unified diff says about the lines of the new file (1-based). `removed` sits on the line the missing text came before. */
export function changedLines(patch: string): Map<number, LineChange> {
  const out = new Map<number, LineChange>();
  if (/^--- \/dev\/null$/m.test(patch) || /^new file mode/m.test(patch)) return out; // untracked: nothing to compare with
  let line = 0, minus = 0, inHunk = false;
  const flush = () => { if (minus && !out.has(line)) out.set(line, "removed"); minus = 0; };
  for (const l of patch.split("\n")) {
    const h = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(l);
    if (h) { flush(); line = Number(h[1]); inHunk = true; continue; }
    if (!inHunk) continue;
    if (l.startsWith("-")) minus++;
    else if (l.startsWith("+")) { out.set(line, minus > 0 ? "changed" : "added"); if (minus > 0) minus--; line++; }
    else if (l.startsWith(" ")) { flush(); line++; }
    else if (l.startsWith("\\")) continue; // "\ No newline at end of file"
    else { flush(); inHunk = false; }
  }
  flush();
  return out;
}

