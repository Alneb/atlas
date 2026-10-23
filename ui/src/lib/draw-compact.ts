// A drawing as it is written to disk, small. The JSON
// without indentation, pen points to 0.1 px and pressures to 0.01, and pictures at most 2000 px as WebP (JPEG where
// the browser cannot write WebP, e.g. WebKitGTK, for a picture without transparency). The same rules as the notepad's
// DrawingSize.java and `atlas drawings compact` (drawing_compact.rs); docs/design/DESIGN-drawing-size.md.

const POINT = 10; // 0.1 px
const PRESSURE = 100; // 0.01
export const MAX_SIDE = 2000;
const QUALITY = 0.82;

const round = (x: number, k: number) => Math.round(x * k) / k;

/** Pen points and pressures rounded; every other value as it is. */
function replacer(key: string, value: unknown): unknown {
  if (key === "points" && Array.isArray(value)) return value.map((p) => (Array.isArray(p) ? p.map((x) => (typeof x === "number" ? round(x, POINT) : x)) : p));
  if (key === "pressures" && Array.isArray(value)) return value.map((x) => (typeof x === "number" ? round(x, PRESSURE) : x));
  return value;
}

/** The scene's text: compact JSON, strokes rounded. */
export function compactJson(scene: unknown): string {
  return JSON.stringify(scene, replacer);
}

type FileEntry = { mimeType?: string; dataURL?: string; [k: string]: unknown };
const shrunk = new Map<string, string>(); // a picture's id → its smaller data URL (a picture never changes under its id)

/** A data URL for the picture at most MAX_SIDE px, as WebP (else JPEG when it is opaque); the original when that is
 *  not smaller, or the browser cannot decode it. */
export async function shrinkPicture(dataURL: string): Promise<string> {
  if (!/^data:image\/(png|jpeg|webp|bmp)/.test(dataURL)) return dataURL; // svg, gif: as they are
  try {
    const bmp = await createImageBitmap(await (await fetch(dataURL)).blob());
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    const g = c.getContext("2d");
    if (!g) return dataURL;
    g.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close();
    let out = c.toDataURL("image/webp", QUALITY);
    if (!out.startsWith("data:image/webp")) {
      // no WebP encoder here: JPEG keeps no transparency, so only for an opaque picture
      const px = g.getImageData(0, 0, c.width, c.height).data;
      let opaque = true;
      for (let i = 3; i < px.length; i += 4) if (px[i] < 255) { opaque = false; break; }
      out = opaque ? c.toDataURL("image/jpeg", QUALITY) : dataURL;
    }
    return out.length < dataURL.length ? out : dataURL;
  } catch {
    return dataURL;
  }
}

/** The scene's pictures made smaller (once per picture for the session), a new files map. */
export async function shrinkFiles(files: Record<string, FileEntry>): Promise<Record<string, FileEntry>> {
  const out: Record<string, FileEntry> = {};
  for (const [id, f] of Object.entries(files)) {
    if (!f?.dataURL) { out[id] = f; continue; }
    let url = shrunk.get(id);
    if (!url) { url = await shrinkPicture(f.dataURL); shrunk.set(id, url); }
    out[id] = url === f.dataURL ? f : { ...f, dataURL: url, mimeType: url.slice(5, url.indexOf(";")) };
  }
  return out;
}
