import { test, expect } from "@playwright/test";
import { quoteOf, type TextPiece } from "../src/lib/atlas-mark";
import { addPageFrame, marksToElements, type PageBox } from "./fixtures/old-pdf-drawing";
import type { El } from "../src/lib/pdf-ink-scene";

// A PDF's marks carry `atlasMark` (lib/atlas-mark.ts): a highlight's boxes in PDF points and its words, found from the
// page's text, so any engine can anchor it again. Two lines of 10-pt-wide characters, as pdf.js's getTextContent gives.
const line = (str: string, y: number, hasEOL = true): TextPiece => ({ str, transform: [10, 0, 0, 10, 0, y], width: str.length * 10, height: 10, hasEOL });
const TEXT = [line("The quick brown fox", 100), line("jumps over the lazy dog", 85, false)];
/** "brown" (characters 10–14) as a box. */
const BROWN: [number, number, number, number] = [100, 98, 150, 112];

test("a highlight's words are the characters under its boxes, with the words around them", () => {
  expect(quoteOf(TEXT, [BROWN])).toEqual({ exact: "brown", prefix: "The quick", suffix: "fox jumps over the lazy dog" });
  // across the line break: from "fox" to "jumps"
  expect(quoteOf(TEXT, [[160, 98, 190, 112], [0, 83, 50, 97]])?.exact).toBe("fox jumps");
  expect(quoteOf(TEXT, [[0, 200, 50, 210]])).toBeNull();
});


test("pen samples are coded as the core codes them, to its precision", async () => {
  const { encodeSamples, decodeSamples } = await import("../src/lib/pdf-samples");
  const samples = [
    { x: 100, y: 500, pressure: 0.8, tilt_x: 0.25, tilt_y: -0.125, t: 0 },
    { x: 100.37, y: 499.89, pressure: 0.81, tilt_x: 0.25, tilt_y: -0.125, t: 8 },
    { x: 99.5, y: 501.25, pressure: 0, tilt_x: -1, tilt_y: 1, t: 17 },
  ];
  expect(encodeSamples(samples)).toBe("oJwBoI0GwAz0A_kBAEoVFAAAEK0BkALTDMMTyhES");
  expect(decodeSamples("oJwBoI0GwAz0A_kBAEoVFAAAEK0BkALTDMMTyhES")).toEqual(samples);
  const long = Array.from({ length: 500 }, (_, i) => ({ x: 72 + i * 0.37, y: 700 - i * 0.11, pressure: (i % 100) / 100, tilt_x: 0, tilt_y: 0, t: i * 4 }));
  const back = decodeSamples(encodeSamples(long));
  back.forEach((s, i) => { expect(Math.abs(s.x - long[i].x)).toBeLessThan(0.006); expect(Math.abs(s.pressure - long[i].pressure)).toBeLessThan(0.0006); });
});

test("the note's view reads a block's lines, leaving out removed marks and lines it cannot read", async () => {
  const { marksOfBlock } = await import("../src/lib/pdf-marks-lines");
  const ms = marksOfBlock([
    'm-aaaaaaa1 highlight p3 {"version":2,"color":"#FFE066","quads":[[1,2,3,4]],"quote":{"exact":"quantum dot","prefix":"","suffix":""}}',
    'm-aaaaaaa2 postit p3 {"version":1,"at":[1,2],"text":"why? #q","on":"m-aaaaaaa1","tags":["q"]}',
    "m-aaaaaaa3 deleted p2 {\"version\":4}",
    "a line of the owner's, or a newer device's",
    'm-aaaaaaa4 bookmark p9 {not json}',
  ].join("\n"));
  expect(ms.map((m) => [m.id, m.kind, m.page])).toEqual([["m-aaaaaaa1", "highlight", 3], ["m-aaaaaaa2", "postit", 3]]);
  expect((ms[1] as { on?: string }).on).toBe("m-aaaaaaa1");
});

test("an older drawing's marks come back as the note's marks, in PDF points, a highlight's boxes one mark", async () => {
  const { convert, placeKey } = await import("../src/lib/pdf-ink-to-marks");
  const { decodeSamples } = await import("../src/lib/pdf-samples");
  const box: PageBox = [0, 0, 612, 792], els: El[] = [];
  const frame = addPageFrame(els, "x.pdf", 1, box);
  const made = marksToElements([
    { annotationType: 9, pageIndex: 0, color: [255, 224, 102], quadPoints: [100, 712, 200, 712, 100, 700, 200, 700, 100, 692, 150, 692, 100, 680, 150, 680] },
    { annotationType: 15, pageIndex: 0, color: [0, 0, 0], thickness: 2, opacity: 1, paths: { points: [[72, 500, 80, 505, 90, 498]], pressures: [[0.4, 0.6, 0.8]] } },
    { annotationType: 3, pageIndex: 0, color: [0, 0, 0], value: "a note", fontSize: 10, rect: [300, 400, 360, 412] },
  ], new Map([[1, frame]]), new Map([[1, box]]), new Map([[1, TEXT]]));
  const got = convert([...els, ...made], new Map([[1, { view: box, rotate: 0 }]]));
  expect(got.kept).toBe(0);
  const by = (k: string) => got.marks.find((m) => m.kind === k)! as never as Record<string, unknown>;
  expect(got.marks.map((m) => m.kind).sort()).toEqual(["highlight", "ink", "text-box"]);
  expect(by("highlight").quads).toEqual([[100, 700, 200, 712], [100, 680, 150, 692]]);
  const ink = decodeSamples((by("ink").strokes as { samples: string }[])[0].samples);
  expect(ink.map((s) => [Math.round(s.x), Math.round(s.y), s.pressure])).toEqual([[72, 500, 0.4], [80, 505, 0.6], [90, 498, 0.8]]);
  expect((by("ink").strokes as { width: number }[])[0].width).toBeCloseTo(2, 1);
  const rect = by("text-box").rect as number[];
  expect(rect.map(Math.round)).toEqual([300, 400, 360, 412]);
  expect(by("text-box").text).toBe("a note");
  // the same drawing read twice gives the same ids: a second migration run adds nothing
  const again = convert([...els, ...made], new Map([[1, { view: box, rotate: 0 }]]));
  expect(again.marks.map((m) => m.id)).toEqual(got.marks.map((m) => m.id));
  for (const m of got.marks) expect(m.id).toMatch(/^m-[0-9a-z]{8}$/);
  // a mark already moved under another id (as the core gives it back: saved, its own key order) is found by its place
  const hl = got.marks.find((m) => m.kind === "highlight")!;
  const back = JSON.parse(JSON.stringify({ kind: hl.kind, id: "m-00000000", version: 1, quads: (hl as { quads: unknown }).quads, page: hl.page, quote: null, tags: [] }));
  expect(placeKey(back)).toBe(placeKey(hl));
  const nudged = { ...back, quads: (back.quads as number[][]).map((q) => q.map((x) => x * (1 + Number.EPSILON))) };
  expect(placeKey(nudged)).toBe(placeKey(hl)); // a last-bit difference from reading the note back
  expect(placeKey({ ...back, page: 2 })).not.toBe(placeKey(hl));
});

test("a saved mark moved, reworded and recoloured: only what can change changes", async () => {
  const { movedBy, reworded, recoloured } = await import("../src/lib/pdf-mark-edit");
  const base = { id: "m-00000001", page: 1, version: 2, color: "#000000", device: "desktop", created: "2026-01-01T10:00", tags: [] };
  const box = { ...base, kind: "text-box", rect: [10, 20, 110, 40], text: "a", size: 10 } as never;
  expect((movedBy(box, 5, -3) as { rect: number[] }).rect).toEqual([15, 17, 115, 37]);
  const stamp = { ...base, kind: "stamp", at: [50, 60], stamp: "star" } as never;
  expect((movedBy(stamp, 1, 1) as { at: number[] }).at).toEqual([51, 61]);
  const hl = { ...base, kind: "highlight", quads: [[1, 2, 3, 4]] } as never;
  expect(movedBy(hl, 9, 9)).toBe(hl); // on the text: it does not move
  const r = reworded(box, "now #todo #later") as { text: string; tags: string[] };
  expect([r.text, r.tags]).toEqual(["now #todo #later", ["todo", "later"]]);
  const clip = { ...base, kind: "clip", rect: [0, 0, 1, 1], title: "" } as never;
  expect((reworded(clip, "Figure 2") as { title: string }).title).toBe("Figure 2");
  const ink = { ...base, kind: "ink", strokes: [{ pen: "pen", width: 1, color: "#ff0000", samples: "" }] } as never;
  const c = recoloured(ink, "#74C0FC") as { color: string; strokes: { color?: string }[] };
  expect([c.color, c.strokes[0].color]).toEqual(["#74C0FC", undefined]);
});
