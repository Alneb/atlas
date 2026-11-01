// Fenced code in Markdown, read as CommonMark (and the editor) reads it: the core's reader
// (crates/atlas-text/src/fence.rs `Fences`), line for line, for every walk here over a note's lines that must leave code
// out. A fence opens with three or more backticks or tildes (up to three spaces in) and closes with a run of the same
// mark at least as long, with nothing after it: a ``` inside a ```` block, a ~~~ inside a ``` one, or ```js, do not.

/** A walk over a note's lines: `code(line)` for each in order says whether it is code (a fence line or inside one). */
export function fences(): { code: (line: string) => boolean } {
  let open: { mark: string; n: number } | null = null;
  return {
    code(line: string): boolean {
      const t0 = line.replace(/^ +/, "");
      const indented = line.length - t0.length > 3;
      const t = t0.replace(/[\r\n]+$/, "");
      const run = (c: string) => { let r = 0; while (t[r] === c) r++; return r; };
      if (open) {
        const r = run(open.mark);
        if (!indented && r >= open.n && !t.slice(r).trim()) open = null;
        return true;
      }
      for (const mark of ["`", "~"]) {
        const r = run(mark);
        if (r >= 3 && (mark === "~" || !t.slice(r).includes("`"))) {
          if (indented) return false;
          open = { mark, n: r };
          return true;
        }
      }
      return false;
    },
  };
}
