// Marking passages in a chapter's text — the one implementation for both book readers (the web reader imports this
// file; the native reader carries it in the app, NativePlugins.shared, and puts it in each chapter). A classic script:
// it sets globalThis.atlasMarks = { textMap, wrap, markPassages, occurrences, markFound, offsetOf, charAt, charBox, pick,
// highlightsIn, highlightBlock, addHighlight }.
//
// A highlight in the book's note (the web reader and the native one write the same):
//
//   ## Highlights
//
//   > the passage, whitespace as one space
//   > — Chapter title, chapter 4 <!-- atlas-hl k=1234 -->
//
// `chapter N` (1-based, the spine's order) and `k` (where the passage starts in that chapter's `textMap` text) anchor
// it: a phrase that occurs twice is marked where it was chosen, and only in its own chapter. Notes written before the
// anchor (no comment) are marked at the first occurrence, in every chapter, as they always were. Only quotes under
// the note's `## Highlights` heading are highlights (a quote or a callout elsewhere in the note is the owner's own).
(function (g) {
const squash = (t) => t.replace(/\s+/g, " ").trim();
/** A chapter's text with whitespace collapsed (as `squash` does), and for each of its characters the text node and
 *  offset it came from — what passages are found in and wrapped back onto. */
function textMap(doc) {
  const walker = doc.createTreeWalker(doc.body, 4 /* text */);
  const nodes = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n);
  let text = "", space = true;
  const at = [];
  nodes.forEach((n, ni) => {
    for (let i = 0; i < n.data.length; i++) {
      const ws = /\s/.test(n.data[i]);
      if (ws && space) continue;
      text += ws ? " " : n.data[i];
      at.push([ni, i]);
      space = ws;
    }
  });
  return { nodes, text, at };
}
/** Wraps the stretches `[{ k, len }]` of `map.text` in `<mark class=cls>`, also across elements → the first mark of
 *  each stretch (null where nothing was wrapped). Wrapped from the last to the first: splitting a text node keeps its
 *  start in place, so the offsets of the stretches before stay true (front to back, a second highlight in the same
 *  paragraph pointed past its shortened node and threw). Overlapping stretches: the later one is left out. */
function wrap(doc, map, stretches, cls) {
  const order = stretches.map((s, i) => ({ ...s, i })).sort((a, b) => b.k - a.k);
  const first = stretches.map(() => null);
  let limit = Infinity;
  for (const { k, len, i, p } of order) {
    if (len <= 0 || k + len > limit) continue;
    limit = k;
    const [sn, so] = map.at[k], [en, eo] = map.at[k + len - 1];
    for (let ni = en; ni >= sn; ni--) { // backwards inside a stretch too
      const n = map.nodes[ni], from = ni === sn ? so : 0, to = ni === en ? eo + 1 : n.data.length;
      if (to <= from || !n.data.slice(from, to).trim()) continue;
      const r = doc.createRange();
      r.setStart(n, from); r.setEnd(n, to);
      const m = doc.createElement("mark");
      m.className = cls;
      if (p != null) m.dataset.p = String(p); // which highlight: a tap on it finds it (unmark, the readers' Remove)
      r.surroundContents(m);
      first[i] = m;
    }
  }
  return first;
}
/** Where in `text` each passage is → [{ k, len, p }] (`p`: its index in `passages`, plus `base`). A passage is a
 *  string (written before anchors: its first occurrence) or `{ text, chapter, k }`: left out when its chapter is not
 *  `chapter` (both known), else the occurrence nearest its `k`. */
function pick(text, passages, chapter, base = 0) {
  const out = [];
  for (const [pi, p] of passages.entries()) {
    const q = typeof p === "string" ? p : p?.text;
    if (!q) continue;
    if (typeof p === "object" && p.chapter != null && chapter != null && p.chapter !== chapter) continue;
    let best = -1;
    for (let k = text.indexOf(q); k >= 0; k = text.indexOf(q, k + 1)) {
      if (best < 0 || (typeof p === "object" && p.k != null && Math.abs(k - p.k) < Math.abs(best - p.k))) best = k;
      if (typeof p !== "object" || p.k == null) break; // no anchor: the first one
    }
    if (best >= 0) out.push({ k: best, len: q.length, p: base + pi });
  }
  return out;
}
/** Marks each passage in `doc` (`<mark class="atlas-hl" data-p=…>`), also across elements; whitespace counts as one
 *  space. `chapter` (1-based): this chapter's number, so anchored passages of other chapters are left alone (`pick`);
 *  `base`: the first passage's index in the reader's whole list (a new highlight marked after the others). */
function markPassages(doc, passages, chapter, base = 0) {
  const map = textMap(doc);
  return wrap(doc, map, pick(map.text, passages, chapter, base), "atlas-hl").filter(Boolean).length;
}
/** The marks of highlight `p` taken off the page (it was removed from the note). */
function unmark(doc, p) {
  for (const m of doc.querySelectorAll(`mark.atlas-hl[data-p="${p}"]`)) m.replaceWith(...m.childNodes);
  doc.body.normalize();
}
/** The index in `textMap(doc).text` of the character at (`node`, `offset`) — a selection's start → a highlight's `k`;
 *  -1 when the node is not in the chapter's text. */
function offsetOf(doc, node, offset) {
  if (node.nodeType !== 3) { const w = doc.createTreeWalker(node.childNodes[offset] || node, 4); const t = w.nextNode(); if (!t) return -1; node = t; offset = 0; }
  const m = textMap(doc), ni = m.nodes.indexOf(node);
  if (ni < 0) return -1;
  for (let k = 0; k < m.at.length; k++) if (m.at[k][0] > ni || (m.at[k][0] === ni && m.at[k][1] >= offset)) return k;
  return m.at.length - 1;
}
/** The character of the chapter's text under (x, y) (the frame's client px) → its index `k` in `textMap(doc).text`, or
 *  -1 (no text there). Where a reflowed book's ink is pinned (shared/ink.js). */
function charAt(doc, x, y) {
  let node = null, offset = 0;
  if (doc.caretPositionFromPoint) { const c = doc.caretPositionFromPoint(x, y); if (c) { node = c.offsetNode; offset = c.offset; } }
  else { const r = doc.caretRangeFromPoint?.(x, y); if (r) { node = r.startContainer; offset = r.startOffset; } }
  return node ? offsetOf(doc, node, offset) : -1;
}
/** Where character `k` of `map` (textMap) is now: `{ x, y, h }`, its box's top left and height in client px; null
 *  when `k` is not in the text. A collapsed space has no box of its own: the next character's, else the text node's. */
function charBox(doc, map, k) {
  if (!(k >= 0 && k < map.at.length)) return null;
  for (let i = k; i < Math.min(map.at.length, k + 4); i++) {
    const [ni, o] = map.at[i], n = map.nodes[ni], r = doc.createRange();
    r.setStart(n, o); r.setEnd(n, Math.min(o + 1, n.data.length));
    const b = r.getClientRects()[0];
    if (b && (b.width || b.height)) return { x: b.left, y: b.top, h: b.height };
  }
  const r = doc.createRange();
  r.selectNodeContents(map.nodes[map.at[k][0]]);
  const b = r.getBoundingClientRect();
  return { x: b.left, y: b.top, h: b.height };
}
// ---- the note's side: plain text in, plain text out (tested in node, no page needed) ----
const HEADING = /^## Highlights\s*$/;
const ANCHOR = /\s*<!--\s*atlas-hl\s+k=(\d+)\s*-->\s*$/;
/** One highlight as Markdown: the passage quoted, then where it is (`— <chapter>`), with its anchor when known. */
function highlightBlock(text, where, k) {
  return `\n> ${squash(text)}\n> — ${where}${k != null && k >= 0 ? ` <!-- atlas-hl k=${k} -->` : ""}\n`;
}
/** The highlights a note keeps: each `>` block under `## Highlights` (to the next heading of level 1 or 2), its
 *  `— where` line read for the chapter and the anchor → [{ text, chapter?, k?, where? }]. Callouts (`> [!…]`) are
 *  not highlights. */
function highlightsIn(md) {
  const out = [];
  let under = false, cur = [], callout = false;
  const end = (where) => {
    const text = squash(cur.join(" "));
    if (text && !callout) {
      const h = { text };
      if (where != null) {
        const a = ANCHOR.exec(where), w = where.replace(ANCHOR, "").trim(), c = /\bchapter (\d+)\s*$/.exec(w);
        h.where = w;
        if (c) h.chapter = Number(c[1]);
        if (a) h.k = Number(a[1]);
      }
      out.push(h);
    }
    cur = []; callout = false;
  };
  for (const line of `${md}\n`.split("\n")) {
    if (/^#{1,2}\s/.test(line)) { if (cur.length) end(null); under = HEADING.test(line); continue; }
    if (!under) continue;
    const m = /^>\s?(.*)$/.exec(line);
    if (m && /^—\s/.test(m[1])) { if (cur.length) end(m[1].replace(/^—\s*/, "")); continue; }
    if (m) { if (!cur.length && /^\[!/.test(m[1])) callout = true; cur.push(m[1]); continue; }
    if (cur.length) end(null);
  }
  return out;
}
/** `md` without highlight `h` ({ text, k? }): the first block under `## Highlights` quoting that passage (and
 *  anchored at `k`, when both say), its `— where` line and the blank line before it. Unchanged when not found. */
function removeHighlight(md, h) {
  const lines = md.split("\n"), want = squash(h.text);
  let under = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^#{1,2}\s/.test(lines[i])) { under = HEADING.test(lines[i]); continue; }
    if (!under || !/^>/.test(lines[i]) || (i > 0 && /^>/.test(lines[i - 1]))) continue; // a block's first line
    let e = i, text = [];
    while (e < lines.length && /^>/.test(lines[e]) && !/^>\s?—\s/.test(lines[e])) text.push(lines[e++].replace(/^>\s?/, ""));
    const where = e < lines.length && /^>\s?—\s/.test(lines[e]) ? lines[e] : null;
    if (squash(text.join(" ")) !== want) continue;
    const a = where && ANCHOR.exec(where);
    if (h.k != null && h.k >= 0 && a && Number(a[1]) !== h.k) continue;
    const from = i > 0 && !lines[i - 1].trim() ? i - 1 : i, to = where ? e + 1 : e;
    return [...lines.slice(0, from), ...lines.slice(to)].join("\n");
  }
  return md;
}
/** `md` with `block` put at the end of its Highlights section (before the next heading of level 1 or 2), the heading
 *  added at the end when the note has none. */
function addHighlight(md, block) {
  const lines = md.replace(/\n*$/, "").split("\n");
  const h = lines.findIndex((l) => HEADING.test(l));
  if (h < 0) {
    // a new section goes before the marks block the core keeps last, so the note reads in order before its next write
    const b = lines.findIndex((l) => /^```pdf-marks(\s|$)/.test(l));
    if (b < 0) return `${md.replace(/\n*$/, "\n")}\n## Highlights\n${block}`;
    const before = lines.slice(0, b).join("\n").replace(/\n*$/, "\n");
    return `${before}\n## Highlights\n${block}\n${lines.slice(b).join("\n")}\n`;
  }
  let e = lines.length;
  // the section ends at the next heading, or at the marks block the core keeps at the note's end (a book's ink)
  for (let i = h + 1; i < lines.length; i++) if (/^#{1,2}\s/.test(lines[i]) || /^```pdf-marks(\s|$)/.test(lines[i])) { e = i; break; }
  while (e > h + 1 && !lines[e - 1].trim()) e--; // the section's own blank lines stay after the new block
  const before = lines.slice(0, e).join("\n"), after = lines.slice(e).join("\n").replace(/^\n*/, "");
  return `${before}\n${block}${after ? `\n${after}\n` : ""}`;
}
/** Every place `query` occurs in `text` (any case, whitespace as one space) → [{ k, len, snippet: [before, hit, after] }]. */
function occurrences(text, query, max = 200) {
  // lower case with each character in its place (`İ` → `i̇` would shift every later hit's mark)
  const q = squash(query).toLowerCase(), out = [];
  let low = text.toLowerCase();
  if (low.length !== text.length) low = Array.from(text, (c) => { const l = c.toLowerCase(); return l.length === c.length ? l : c; }).join("");
  if (!q) return out;
  for (let k = low.indexOf(q); k >= 0 && out.length < max; k = low.indexOf(q, k + q.length)) {
    const a = Math.max(0, text.lastIndexOf(" ", Math.max(0, k - 40)) + 1), b = text.indexOf(" ", Math.min(text.length, k + q.length + 40));
    out.push({ k, len: q.length, snippet: [`${a > 0 ? "…" : ""}${text.slice(a, k)}`, text.slice(k, k + q.length), `${text.slice(k + q.length, b < 0 ? text.length : b)}${b < 0 ? "" : "…"}`] });
  }
  return out;
}
/** Marks the `nth` occurrence of `query` in `doc` as the search's find (`mark.atlas-found`) → that mark, or null. */
function markFound(doc, query, nth) {
  for (const m of doc.querySelectorAll("mark.atlas-found")) m.replaceWith(...m.childNodes);
  doc.body.normalize();
  const map = textMap(doc), hit = occurrences(map.text, query)[nth];
  return hit ? wrap(doc, map, [hit], "atlas-found")[0] : null;
}

g.atlasMarks = { textMap, wrap, markPassages, occurrences, markFound, squash, offsetOf, charAt, charBox, pick, highlightsIn, highlightBlock, addHighlight, removeHighlight, unmark };
})(globalThis);
