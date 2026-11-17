// Free ink over a reflowed book — its geometry for the web reader (view.js imports this file; the phone's native reader,
// android/EpubInk.java, does the same arithmetic in Java over the same page measure, marks.js charAt / charBox). A
// classic script: it sets globalThis.atlasBookInk = { pin, place, topLeft, pathOf, near, markOf, strokesOf, newId }.
//
// A reflowed page has no fixed place, so a stroke is pinned to a character of its chapter (docs/design/DESIGN-ebook-ink.md):
//
//   - the anchor is the character under the stroke's top left corner (`topLeft`; the reader asks the page which
//     character that is, atlasMarks.charAt) — `k`, its index in the chapter's text with whitespace collapsed
//     (atlasMarks.textMap, the highlights' own measure);
//   - the samples are kept in em from that character's top left (y down), the width in em too (`pin`);
//   - drawn, they are put back from where that character is now, at the text's em now (`place`): a bigger font, other
//     margins or another window move and scale the stroke with its words. The stroke itself is rigid: a line that
//     ran past a line break before may now run past the column's edge (the rule is kept simple on purpose).
//
// Kept by the core as `text-ink` marks in the book's note (pdf_marks.rs `Body::TextInk`): `page` the chapter (the
// spine's order, from 1), `k`, `strokes: [{ pen, width, color?, opacity?, samples }]` — samples encoded by the core's
// codec (atlas.samples on the web, Core.samplesEncode on the phone).
(function (g) {
/** The top left corner of a stroke's points ({x, y}, any px): where its anchor character is looked for. */
function topLeft(pts) {
  let x = Infinity, y = Infinity;
  for (const p of pts) { if (p.x < x) x = p.x; if (p.y < y) y = p.y; }
  return { x, y };
}
/** Points in px (`{x, y, pressure?, t?}`) → samples in em from the anchor (`at`: the character's top left in the same
 *  px, `em`: the text's size in px), as the core keeps them. */
function pin(pts, at, em) {
  const e = em > 0 ? em : 16;
  return pts.map((p) => ({ x: (p.x - at.x) / e, y: (p.y - at.y) / e, pressure: p.pressure ?? 0.5, tilt_x: 0, tilt_y: 0, t: Math.max(0, Math.round(p.t ?? 0)) }));
}
/** Samples in em → points in px, from where the anchor character is now (`at`) at the text's em now. */
function place(samples, at, em) {
  return samples.map((s) => ({ x: at.x + s.x * em, y: at.y + s.y * em, pressure: s.pressure }));
}
/** An SVG path through the points: straight segments through the midpoints, curved at each point (a smooth line from
 *  a pen's samples, without a library). One point: a dot. */
function pathOf(pts) {
  const f = (v) => Math.round(v * 100) / 100;
  if (!pts.length) return "";
  if (pts.length === 1) return `M${f(pts[0].x)} ${f(pts[0].y)}h0.01`;
  let d = `M${f(pts[0].x)} ${f(pts[0].y)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    d += `Q${f(a.x)} ${f(a.y)} ${f((a.x + b.x) / 2)} ${f((a.y + b.y) / 2)}`;
  }
  const last = pts[pts.length - 1];
  return `${d}L${f(last.x)} ${f(last.y)}`;
}
/** Whether a placed stroke (points in px, `width` px) passes within `reach` px of any point of an eraser's path. */
function near(pts, width, path, reach) {
  const r = reach + width / 2;
  for (const p of pts) for (const q of path) if (Math.hypot(p.x - q.x, p.y - q.y) < r) return true;
  return false;
}
const ABC = "0123456789abcdefghijklmnopqrstuvwxyz";
/** A mark id as the core takes them: `m-` and 8 base-36 characters. */
function newId() {
  const b = new Uint8Array(8);
  (g.crypto?.getRandomValues ? g.crypto.getRandomValues(b) : b.forEach((_, i) => { b[i] = Math.floor(Math.random() * 256); }));
  return `m-${Array.from(b, (x) => ABC[x % ABC.length]).join("")}`;
}
/** A `text-ink` mark: one stroke (`samples` already encoded, `width` in em) pinned to character `k` of `chapter`
 *  (from 1). `color` null: the text's colour (black ink stays readable on a dark page). */
function markOf({ id, chapter, k, samples, width, color = null, opacity = 1, pen = "pen", device = "desktop", created }) {
  const stroke = { pen, width: Math.round(width * 1000) / 1000, samples };
  if (color) stroke.color = color;
  if (opacity < 0.999) stroke.opacity = opacity;
  const m = { id: id ?? newId(), kind: "text-ink", page: chapter, version: 0, device, k, strokes: [stroke] };
  if (created) m.created = created;
  return m;
}
/** The `text-ink` marks of a chapter (from 1) among a file's marks (other kinds and chapters left out). */
function strokesOf(marks, chapter) {
  return (marks ?? []).filter((m) => m && m.kind === "text-ink" && m.page === chapter && Array.isArray(m.strokes));
}
g.atlasBookInk = { pin, place, topLeft, pathOf, near, markOf, strokesOf, newId };
})(globalThis);
