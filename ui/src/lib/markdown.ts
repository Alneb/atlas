// Reading-view markdown: markdown-it + KaTeX + Obsidian flavour (wikilinks, embeds, ==mark==,
// callouts, task lists, #tags). Also feeds the live-preview editor's rendered blocks (blockHtml).
import { escapeHtml } from "./text";
import MarkdownIt from "markdown-it";
import type { StateInline, StateBlock, StateCore } from "markdown-it";
import { mathToString } from "./math";
import { highlightToHtml, onHighlightLanguage } from "./highlight";
import DOMPurify from "dompurify";
import { resolveRel, shownName } from "./paths";
import { onVaultChange, resolveLink, resolveOrBeside } from "./vault";
import { onSettings } from "./settings.svelte";
import { wikilinkAt } from "./wikilink-syntax";

export { resolveRel };

const esc = escapeHtml;
const IMAGE_EXT = /\.(png|jpe?g|gif|svg|webp|avif|bmp)$/i;

// --- math: $…$ inline, $$…$$ block (pandoc-ish rules: no space inside the delimiters) ----------
function mathInline(state: StateInline, silent: boolean): boolean {
  const src = state.src, start = state.pos;
  if (src.charCodeAt(start) !== 0x24 /* $ */) return false;
  if (src.charCodeAt(start + 1) === 0x24) {
    // inline $$…$$ inside a paragraph: display math on its own
    const end = src.indexOf("$$", start + 2);
    if (end < 0) return false;
    if (!silent) { const t = state.push("math_block_inline", "math", 0); t.content = src.slice(start + 2, end); }
    state.pos = end + 2;
    return true;
  }
  const next = src.charCodeAt(start + 1);
  if (!next || next === 0x20 || next === 0x09) return false;
  let end = start + 1;
  while ((end = src.indexOf("$", end)) >= 0) {
    if (src.charCodeAt(end - 1) === 0x5c /* \ */) { end++; continue; }
    break;
  }
  if (end < 0 || end === start + 1) return false;
  const before = src.charCodeAt(end - 1);
  if (before === 0x20 || before === 0x09) return false;
  const after = src.charCodeAt(end + 1);
  if (after >= 0x30 && after <= 0x39) return false; // "$5 and $6" is money, not math
  // punctuation right after the formula stays on its line with it ("jump line … after latex")
  const glue = /^[.,;:!?)\]’”]+/.exec(src.slice(end + 1, end + 5))?.[0] ?? "";
  if (!silent) { const t = state.push("math_inline", "math", 0); t.content = src.slice(start + 1, end); t.info = glue; }
  state.pos = end + 1 + glue.length;
  return true;
}

/** Display math between `open` and `close`: `$$…$$` (Obsidian) and `\\[…\\]` (LaTeX). */
const mathBlockOf = (open: string, close: string) => function mathBlock(state: StateBlock, startLine: number, endLine: number, silent: boolean): boolean {
  const src = state.src;
  const lineStart = (l: number) => state.bMarks[l] + state.tShift[l];
  if (state.sCount[startLine] - state.blkIndent >= 4) return false;
  if (src.slice(lineStart(startLine), lineStart(startLine) + open.length) !== open) return false;
  if (silent) return true;
  // The closer is the next `$$` anywhere (mid-line included), as in Obsidian and in the editor's
  // BlockMath parser (obsidian-syntax.js): both must pair delimiters the same way.
  let from0 = lineStart(startLine) + open.length;
  let line = startLine;
  for (;;) {
    const first = line;
    let end = -1;
    for (let from = from0; line < endLine; line++, from = lineStart(line)) {
      if (line > first && state.sCount[line] < state.blkIndent && lineStart(line) < state.eMarks[line]) { line--; break; }
      const idx = src.indexOf(close, from);
      if (idx >= 0 && idx < state.eMarks[line]) { end = idx; break; }
    }
    line = Math.min(line, endLine - 1);
    // content line by line, so container prefixes (`> `, list indent) never reach the TeX
    const parts: string[] = [];
    for (let l = first; l <= line; l++) parts.push(src.slice(l === first ? from0 : lineStart(l), l === line && end >= 0 ? end : state.eMarks[l]));
    const t = state.push("math_block", "math", 0);
    t.block = true;
    t.content = parts.join("\n").trim();
    t.map = [first, line + 1];
    t.markup = open;
    state.line = line + 1;
    if (end < 0) return true;
    const rest = src.slice(end + close.length, state.eMarks[line]);
    const reopen = rest.trimStart().startsWith(open) ? rest.length - rest.trimStart().length + open.length : -1;
    if (reopen >= 0) { from0 = end + close.length + reopen; continue; } // `$$$$`: the next formula opens here
    if (!rest.trim()) return true;
    // prose after the closer (`$$which in space…`) is a paragraph, continued by the following lines
    let last = line;
    while (last + 1 < endLine && !state.isEmpty(last + 1) && !src.startsWith(open, lineStart(last + 1))) last++;
    const lines = [rest];
    for (let l = line + 1; l <= last; l++) lines.push(src.slice(lineStart(l), state.eMarks[l]));
    state.push("paragraph_open", "p", 1).map = [line, last + 1];
    const inl = state.push("inline", "", 0);
    inl.content = lines.join("\n").trim();
    inl.map = [line, last + 1];
    inl.children = [];
    state.push("paragraph_close", "p", -1);
    state.line = last + 1;
    return true;
  }
};

// --- wikilinks [[t|a]], embeds ![[x]], highlight ==x==, #tags ------------------------------------
function wikilink(state: StateInline, silent: boolean): boolean {
  const m = wikilinkAt(state.src, state.pos);
  if (!m) return false;
  if (!silent) {
    const t = state.push(m.embed ? "wiki_embed" : "wikilink", "", 0);
    t.meta = { target: m.target, alias: m.alias };
  }
  state.pos = m.end;
  return true;
}

function highlightMark(state: StateInline, silent: boolean): boolean {
  const src = state.src, start = state.pos;
  if (src.slice(start, start + 2) !== "==" || src.charCodeAt(start + 2) === 0x20) return false;
  const end = src.indexOf("==", start + 2);
  if (end < 0 || end === start + 2) return false;
  if (!silent) {
    state.push("mark_open", "mark", 1);
    const saved = state.posMax;
    state.pos = start + 2; state.posMax = end;
    state.md.inline.tokenize(state);
    state.posMax = saved;
    state.push("mark_close", "mark", -1);
  }
  state.pos = end + 2;
  return true;
}

function hashtag(state: StateInline, silent: boolean): boolean {
  const src = state.src, start = state.pos;
  if (src.charCodeAt(start) !== 0x23) return false;
  if (start > 0 && !/\s|\(/.test(src[start - 1])) return false;
  const m = /^#([\p{L}_][\p{L}\p{N}_/-]*)/u.exec(src.slice(start));
  if (!m) return false;
  if (!silent) { const t = state.push("hashtag", "", 0); t.content = m[1]; }
  state.pos = start + m[0].length;
  return true;
}

// --- task lists + callouts (core passes over the token stream) -----------------------------------
function taskLists(state: StateCore): void {
  const toks = state.tokens;
  for (let i = 2; i < toks.length; i++) {
    const inline = toks[i];
    if (inline.type !== "inline" || toks[i - 1].type !== "paragraph_open" || toks[i - 2].type !== "list_item_open") continue;
    const m = /^\[([ xX])\]\s/.exec(inline.content);
    if (!m || !inline.children?.length) continue;
    const first = inline.children[0];
    if (first.type !== "text" || !first.content.startsWith(m[0].slice(0, 3))) continue;
    first.content = first.content.slice(3).replace(/^\s/, "");
    const box = new state.Token("html_inline", "", 0);
    const checked = m[1] !== " ";
    // data-line: the to-do's 0-based line in the rendered text, so a view that knows its file can tick it (Markdown.svelte)
    box.content = `<input type="checkbox" class="task-checkbox" data-line="${toks[i - 2].map?.[0] ?? -1}" disabled${checked ? " checked" : ""}>`;
    inline.children.unshift(box);
    toks[i - 2].attrJoin("class", `task-list-item${checked ? " is-checked" : ""}`);
    // mark the parent list too, so its bullets can be dropped
    for (let j = i - 3; j >= 0; j--) {
      if (toks[j].type === "bullet_list_open" || toks[j].type === "ordered_list_open") {
        if (toks[j].level === toks[i - 2].level - 1) { toks[j].attrJoin("class", "contains-task-list"); break; }
      }
    }
  }
}

const CALLOUT_RE = /^\[!([A-Za-z-]+)\]([+-]?)[ \t]*(.*)$/;
function callouts(state: StateCore): void {
  const toks = state.tokens;
  for (let i = 0; i < toks.length; i++) {
    if (toks[i].type !== "blockquote_open") continue;
    const inline = toks[i + 2];
    if (toks[i + 1]?.type !== "paragraph_open" || inline?.type !== "inline") continue;
    const firstLine = inline.content.split("\n", 1)[0];
    const m = CALLOUT_RE.exec(firstLine);
    if (!m) continue;
    const kind = m[1].toLowerCase();
    const title = m[3] || kind.charAt(0).toUpperCase() + kind.slice(1);
    toks[i].attrJoin("class", `callout callout-${kind}`);
    toks[i].meta = { callout: kind, title, fold: m[2] }; // "-": folded, "+": open but foldable, "": plain (Obsidian)
    // drop the marker line from the paragraph; if it was the only line, the paragraph goes too
    const rest = inline.content.slice(firstLine.length + 1);
    if (rest.trim()) {
      inline.content = rest;
      const children = inline.children ?? [];
      const br = children.findIndex((c) => c.type === "softbreak" || c.type === "hardbreak");
      inline.children = br >= 0 ? children.slice(br + 1) : [];
    } else {
      toks.splice(i + 1, 3);
    }
  }
}

export interface MdEnv { /** directory of the note, for relative embeds */ dir?: string }
const dirOf = (env: unknown): string | undefined => (env as MdEnv | undefined)?.dir;

function build() {
  const md = new MarkdownIt({
    // raw HTML as in Obsidian (<u>, <sup>, <img src="data:…">, <details>); sanitized in renderMarkdown
    html: true,
    linkify: true,
    typographer: false,
    // Obsidian's default ("Strict line breaks" off): a newline inside a paragraph shows; `[editor] strict_line_breaks`
    // turns it off (applied when the settings load, below)
    breaks: true,
    highlight: (code, lang, attrs) => {
      const html = highlightToHtml(code, lang);
      // the rest of the fence's first line (```pdf-marks ch 1.cbz) for a fence that reads it (lib/fences.ts `info`)
      const info = attrs?.trim() ? ` data-info="${esc(attrs.trim())}"` : "";
      const label = lang ? `<span class="code-lang"${info}>${esc(lang)}</span>` : "";
      return `<pre class="hljs">${label}<code>${html ?? esc(code)}</code></pre>`;
    },
  });
  // indented code off, as in the editor (obsidian-syntax.js): tab-indented prose is text here
  md.disable("code");
  md.inline.ruler.after("escape", "math_inline", mathInline);
  md.block.ruler.after("blockquote", "math_block", mathBlockOf("$$", "$$"), { alt: ["paragraph", "reference", "blockquote", "list"] });
  md.block.ruler.after("math_block", "math_block_tex", mathBlockOf("\\[", "\\]"), { alt: ["paragraph", "reference", "blockquote", "list"] });
  md.inline.ruler.before("link", "wikilink", wikilink);
  md.inline.ruler.before("emphasis", "mark", highlightMark);
  md.inline.ruler.push("hashtag", hashtag);
  md.core.ruler.push("task_lists", taskLists);
  md.core.ruler.push("callouts", callouts);

  const r = md.renderer.rules;
  // an inline expression (docs/guides/EXPRESSIONS.md): its value is filled in by lib/expr.ts (hydrateExprs)
  const defaultCode = r.code_inline!;
  r.code_inline = (t, i, o, env, self) => {
    const expr = /^=\s*\S/.test(t[i].content) ? t[i].content.replace(/^=\s*/, "") : null;
    return expr === null ? defaultCode(t, i, o, env, self) : `<code class="expr expr-wait" data-expr="${esc(expr)}" title="= ${esc(expr)}">…</code>`;
  };
  // Obsidian Ink plugin blocks hold a pointer to a `.drawing` file, not content: show what they are
  const defaultFence = r.fence!;
  r.fence = (t, i, o, env, self) => {
    // a view block (docs/guides/MALLEABLE.md): drawn by lib/blocks.ts once mounted (hydrateBlocks)
    if (t[i].info.trim() === "view") return `<div class="view-block" data-src="${esc(t[i].content)}"><p class="view-loading">…</p></div>`;
    if (!/^(handdrawn|handwritten)-ink$/.test(t[i].info.trim())) return defaultFence(t, i, o, env, self);
    let file = "";
    try { file = String(JSON.parse(t[i].content).filepath ?? ""); } catch { /* not JSON: shown as is */ }
    const hit = file && resolveLink(file, dirOf(env) ?? "");
    const what = t[i].info.startsWith("handdrawn") ? "drawing" : "handwriting";
    return hit
      ? `<div class="ink-card">Ink ${what}: <a class="internal-link" data-href="${esc(hit)}" href="#">${esc(shownName(file))}</a> (Ink plugin format — open to view)</div>`
      : `<div class="ink-card is-missing">Ink ${what} <code>${esc(file || "?")}</code> — the file is not in this workspace (Obsidian Ink plugin).</div>`;
  };
  r.math_inline = (t, i) => (t[i].info ? `<span class="math-glue">${mathToString(t[i].content, false)}${md.utils.escapeHtml(t[i].info)}</span>` : mathToString(t[i].content, false));
  r.math_block = (t, i) => `<div class="math-display">${mathToString(t[i].content, true)}</div>\n`;
  r.math_block_inline = (t, i) => `<span class="math-display">${mathToString(t[i].content, true)}</span>`;
  r.wikilink = (t, i, _o, env) => {
    const { target, alias } = t[i].meta as { target: string; alias?: string };
    const label = alias || target.split("#")[0].split("/").pop() || target;
    const unresolved = resolveLink(target, dirOf(env) ?? "") ? "" : " is-unresolved";
    return `<a class="internal-link${unresolved}" data-href="${esc(target)}" href="#">${esc(label)}</a>`;
  };
  r.wiki_embed = (t, i, _o, env) => {
    const { target, alias } = t[i].meta as { target: string; alias?: string };
    const path = target.split("#")[0].trim();
    if (IMAGE_EXT.test(path)) {
      // `|600`, `|600x400` (Obsidian sizes) and `|center` (this vault's CSS snippet) after the target
      const opts = (alias ?? "").split("|").map((p) => p.trim());
      const width = opts.map((p) => /^(\d+)(?:x\d+)?$/.exec(p)?.[1]).find(Boolean);
      const cls = `embed-img${opts.includes("center") ? " is-centered" : ""}`;
      return `<img class="${cls}" data-src="${esc(resolveOrBeside(path, dirOf(env) ?? ""))}" alt="${esc(path)}"${width ? ` style="width:${width}px"` : ""}>`;
    }
    // a PDF and a note are embedded as Obsidian does, any other file by what is registered for it (a drawing,
    // a plugin's: lib/embed-registry.ts) or its own viewer (lib/embeds.ts mounts them all); the link chip is what
    // shows until then, and stays where the target is missing. `|600|center` travel as data-opts.
    const chip = `<a class="internal-link embed-chip" data-href="${esc(target)}" href="#">${esc(target)}</a>`;
    const attrs = `data-target="${esc(target.split("|")[0])}"${alias ? ` data-opts="${esc(alias)}"` : ""}`;
    return `<div class="${embedClass(path)}" ${attrs}>${chip}</div>`;
  };
  r.hashtag = (t, i) => `<span class="tag">#${esc(t[i].content)}</span>`;
  // local images get resolved + fetched with the API header by hydrate(); remote ones load as-is
  const defaultImage = r.image!;
  r.image = (t, i, o, env, self) => {
    const src = String(t[i].attrGet("src") ?? "");
    if (!/^(https?:|data:|blob:)/.test(src)) {
      t[i].attrSet("data-src", resolveOrBeside(src, dirOf(env) ?? "", false));
      t[i].attrSet("src", "");
    }
    return defaultImage(t, i, o, env, self);
  };
  const defaultBq = r.blockquote_open ?? ((t, i, o, _e, self) => self.renderToken(t, i, o));
  r.blockquote_open = (t, i, o, env, self) => {
    const meta = t[i].meta as { callout?: string; title?: string; fold?: string } | null;
    if (!meta?.callout) return defaultBq(t, i, o, env, self);
    const title = md.renderInline(meta.title ?? "");
    // a foldable callout is a <details>: its title the summary, folded unless "+" (as Obsidian draws `[!x]-`)
    if (meta.fold) return `<details class="callout callout-${esc(meta.callout)}"${meta.fold === "+" ? " open" : ""}><summary class="callout-title">${title}</summary><div class="callout-body">`;
    return `<div class="callout callout-${esc(meta.callout)}"><div class="callout-title">${title}</div><div class="callout-body">`;
  };
  const defaultBqClose = r.blockquote_close ?? ((t, i, o, _e, self) => self.renderToken(t, i, o));
  r.blockquote_close = (t, i, o, env, self) => {
    // find the matching open to know whether this closes a callout
    let depth = 0;
    for (let j = i - 1; j >= 0; j--) {
      if (t[j].type === "blockquote_close") depth++;
      else if (t[j].type === "blockquote_open") {
        if (depth === 0) {
          const meta = t[j].meta as { callout?: string; fold?: string } | null;
          if (!meta?.callout) return defaultBqClose(t, i, o, env, self);
          return meta.fold ? "</div></details>\n" : "</div></div>\n";
        }
        depth--;
      }
    }
    return defaultBqClose(t, i, o, env, self);
  };
  // tables get a scroll wrapper so a wide table never widens the pane
  r.table_open = () => `<div class="table-wrap"><table>\n`;
  r.table_close = () => `</table></div>\n`;
  return md;
}

export const md = build();
// registered before the caches below: they are cleared after the rule changed, never before
onSettings((c) => md.set({ breaks: !c.editor.strict_line_breaks }));

/** `<!-- … -->` comments are notes to the author (e.g. FOCUS.md's header): hide them, as Obsidian
 * does, without enabling raw HTML. Fenced/inline code keeps them verbatim. */
/** The note without its leading YAML frontmatter (cards like Today's FOCUS show the body only). */
export function stripFrontmatter(text: string): string {
  return text.replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n(---|\.\.\.)[ \t]*(\r?\n|$)/, "");
}

export function stripComments(text: string): string {
  return text.replace(/(^ {0,3}(`{3,}|~{3,})[^]*?^ {0,3}\2[`~]*[ \t]*$)|(`+)[^`\n]*?\3|<!--[^]*?-->/gm,
    (m, fence, _f, tick) => (fence || tick ? m : ""));
}

// Raw HTML is the note author's, but notes also arrive from the web: scripts, handlers and frames
// go (the page holds the API that runs commands). Local <img src> gets the same data-src treatment
// as markdown images, so hydrateImages() fetches it with the API header.
let purifyEnv: MdEnv = {};
// a worker that loads the chunk this module is in (Excalidraw's font subsetting) has no window: DOMPurify is then a stub
// without addHook, and calling it threw there — the worker failed and Excalidraw fell back to the main thread
if (DOMPurify.isSupported) DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName !== "IMG") return;
  const src = node.getAttribute("src") ?? "";
  if (src && !/^(https?:|data:|blob:)/.test(src)) {
    node.setAttribute("data-src", resolveOrBeside(src, purifyEnv.dir ?? "", false));
    node.setAttribute("src", "");
  }
});
// A video player written in a note (a clipped YouTube video is an http
// frame with the video): an <iframe> stays only when it is one of these players; any other frame is dropped
const PLAYERS = /^https:\/\/(www\.youtube-nocookie\.com\/embed\/|www\.youtube\.com\/embed\/|player\.vimeo\.com\/video\/)[\w-]+/;
DOMPurify.addHook("uponSanitizeElement", (node, data) => {
  if (data.tagName !== "iframe") return;
  const el = node as Element;
  if (!PLAYERS.test(el.getAttribute("src") ?? "")) { el.parentNode?.removeChild(el); return; }
  el.setAttribute("allow", "fullscreen; picture-in-picture; encrypted-media");
  el.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
  el.setAttribute("loading", "lazy");
});
const PURIFY = { ADD_ATTR: ["data-src", "data-href", "data-target", "target", "allow", "allowfullscreen", "referrerpolicy", "loading"], ADD_TAGS: ["semantics", "annotation", "iframe"], FORBID_TAGS: ["style"] };

/** Sanitized HTML for a raw HTML fragment written in a note (the editor's inline `<img>`, `<br>`). */
export function sanitizeHtml(html: string, dir?: string): string {
  purifyEnv = { dir };
  try { return DOMPurify.sanitize(html, PURIFY) as string; } finally { purifyEnv = {}; }
}

export function renderMarkdown(text: string, env: MdEnv = {}): string {
  const html = md.render(stripComments(text), env as Parameters<typeof md.render>[1]);
  purifyEnv = env;
  try { return DOMPurify.sanitize(html, PURIFY) as string; } finally { purifyEnv = {}; }
}

// --- live-preview caches ------------------------------------------------------------------------
// The editor asks for every rendered block and every inline HTML fragment of the note on each keystroke; rendering and
// sanitizing them again each time cost ~55 ms a key on a long note (scripts/dev/profile-ui.mjs, 2026-10-16). Keyed by
// folder + source, the oldest dropped first; cleared on a vault change (resolved embed paths are baked into the HTML).
function memo(limit: number, make: (source: string, dir?: string) => string): (source: string, dir?: string) => string {
  const cache = new Map<string, string>();
  onVaultChange(() => cache.clear());
  onHighlightLanguage(() => cache.clear()); // a fence drawn plain before its language had loaded
  let strict: boolean | undefined; // the line-break rule its HTML was made with
  onSettings((c) => { if (c.editor.strict_line_breaks !== strict) { strict = c.editor.strict_line_breaks; cache.clear(); } });
  return (source, dir) => {
    const key = `${dir ?? ""}\u0000${source}`;
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    const html = make(source, dir);
    if (cache.size >= limit) cache.delete(cache.keys().next().value!);
    cache.set(key, html);
    return html;
  };
}

/** HTML for a block the live-preview editor shows rendered (tables, fences, $$…$$, embeds). */
export const blockHtml: (source: string, dir?: string) => string | null = memo(300, (source, dir) => renderMarkdown(source, { dir }));
/** A raw HTML fragment written in a note (`<br>`, `<img>`, `<sup>`), sanitized, as the live-preview editor shows it. */
export const inlineHtml = memo(2000, sanitizeHtml);

/** The placeholder class an embedded file gets, which lib/embeds.ts mounts: a PDF's viewer, a note (or a link with no
 *  extension) as Obsidian embeds it, any other file by its own viewer, a player, or a card. The explorer's preview
 *  embeds the same way. */
export function embedClass(path: string): "pdf-embed" | "note-embed" | "file-embed" {
  if (/\.pdf$/i.test(path)) return "pdf-embed";
  if (!/\.[a-z0-9]{1,8}$/i.test(path) || /\.(md|markdown)$/i.test(path)) return "note-embed";
  return "file-embed";
}
