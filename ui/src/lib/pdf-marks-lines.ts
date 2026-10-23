// A pdf-marks block's lines read in the browser, for the note's view of it (the core's pdf_marks.rs is the writer and
// the one that merges): `<id> <kind> p<page> <json>` a line. A line it cannot read, and a removed mark, are left out.
import type { Mark } from "./gen/Mark";

const LINE = /^(m-[0-9a-z]{8}) ([a-z-]+) p(\d+) (\{.*\})\s*$/;

export function marksOfBlock(source: string): Mark[] {
  const out: Mark[] = [];
  for (const line of source.split("\n")) {
    const m = LINE.exec(line.trim());
    if (!m || m[2] === "deleted") continue;
    try {
      const rest = JSON.parse(m[4]) as Record<string, unknown>;
      out.push({ version: 0, tags: [], ...rest, id: m[1], kind: m[2], page: Number(m[3]) } as Mark);
    } catch { /* kept in the note as it is; nothing to show */ }
  }
  return out;
}
