// Rnote → Excalidraw (docs/design/DESIGN-pen-eink-reader.md). An `.rnote` is gzipped JSON; its strokes become
// Excalidraw elements: pen strokes `freedraw` with their own pressures, shapes, text, pictures (PNG) and vector images
// (SVG, e.g. slides). Written beside the `.rnote` (`name.excalidraw`, never over another file), which stays as the
// input it is. Opening an .rnote (this plugin's view claims the type) opens the drawing instead.
// The conversion is pure (`convert`, exported for the tests); the page supplies the PNG encoder.

/** Excalidraw draws a freedraw line `strokeWidth × 4.25` wide at mid pressure; Rnote's `stroke_width` is the full
 *  width at full pressure, so a line keeps its look at `width × FREEDRAW_SCALE`. */
const FREEDRAW_SCALE = 0.6 / 4.25;
/** Points closer than this to the line through their neighbours are dropped (a pen samples ~200/s). */
const SIMPLIFY_PX = 0.25;

const r2 = (v) => Math.round(v * 100) / 100;
const num = (v, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);
/** The one `{ kind: body }` entry Rnote's serde enums are written as. */
const only = (o) => (o && typeof o === "object" ? Object.entries(o)[0] : undefined);

/** `#rrggbb` and an Excalidraw opacity (1–100) from Rnote's `{r, g, b, a}` in 0–1. */
function color(c) {
  const ch = (k) => Math.round(Math.min(1, Math.max(0, num(c?.[k]))) * 255).toString(16).padStart(2, "0");
  const a = Math.min(1, Math.max(0, num(c?.a, 1)));
  return [`#${ch("r")}${ch("g")}${ch("b")}`, Math.max(1, Math.round(a * 100))];
}

/** Rnote's affine transform: nine numbers, column by column (x' = a·x + c·y + tx). */
function affine(t) {
  const m = t?.affine ?? [];
  const g = (k) => num(m[k], k === 0 || k === 4 ? 1 : 0);
  const [a, b, c, d, tx, ty] = [g(0), g(1), g(3), g(4), g(6), g(7)];
  return {
    apply: (x, y) => [a * x + c * y + tx, b * x + d * y + ty],
    sx: Math.hypot(a, b), sy: Math.hypot(c, d), angle: r2(Math.atan2(b, a)),
  };
}

/** Ramer–Douglas–Peucker over (x, y); a point where the pressure turns is part of the shape too. */
function simplify(p, eps) {
  if (p.length < 3) return p;
  const keep = p.map((_, i) => i === 0 || i === p.length - 1);
  const stack = [[0, p.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    const [ax, ay, ap] = p[s], [bx, by, bp] = p[e];
    const len = Math.hypot(bx - ax, by - ay);
    let far = 0, at = 0;
    for (let k = s + 1; k < e; k++) {
      const [qx, qy, qp] = p[k];
      const d = len < 1e-9 ? Math.hypot(qx - ax, qy - ay) : Math.abs((bx - ax) * (ay - qy) - (ax - qx) * (by - ay)) / len;
      const m = Math.max(d, Math.abs(qp - (ap + bp) / 2) * 4);
      if (m > far) { far = m; at = k; }
    }
    if (far > eps) { keep[at] = true; stack.push([s, at], [at, e]); }
  }
  return p.filter((_, i) => keep[i]);
}

function base(i, type, x, y, w, h, style) {
  const [strokeColor, opacity] = color(style?.stroke_color);
  const seed = Number((BigInt(i) * 2654435761n) % 2147483647n);
  return {
    id: `rnote-${i}`, type, x: r2(x), y: r2(y), width: r2(w), height: r2(h), angle: 0,
    strokeColor, backgroundColor: "transparent", fillStyle: "solid", strokeWidth: 1, strokeStyle: "solid", roughness: 0, opacity,
    groupIds: [], frameId: null, roundness: null, seed, version: 1, versionNonce: seed,
    isDeleted: false, boundElements: null, updated: 1, link: null, locked: false,
  };
}

const b64 = {
  decode: (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)),
  encode(bytes) {
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
  },
};

async function text(bytes) {
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return new TextDecoder().decode(bytes);
  try {
    return await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
  } catch { throw new Error("not a gzipped Rnote file"); }
}

/** The Excalidraw scene for an `.rnote` file's bytes (gzipped or not). `encodePng(width, height, rgba)` → PNG bytes. */
export async function convert(bytes, { encodePng }) {
  let root;
  try { root = JSON.parse(await text(bytes)); } catch (e) { throw new Error(e instanceof Error && e.message.startsWith("not a") ? e.message : "an Rnote file is JSON inside"); }
  const snap = root?.data?.engine_snapshot;
  const strokes = snap?.stroke_components;
  if (!Array.isArray(strokes)) throw new Error("no strokes: not an Rnote document");
  const elements = [], files = {};
  let skipped = 0;

  const image = (i, rect, mimeType, data) => {
    const half = rect?.cuboid?.half_extents ?? [];
    const t = affine(rect?.transform);
    const [cx, cy] = t.apply(0, 0);
    const w = 2 * Math.abs(num(half[0])) * t.sx, h = 2 * Math.abs(num(half[1])) * t.sy;
    const id = `rnote-file-${i}`;
    files[id] = { mimeType, id, dataURL: `data:${mimeType};base64,${b64.encode(data)}`, created: 1 };
    elements.push({ ...base(i, "image", cx - w / 2, cy - h / 2, w, h, null), angle: t.angle, fileId: id, status: "saved", scale: [1, 1] });
  };

  const kinds = {
    brushstroke(i, b) {
      const pts = [];
      const push = (p) => { if (typeof p?.pos?.[0] === "number" && typeof p?.pos?.[1] === "number") pts.push([p.pos[0], p.pos[1], num(p.pressure, 0.5)]); };
      push(b.path?.start);
      // lineto is all Rnote's smooth brush writes; the curved ones end at their end point (sampled enough by the pen)
      for (const seg of b.path?.segments ?? []) push(only(seg)?.[1]?.end);
      if (!pts.length) return;
      const kept = simplify(pts, SIMPLIFY_PX);
      const style = only(b.style)?.[1];
      const [x0, y0] = kept[0];
      const xs = kept.map((p) => p[0]), ys = kept.map((p) => p[1]);
      elements.push({
        ...base(i, "freedraw", x0, y0, Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), style),
        strokeWidth: r2(num(style?.stroke_width, 2) * FREEDRAW_SCALE),
        points: kept.map((p) => [r2(p[0] - x0), r2(p[1] - y0)]),
        pressures: kept.map((p) => Math.round(p[2] * 1000) / 1000),
        simulatePressure: false, lastCommittedPoint: null,
      });
    },
    shapestroke(i, s) {
      const style = only(s.style)?.[1];
      const [kind, g] = only(s.shape) ?? [];
      let e;
      if (kind === "line") {
        const [x0, y0] = [num(g.start?.[0]), num(g.start?.[1])], [x1, y1] = [num(g.end?.[0]), num(g.end?.[1])];
        e = { ...base(i, "line", x0, y0, Math.abs(x1 - x0), Math.abs(y1 - y0), style), points: [[0, 0], [r2(x1 - x0), r2(y1 - y0)]],
          startBinding: null, endBinding: null, startArrowhead: null, endArrowhead: null, lastCommittedPoint: null };
      } else if (kind === "rect" || kind === "ellipse") {
        // a cuboid (half extents) or an ellipse (radii) around the transform's centre; negative when drawn right to left
        const half = (kind === "rect" ? g.cuboid?.half_extents : g.radii) ?? [];
        const t = affine(g.transform);
        const [cx, cy] = t.apply(0, 0);
        const w = 2 * Math.abs(num(half[0])) * t.sx, h = 2 * Math.abs(num(half[1])) * t.sy;
        e = { ...base(i, kind === "rect" ? "rectangle" : "ellipse", cx - w / 2, cy - h / 2, w, h, style), angle: t.angle };
      } else { skipped++; return; }
      elements.push({ ...e, strokeWidth: r2(num(style?.stroke_width, 2) / 2) });
    },
    textstroke(i, t) {
      const body = String(t.text ?? "").trimEnd().replace(/\t/g, "    ");
      if (!body.trim()) return;
      const ts = t.text_style ?? {};
      const size = num(ts.font_size, 20);
      const [x, y] = affine(t.transform).apply(0, 0);
      const lines = body.split("\n");
      const guess = Math.max(...lines.map((l) => [...l].length)) * size * 0.55;
      const w = typeof ts.max_width === "number" ? Math.min(ts.max_width, guess) : guess;
      elements.push({ ...base(i, "text", x, y, w, lines.length * size * 1.25, { stroke_color: ts.color }),
        text: body, originalText: body, fontSize: size, fontFamily: 2, textAlign: "left", verticalAlign: "top",
        containerId: null, lineHeight: 1.25, autoResize: true });
    },
    async bitmapimage(i, b) {
      const im = b.image ?? {};
      const w = num(im.pixel_width), h = num(im.pixel_height);
      const raw = b64.decode(String(im.data ?? ""));
      if (!w || !h || raw.length < w * h * 4) { skipped++; return; }
      const px = raw.slice(0, w * h * 4);
      if (/premultiplied/i.test(String(im.memory_format ?? ""))) {
        for (let k = 0; k < px.length; k += 4) {
          const a = px[k + 3];
          if (a > 0 && a < 255) for (let c = k; c < k + 3; c++) px[c] = Math.min(255, Math.floor((px[c] * 255 + Math.floor(a / 2)) / a));
        }
      }
      image(i, b.rectangle, "image/png", await encodePng(w, h, px));
    },
    vectorimage(i, v) {
      const svg = String(v.svg_data ?? "");
      if (!svg) { skipped++; return; }
      image(i, v.rectangle, "image/svg+xml", new TextEncoder().encode(svg));
    },
  };

  for (const [i, s] of strokes.entries()) {
    const entry = only(s?.value); // a deleted slot is null
    if (!entry) continue;
    const [kind, body] = entry;
    if (kinds[kind]) await kinds[kind](i, body ?? {});
    else skipped++; // a kind not seen yet: counted, so a conversion says what it left out
  }
  const bg = snap.document?.background ?? {};
  const appState = { viewBackgroundColor: color(bg.color)[0] };
  if (bg.pattern === "grid") Object.assign(appState, { gridSize: Math.round(num(bg.pattern_size?.[0], 32)), gridModeEnabled: true });
  return { type: "excalidraw", version: 2, source: "atlas (from Rnote)", elements, appState, files,
    atlas: { from: "rnote", rnote_version: root.version ?? null, skipped } };
}

/** Writes the drawing for `rnote` beside it, never over another file (`name (2).excalidraw`); one made from this very
 *  file before is reused instead. `create(path, text)` → false when the file exists (nothing written), `read(path)` →
 *  its text. Only existing files are read, so a missing one is never asked for. → `{ path, made }` */
export async function writeBeside(rnote, text, { create, read }) {
  const stem = rnote.replace(/\.rnote$/i, "");
  for (let n = 1; ; n++) {
    const cand = n === 1 ? `${stem}.excalidraw` : `${stem} (${n}).excalidraw`;
    if (await create(cand, text)) return { path: cand, made: true };
    try { if (JSON.parse(await read(cand))?.atlas?.from === "rnote") return { path: cand, made: false }; } catch { /* not ours */ }
  }
}

/** PNG bytes through a canvas: the page's own encoder, no library. */
async function canvasPng(w, h, rgba) {
  const c = new OffscreenCanvas(w, h);
  c.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(rgba), w, h), 0, 0);
  return new Uint8Array(await (await c.convertToBlob({ type: "image/png" })).arrayBuffer());
}

/** Converts `path` into the drawing beside it, or finds the one made from it before: `{ path, made, skipped }`. */
async function convertBeside(atlas, path) {
  const bytes = new Uint8Array(await (await fetch(await atlas.fileUrl(path))).arrayBuffer());
  const scene = await convert(bytes, { encodePng: canvasPng });
  const out = await writeBeside(path, JSON.stringify(scene), { create: atlas.createFile, read: atlas.readText });
  return { ...out, skipped: scene.atlas.skipped };
}

/** Converts and opens the drawing (one made from it before is reused); the .rnote is never written. True once opened. */
export async function openAsDrawing(atlas, path) {
  try {
    const out = await convertBeside(atlas, path);
    const left = out.skipped;
    if (out.made) atlas.toast("Rnote", `${path.split("/").pop()} → ${out.path.split("/").pop()}${left ? ` (${left} item${left > 1 ? "s" : ""} it could not convert)` : ""}`);
    atlas.open(out.path);
    return true;
  } catch (e) {
    atlas.toast("Rnote", `${path}: ${e instanceof Error ? e.message : String(e)}`, "error");
    return false;
  }
}

/** Every `.rnote` under `dir` (its folders too), each converted beside itself, nothing opened: what was made, found
 *  made before, and failed, said once at the end. The .rnote files stay. */
export async function convertFolder(atlas, dir) {
  const todo = [], walk = async (d) => {
    for (const e of await atlas.list(d)) {
      if (e.dir) await walk(e.path);
      else if (/\.rnote$/i.test(e.path)) todo.push(e.path);
    }
  };
  await walk(dir);
  if (!todo.length) return atlas.toast("Rnote", `No Rnote files in ${dir || "the vault"}.`);
  let made = 0, again = 0;
  const failed = [];
  for (const p of todo) {
    try { (await convertBeside(atlas, p)).made ? made++ : again++; } catch (e) { failed.push(`${p.split("/").pop()}: ${e instanceof Error ? e.message : String(e)}`); }
  }
  const said = [`${made} drawing${made === 1 ? "" : "s"} made`, again ? `${again} made before` : "", failed.length ? `${failed.length} failed` : ""].filter(Boolean).join(", ");
  atlas.toast(`Rnote: ${dir || "the vault"}`, failed.length ? `${said}\n${failed.join("\n")}` : said, failed.length ? "error" : "success");
}

export function register(atlas) {
  const isRnote = (p) => typeof p === "string" && /\.rnote$/i.test(p);
  // the palette: the open file (a click on an .rnote goes through the view, which claims the type)
  atlas.registerCommand({ id: "convert", title: "Open the Rnote file as a drawing", run: (arg) => {
    const path = typeof arg === "string" ? arg : atlas.context().active?.path;
    if (!isRnote(path)) return atlas.toast("Rnote", "Open or pick an .rnote file first.");
    return openAsDrawing(atlas, path);
  } });
  atlas.shell.menu("file", (t) => (isRnote(t.path) && !t.dir ? [{ label: "Open as a drawing (Excalidraw)", icon: "edit", run: () => openAsDrawing(atlas, t.path) }]
    : t.dir ? [{ label: "Convert the Rnote files here to drawings", icon: "edit", run: () => convertFolder(atlas, t.path) }] : []));
}
