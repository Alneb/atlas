import { test, expect } from "@playwright/test";
import { boxShown, charAt, findWords, lineBoxes, runsOf, textOf, toPage, toShown, unturn, type Chars } from "../src/lib/pdf-geom";
import type { Box } from "../src/lib/pdfium-worker";

// The reader's geometry (lib/pdf-geom.ts): PDFium's page space (points, y up) to the shown page (its /Rotate applied,
// y down) and back, the reader's own rotation undone, a page's characters cut into the text layer's runs.
const VIEW: Box = [10, 20, 210, 280]; // a 200 × 260 pt page whose box does not start at 0

test("page space and shown space map both ways, for every /Rotate", () => {
  for (const rot of [0, 1, 2, 3]) {
    for (const [x, y] of [[10, 20], [210, 280], [60, 100]] as const) {
      const [X, Y] = toShown(VIEW, rot, x, y);
      expect(toPage(VIEW, rot, X, Y)).toEqual([x, y]);
    }
  }
  // unturned: the box's top left is the shown origin; a quarter turn: its bottom left is
  expect(toShown(VIEW, 0, 10, 280)).toEqual([0, 0]);
  expect(toShown(VIEW, 1, 10, 20)).toEqual([0, 0]);
  expect(boxShown(VIEW, 0, [10, 20, 210, 280])).toEqual([0, 0, 200, 260]);
  expect(boxShown(VIEW, 1, [10, 20, 210, 280])).toEqual([0, 0, 260, 200]);
});

test("a point on a page the reader turned is found in the unturned page", () => {
  // a 100 × 50 page turned a quarter is 50 × 100 on screen; its unturned top right (100, 0) shows at the bottom right
  expect(unturn(1, 50, 100, 50, 100)).toEqual([100, 0]);
  expect(unturn(2, 100, 50, 0, 0)).toEqual([100, 50]);
  expect(unturn(3, 50, 100, 0, 0)).toEqual([100, 0]);
  expect(unturn(0, 100, 50, 7, 9)).toEqual([7, 9]);
});

/** Characters laid out 10 pt wide on lines 20 pt apart (shown space), "\n" a line break PDFium adds. */
function chars(lines: string[]): Chars {
  const codes: number[] = [], boxes: number[] = [], generated: number[] = [];
  lines.forEach((line, row) => {
    [...line].forEach((ch, i) => { codes.push(ch.codePointAt(0)!); boxes.push(i * 10, row * 20, i * 10 + 10, row * 20 + 12); generated.push(0); });
    if (row < lines.length - 1) { codes.push(13, 10); boxes.push(0, 0, 0, 0, 0, 0, 0, 0); generated.push(1, 1); }
  });
  return { codes: Uint32Array.from(codes), boxes: Float32Array.from(boxes), generated: Uint8Array.from(generated) };
}

test("a page's characters are cut into one run a line, offsets mapping back to characters", () => {
  const c = chars(["Hello world", "the 𝑥 axis"]);
  const runs = runsOf(c);
  expect(runs.map((r) => r.text)).toEqual(["Hello world", "the 𝑥 axis"]);
  expect(runs.map((r) => r.eol)).toEqual([true, true]);
  expect(runs[1].start).toBe(13); // after the line break's two characters
  // 𝑥 takes two string units: the unit after it is the character after it
  const x = runs[1].text.indexOf("𝑥");
  expect(charAt(runs[1], x)).toBe(charAt(runs[1], x + 1));
  expect(charAt(runs[1], x + 2)).toBe(runs[1].start + 5);
  expect(textOf(c, 6, 18)).toBe("world the 𝑥");
});

test("words are found across line breaks and hyphens, and their line boxes are one a line", () => {
  const c = chars(["a quasi-", "particle here"]);
  const runs = runsOf(c);
  const r = findWords(c, "quasiparticle");
  expect(r).not.toBeNull();
  expect(textOf(c, r![0], r![1])).toBe("quasi- particle");
  expect(findWords(c, "PARTICLE  here")).toEqual([runs[1].start, runs[1].end]);
  expect(findWords(c, "nowhere")).toBeNull();
  expect(lineBoxes(c, runs, r![0], r![1])).toEqual([[20, 0, 80, 12], [0, 20, 80, 32]]);
});
