import { test, expect } from "@playwright/test";
import { gzipSync } from "node:zlib";
// @ts-expect-error a plugin's main.js is plain JavaScript, loaded as the page loads it
import { convert, writeBeside } from "../../plugins/beta/rnote/main.js";

// The Rnote plugin's converter on its own (no page): the shapes seen in the user's files (Rnote 0.11), small — a pen
// stroke, a line, text, a picture, a slide, and a kind not seen yet. The PNG encoder is the page's; here it hands the
// pixels back as they are, so the un-premultiplying can be checked.
const px = Buffer.from([255, 0, 0, 255, 0, 0, 0, 0, 0, 128, 0, 128, 255, 255, 255, 255]).toString("base64");
const sample = () => gzipSync(JSON.stringify({ version: "0.11.0", data: { engine_snapshot: {
  document: { background: { color: { r: 1, g: 1, b: 1, a: 1 }, pattern: "grid", pattern_size: [32, 32] } },
  stroke_components: [
    { value: null, version: 0 },
    { value: { brushstroke: { path: { start: { pos: [10, 20], pressure: 0.1 }, segments: [
      { lineto: { end: { pos: [11, 20], pressure: 0.3 } } },
      { lineto: { end: { pos: [12, 20], pressure: 0.3 } } },
      { lineto: { end: { pos: [12, 30], pressure: 0.5 } } }] },
      style: { smooth: { stroke_width: 4, stroke_color: { r: 0, g: 0, b: 0, a: 1 } } } } } },
    { value: { shapestroke: { shape: { line: { start: [0, 0], end: [100, 5] } },
      style: { smooth: { stroke_width: 6, stroke_color: { r: 1, g: 0, b: 0, a: 1 } } } } } },
    { value: { textstroke: { text: "LIGHT\n\tMATTER", transform: { affine: [1, 0, 0, 0, 1, 0, 300, 40, 1] },
      text_style: { font_size: 25, color: { r: 0, g: 0, b: 0, a: 1 }, max_width: 1100 } } } },
    { value: { bitmapimage: { image: { data: px, pixel_width: 2, pixel_height: 2, memory_format: "R8g8b8a8Premultiplied" },
      rectangle: { cuboid: { half_extents: [50, 25] }, transform: { affine: [0.5, 0, 0, 0, 0.5, 0, 200, 100, 1] } } } } },
    { value: { vectorimage: { svg_data: "<svg xmlns='http://www.w3.org/2000/svg' width='16' height='9'/>",
      rectangle: { cuboid: { half_extents: [160, 90] }, transform: { affine: [1, 0, 0, 0, 1, 0, 500, 300, 1] } } } } },
    { value: { somethingnew: {} } },
  ] } } }));
const rawPng = async (_w: number, _h: number, rgba: Uint8Array) => rgba;
const fileBytes = (url: string) => Buffer.from(url.split(",")[1], "base64");

test("every kind in the user's Rnote files becomes its Excalidraw element", async () => {
  const s = await convert(new Uint8Array(sample()), { encodePng: rawPng });
  const els = s.elements;
  expect(els.map((e: { type: string }) => e.type)).toEqual(["freedraw", "line", "text", "image", "image"]);
  expect(s.atlas.skipped, "the unknown kind is counted, not dropped silently").toBe(1);

  const pen = els[0];
  expect([pen.x, pen.y]).toEqual([10, 20]);
  expect(pen.points[0], "points are relative to the element").toEqual([0, 0]);
  expect(pen.points.length).toBe(pen.pressures.length);
  expect(pen.simulatePressure, "the pen's own pressures, not Excalidraw's guess").toBe(false);
  expect(pen.pressures[0]).toBe(0.1);
  expect(pen.points.length, "the straight run is simplified").toBeLessThanOrEqual(4);

  expect(els[1].strokeColor).toBe("#ff0000");
  expect(els[1].points[1]).toEqual([100, 5]);
  expect(els[2].text).toBe("LIGHT\n    MATTER");
  expect([els[2].x, els[2].fontSize]).toEqual([300, 25]);

  // the picture: centred on (200, 100), half extents 50×25 scaled by 0.5 → 50×25 at (175, 87.5)
  const pic = els[3];
  expect([pic.x, pic.y, pic.width, pic.height]).toEqual([175, 87.5, 50, 25]);
  const file = s.files[pic.fileId];
  expect(file.mimeType).toBe("image/png");
  const pixels = [...fileBytes(file.dataURL)];
  expect(pixels.slice(0, 4)).toEqual([255, 0, 0, 255]);
  expect(pixels.slice(8, 12), "premultiplied pixels are un-multiplied").toEqual([0, 255, 0, 128]);
  expect(s.files[els[4].fileId].mimeType).toBe("image/svg+xml");

  expect(s.appState.viewBackgroundColor).toBe("#ffffff");
  expect(s.appState.gridModeEnabled).toBe(true);
});

test("the drawing goes beside the .rnote, never over another file, and one made from it is reused", async () => {
  const files: Record<string, string> = { "lec.excalidraw": '{"type":"excalidraw","elements":[]}' }; // the user's own
  const io = {
    create: async (p: string, text: string) => (p in files ? false : ((files[p] = text), true)),
    read: async (p: string) => { if (!(p in files)) throw new Error(`asked for a missing file: ${p}`); return files[p]; },
  };
  const ours = JSON.stringify({ type: "excalidraw", atlas: { from: "rnote" } });
  expect(await writeBeside("lec.rnote", ours, io)).toEqual({ path: "lec (2).excalidraw", made: true });
  expect(files["lec.excalidraw"], "the user's own drawing is untouched").toBe('{"type":"excalidraw","elements":[]}');
  expect(await writeBeside("lec.rnote", ours, io)).toEqual({ path: "lec (2).excalidraw", made: false });
});

test("a file that is not an Rnote says so", async () => {
  await expect(convert(new TextEncoder().encode("hello"), { encodePng: rawPng })).rejects.toThrow();
  await expect(convert(new TextEncoder().encode('{"data":{}}'), { encodePng: rawPng })).rejects.toThrow(/not an Rnote/);
});
