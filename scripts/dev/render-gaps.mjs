// Render gaps: opens notes in WebKit and, for every rendered block of the
// editor's live preview (Bases, views, embeds, pictures, tables, math), compares its box with what it draws — empty
// space at its bottom, and the gap to the next line beyond the usual margins. Prints the worst, by note.
//
//   ATLAS_PROBE_COPY=1 ATLAS_URL=<a core on a COPY> node scripts/dev/render-gaps.mjs [--dist ui/dist] [--notes 40] [--min 12]
import { resolve } from "node:path";
import { readOnlyPage } from "./webkit-probe.mjs";

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : d; };
const dist = opt("--dist"), nNotes = Number(opt("--notes", "40")), min = Number(opt("--min", "12"));
const { browser, page } = await readOnlyPage({ dist: dist && resolve(dist), width: 1300, height: 900 });
const files = await page.evaluate(async () => (await (await fetch("/api/files", { headers: { "x-atlas": "1" } })).json()));
// notes that embed or draw something: read a sample, keep those with ![[ … ]], ```view / ```base or a base embed
const candidates = [];
for (const f of files.filter((x) => x.endsWith(".md") && !x.startsWith("mail/") && !x.startsWith(".atlas/"))) {
  if (candidates.length >= nNotes) break;
  const t = await page.evaluate(async (p) => { const r = await fetch(`/api/file?path=${encodeURIComponent(p)}`, { headers: { "x-atlas": "1" } }); return r.ok ? (await r.json()).text : ""; }, f);
  if (/!\[\[|```(view|base|dataview)|\$\$/.test(t)) candidates.push(f);
}
console.log(`[gaps] ${candidates.length} notes with rendered blocks`);
const rows = [];
for (const note of candidates) {
  await page.evaluate((p) => window.__atlas.open(p), note);
  await page.waitForTimeout(2500); // embeds, Bases, pictures
  const found = await page.evaluate((min) => {
    const ed = [...document.querySelectorAll(".cm-editor")].find((e) => e.offsetParent);
    if (!ed) return [];
    const out = [];
    const kind = (b) => b.querySelector(".base, .base-embed") ? "base" : b.querySelector(".pdf-embed, .atlas-pane-pdf") ? "pdf" : b.querySelector(".view-block") ? "view" : b.querySelector(".note-embed") ? "note-embed" : b.querySelector("img") ? "image" : b.querySelector("table") ? "table" : b.querySelector(".katex-display") ? "math" : "block";
    for (const b of ed.querySelectorAll(".cm-rendered-block, .cm-embed-image-host")) {
      const box = b.getBoundingClientRect();
      if (!box.height) continue;
      // what is drawn: every rectangle of its content — text runs included (a Range), CodeMirror's buffers left out
      const range = document.createRange();
      range.selectNodeContents(b);
      let bottom = box.top, top = box.bottom;
      for (const r of range.getClientRects()) { if (r.height < 1 || r.width < 1) continue; bottom = Math.max(bottom, r.bottom); top = Math.min(top, r.top); }
      for (const el of b.querySelectorAll("img:not(.cm-widgetBuffer), canvas, svg, table, video, iframe")) { const r = el.getBoundingClientRect(); if (r.height && r.width) { bottom = Math.max(bottom, r.bottom); top = Math.min(top, r.top); } }
      const below = Math.round(box.bottom - bottom), above = Math.round(top - box.top);
      if (below >= min || above >= min) out.push({ kind: kind(b), height: Math.round(box.height), above, below, text: (b.textContent ?? "").trim().slice(0, 50) });
    }
    return out;
  }, min);
  for (const f of found) rows.push({ note, ...f });
}
rows.sort((a, b) => b.below + b.above - (a.below + a.above));
for (const r of rows.slice(0, 40)) console.log(`[gaps] ${r.kind.padEnd(10)} box ${String(r.height).padStart(4)} px · empty above ${String(r.above).padStart(4)} · below ${String(r.below).padStart(4)} · ${r.note} · ${r.text}`);
const by = {}; for (const r of rows) by[r.kind] = (by[r.kind] ?? 0) + 1;
console.log(`[gaps] ${rows.length} blocks with ≥ ${min} px of empty space:`, JSON.stringify(by));
await browser.close();
