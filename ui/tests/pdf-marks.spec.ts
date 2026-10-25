import { test, expect } from "@playwright/test";
import { quoteOf, type TextPiece } from "../src/lib/atlas-mark";
import { eraseIn, marksToElements, stampOldMarks, type Mark, type PageBox } from "../src/lib/pdf-ink-scene";

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

const frame = { id: "f1", type: "frame", x: 0, y: 0, width: 200, height: 260 };
const BOX: PageBox = [0, 0, 200, 260];

test("a new highlight's line boxes are one mark with its quads and words; a pen mark's lines one ink mark", () => {
  const q = [100, 112, 150, 112, 100, 98, 150, 98];
  const marks: Mark[] = [
    { annotationType: 9, pageIndex: 0, color: [255, 224, 102], quadPoints: q },
    { annotationType: 15, pageIndex: 0, color: [0, 0, 0], thickness: 1, paths: { points: [[10, 10, 20, 20], [30, 30, 40, 40]] } },
  ];
  const els = marksToElements(marks, new Map([[1, frame]]), new Map([[1, BOX]]), new Map([[1, TEXT]]));
  const hl = els.filter((e) => e.type === "rectangle"), ink = els.filter((e) => e.type === "freedraw");
  const m = (e: object) => ((e as { customData?: unknown }).customData as { atlasMark: import("../src/lib/atlas-mark").AtlasMark }).atlasMark;
  expect(hl).toHaveLength(1);
  expect(m(hl[0])).toMatchObject({ kind: "highlight", page: 1, device: "desktop", color: "#ffe066", quads: [BROWN], quote: { exact: "brown" } });
  expect(m(hl[0]).id).toMatch(/^m-[0-9a-z]{8}$/);
  expect(ink).toHaveLength(2);
  expect(new Set(ink.map((e) => m(e).id)).size).toBe(1);
  expect(m(ink[0]).kind).toBe("ink");
});

test("older marks get their atlasMark on the next save: a highlight's boxes stay one mark, the phone's ink is the phone's", () => {
  const picture = { id: "p1", type: "image", frameId: "f1", customData: { atlasPage: { file: "x.pdf", page: 1 } } };
  const old = (id: string, rect: number[]) => ({ id, type: "rectangle", frameId: "f1", version: 3, backgroundColor: "#FFE066", customData: { atlasHighlight: { page: 1, mark: "passage-1", rect } } });
  const els = [frame, picture, old("highlight-a", [100, 98, 150, 112]), old("highlight-b", [160, 98, 190, 112]),
    { id: "Xy7Q", type: "freedraw", frameId: "f1", version: 1, strokeColor: "#1e1e1e" }, { id: "gone", type: "freedraw", frameId: "f1", isDeleted: true }];
  expect(stampOldMarks(els as never, new Map([[1, TEXT]]))).toBe(3);
  const m = (i: number) => (els[i] as { customData?: { atlasMark?: { id: string; kind: string; device: string; quote?: { exact: string } } } }).customData?.atlasMark;
  expect(m(2)?.id).toBe(m(3)?.id);
  expect(m(2)).toMatchObject({ kind: "highlight", device: "desktop", quote: { exact: "brown fox" } });
  expect(m(4)).toMatchObject({ kind: "ink", device: "android" });
  expect((els[2] as { version: number }).version).toBe(4);
  expect(m(1)).toBeUndefined();
  expect(m(5)).toBeUndefined();
});

test("the eraser takes a highlight out whole and a pen mark stroke by stroke", () => {
  const picture = { id: "p1", type: "image", frameId: "f1", customData: { atlasPage: { file: "x.pdf", page: 1 } } };
  const marks: Mark[] = [
    { annotationType: 9, pageIndex: 0, quadPoints: [100, 112, 150, 112, 100, 98, 150, 98, 0, 97, 50, 97, 0, 83, 50, 83] },
    { annotationType: 15, pageIndex: 0, paths: { points: [[10, 250, 30, 250], [10, 240, 30, 240]] } },
  ];
  const els = [frame, picture, ...marksToElements(marks, new Map([[1, frame]]), new Map([[1, BOX]]), new Map([[1, TEXT]]))] as never[];
  const live = () => (els as { type: string; isDeleted?: boolean }[]).filter((e) => !e.isDeleted);
  // a click on "brown" (page space y up: 105 pt of 260 → 0.596 down)
  expect(eraseIn(els, 1, 125 / 200, (260 - 105) / 260)).toBe(true);
  expect(live().filter((e) => e.type === "rectangle")).toHaveLength(0);
  expect(eraseIn(els, 1, 20 / 200, 10 / 260)).toBe(true);
  expect(live().filter((e) => e.type === "freedraw")).toHaveLength(1);
  expect(eraseIn(els, 1, 0.9, 0.9)).toBe(false);
});

// the same string the core's test pins (pdf_marks.rs `the_samples_codec_is_the_one_every_device_reads`)
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
  const { addPageFrame } = await import("../src/lib/pdf-ink-scene");
  const { decodeSamples } = await import("../src/lib/pdf-samples");
  const box: PageBox = [0, 0, 612, 792], els: import("../src/lib/pdf-ink-scene").El[] = [];
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
