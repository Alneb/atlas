import { test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { OUT } from "./render.config";
import { propertiesInline } from "./props-inline";

type Finding = { kind: string; text: string };
const H = { "x-atlas": "1" };

// What counts as "rendered wrong", judged on screen (shape-based, no per-note lists).
// Runs in the page: looks at every visible editor line except the caret's (which shows source).
function scan(): Finding[] {
  const out: Finding[] = [];
  const push = (kind: string, el: Element | null, text?: string) =>
    out.push({ kind, text: (text ?? el?.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 140) });
  const root = document.querySelector(".dv-active-group .cm-editor, .cm-editor");
  if (!root) return [{ kind: "no editor", text: "" }];
  const SKIP = ".katex, .cm-inline-code, code, pre, .cm-line-code, .cm-codeblock, .cm-frontmatter, .cm-properties, .cm-hidden-source";
  // the text the reader actually sees in an element, minus math/code widgets
  const visibleText = (el: Element) => {
    let s = "";
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const p = n.parentElement;
      if (!p || p.closest(SKIP)) continue;
      const cs = getComputedStyle(p);
      if (cs.display === "none" || cs.visibility === "hidden" || cs.fontSize === "0px") continue;
      s += n.textContent;
    }
    return s;
  };
  const RAW_MATH = /(^|[^\\$])\$(?!\s)[^$\n]{1,200}?[^\s\\]\$(?!\d)/;
  const RAW_HTML = /<\/?(u|sup|sub|img|div|span|br|b|i|font|mark|center|details|summary|p|a|kbd|small|iframe|table|tr|td)\b[^>]*>/i;
  const blocks = root.querySelectorAll(".cm-line:not(.cm-activeLine), .cm-rendered-block");
  for (const el of blocks) {
    const t = visibleText(el);
    if (RAW_MATH.test(t)) push("raw $math$", el, t);
    if (RAW_HTML.test(t)) push("raw HTML tag", el, t);
    if (/!\[\[[^\]]+\]\]/.test(t)) push("raw ![[embed]]", el, t);
    if (/^\s*\$\$/.test(t)) push("raw $$ block", el, t);
  }
  for (const el of root.querySelectorAll(".cm-embed-missing, .katex-error")) push(el.classList.contains("katex-error") ? "KaTeX error" : "missing embed", el, el.getAttribute("title") || el.textContent || "");
  for (const img of root.querySelectorAll("img")) {
    const i = img as HTMLImageElement;
    if (i.classList.contains("is-missing") || (i.complete && i.naturalWidth === 0 && i.getAttribute("src") && !i.src.startsWith("data:image/gif")))
      push("broken image", i, i.alt || i.dataset.src || i.src.slice(0, 80));
  }
  for (const el of root.querySelectorAll(".drawing-embed.is-missing, .embed-chip.is-missing")) push("drawing not rendered", el);
  for (const el of root.querySelectorAll(".cm-content > *")) {
    const cs = getComputedStyle(el);
    if (cs.marginTop !== "0px" || cs.marginBottom !== "0px") push("block with a margin (clicks land off)", el, `${el.className}: ${cs.marginTop} / ${cs.marginBottom}`);
  }
  // a note's frontmatter should show as properties, not as an empty chip
  if (root.querySelector(".cm-properties")) push("properties shown as a bare chip", null, "");
  for (const el of root.querySelectorAll(".table-wrap, .cm-rendered-block table")) {
    const box = el as HTMLElement;
    if (box.scrollWidth > box.clientWidth + 2) push("table overflows (columns hidden)", el, `${box.scrollWidth}px in ${box.clientWidth}px: ${el.textContent?.slice(0, 60)}`);
  }
  // fold arrows must sit on the line they fold
  const lineTops = [...root.querySelectorAll(".cm-content > *")].map((l) => l.getBoundingClientRect().top);
  for (const g of root.querySelectorAll(".cm-foldGutter .cm-gutterElement")) {
    // CodeMirror's width spacer is a hidden 0-height element holding a marker: not on screen
    if (!g.textContent?.trim() || g.getBoundingClientRect().height === 0 || getComputedStyle(g).visibility === "hidden") continue;
    const top = g.getBoundingClientRect().top;
    if (top < 0 || top > innerHeight) continue;
    if (!lineTops.some((t) => Math.abs(t - top) < 3)) push("fold arrow off its line", g, `gutter y=${Math.round(top)}`);
  }
  return out;
}

async function auditNote(page: Page, path: string): Promise<Finding[]> {
  await page.request.post("/api/cmd/open", { headers: H, data: { args: { path } } });
  await page.locator(".dv-active-group .cm-editor, .cm-editor").first().waitFor({ timeout: 10_000 });
  await page.waitForTimeout(900);
  const seen = new Map<string, Finding>();
  for (let i = 0; i < 400; i++) {
    for (const f of await page.evaluate(scan)) seen.set(`${f.kind}|${f.text}`, f);
    const done = await page.evaluate(() => {
      const s = document.querySelector(".dv-active-group .cm-scroller, .cm-scroller") as HTMLElement | null;
      if (!s) return true;
      const before = s.scrollTop;
      s.scrollTop += s.clientHeight * 0.9;
      return s.scrollTop === before;
    });
    if (done) break;
    await page.waitForTimeout(250);
  }
  await page.keyboard.press("Control+w").catch(() => {});
  return [...seen.values()];
}

test("render audit", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await propertiesInline(page);
  await page.goto("/");
  await page.waitForTimeout(1500);
  const files: string[] = await (await page.request.get("/api/files", { headers: H })).json();
  // drawings saved by the Obsidian Excalidraw plugin are `.md` files but open in the drawing pane, not the editor
  const notes = files.filter((f) => /\.md$/i.test(f) && !/\.excalidraw\.md$/i.test(f)).sort();
  const results: [string, Finding[]][] = [];
  for (const n of notes) {
    const before = errors.length;
    // narrated, so a crash or a hang names the note it happened on
    console.log(`  …  ${n}`);
    const f = await auditNote(page, n);
    for (const e of errors.slice(before)) f.push({ kind: "page error", text: e.slice(0, 140) });
    results.push([n, f]);
    if (f.length) console.log(`${f.length.toString().padStart(3)}  ${n}`);
  }
  // report: totals per kind, then per note
  const byKind = new Map<string, number>();
  for (const [, fs] of results) for (const f of fs) byKind.set(f.kind, (byKind.get(f.kind) ?? 0) + 1);
  const bad = results.filter(([, f]) => f.length);
  const lines = [
    `# Markdown render audit`, ``, `${notes.length} notes, ${bad.length} with problems, ${[...byKind.values()].reduce((a, b) => a + b, 0)} findings.`, ``,
    `| kind | findings |`, `|---|---|`, ...[...byKind].sort((a, b) => b[1] - a[1]).map(([k, n]) => `| ${k} | ${n} |`), ``,
    ...bad.flatMap(([n, fs]) => [`## ${n}`, ...fs.map((f) => `- **${f.kind}** — \`${f.text.replace(/`/g, "'")}\``), ``]),
  ];
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, "REPORT.md"), lines.join("\n"));
  console.log(`\n${notes.length} notes · ${bad.length} with problems → ${join(OUT, "REPORT.md")}`);
});
