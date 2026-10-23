// Marking passages in a chapter's text — the one implementation for both book readers (the web reader imports this
// file; the native reader carries it in the app, NativePlugins.shared, and puts it in each chapter). A classic script:
// it sets globalThis.atlasMarks = { textMap, wrap, markPassages, occurrences, markFound }.
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
  for (const { k, len, i } of order) {
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
      r.surroundContents(m);
      first[i] = m;
    }
  }
  return first;
}
/** Marks each passage in `doc` (`<mark class="atlas-hl">`), also across elements; whitespace counts as one space. */
function markPassages(doc, passages) {
  const map = textMap(doc);
  const found = passages.filter(Boolean).map((p) => ({ k: map.text.indexOf(p), len: p.length })).filter((s) => s.k >= 0);
  return wrap(doc, map, found, "atlas-hl").filter(Boolean).length;
}
/** Every place `query` occurs in `text` (any case, whitespace as one space) → [{ k, len, snippet: [before, hit, after] }]. */
function occurrences(text, query, max = 200) {
  const q = squash(query).toLowerCase(), low = text.toLowerCase(), out = [];
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

g.atlasMarks = { textMap, wrap, markPassages, occurrences, markFound, squash };
})(globalThis);
