// Markdown with math for the rendered conversation: markdown-it, and $…$, $$…$$, \(…\), \[…\] turned into
// placeholders the app's math draws (view.ts). Claude's own text, so no HTML passes through.
import MarkdownIt from "markdown-it";
import type { StateInline, StateBlock } from "markdown-it";

function mathInline(state: StateInline, silent: boolean): boolean {
  const src = state.src, at = state.pos;
  const opens: [string, string, boolean][] = [["$$", "$$", true], ["\\[", "\\]", true], ["\\(", "\\)", false], ["$", "$", false]];
  for (const [open, close, block] of opens) {
    if (!src.startsWith(open, at)) continue;
    if (open === "$" && (/\s/.test(src[at + 1] ?? " ") || src[at + 1] === "$")) return false; // "$ 5" is money
    let end = src.indexOf(close, at + open.length);
    while (open === "$" && end > 0 && src[end - 1] === "\\") end = src.indexOf(close, end + 1);
    if (end < 0 || end === at + open.length) return false;
    if (open === "$" && /\s/.test(src[end - 1])) return false;
    if (!silent) { const t = state.push(block ? "math_display" : "math_inline", "", 0); t.content = src.slice(at + open.length, end); }
    state.pos = end + close.length;
    return true;
  }
  return false;
}
function mathBlock(state: StateBlock, start: number, end: number, silent: boolean): boolean {
  const line = (n: number) => state.src.slice(state.bMarks[n] + state.tShift[n], state.eMarks[n]);
  const first = line(start);
  const pair = first.startsWith("$$") ? "$$" : first.startsWith("\\[") ? "\\]" : null;
  if (!pair) return false;
  const rest = first.slice(2);
  let body: string[], last = start;
  if (rest.trim() !== "" && rest.trimEnd().endsWith(pair)) body = [rest.trimEnd().slice(0, -pair.length)];
  else {
    body = [rest];
    for (last = start + 1; last < end; last++) {
      const l = line(last);
      if (l.trimEnd().endsWith(pair)) { body.push(l.trimEnd().slice(0, -pair.length)); break; }
      body.push(l);
    }
    if (last >= end) return false;
  }
  if (silent) return true;
  const t = state.push("math_display", "", 0);
  t.content = body.join("\n").trim();
  t.map = [start, last + 1];
  state.line = last + 1;
  return true;
}
/** `[[target]]`, `[[target|label]]`, `![[target]]`: a link as notes draw it (view.ts resolves and follows it). */
function wikilink(state: StateInline, silent: boolean): boolean {
  const src = state.src, at = state.pos, embed = src.startsWith("![[", at);
  if (!embed && !src.startsWith("[[", at)) return false;
  const open = at + (embed ? 3 : 2), end = src.indexOf("]]", open);
  if (end < 0 || end === open || src.slice(open, end).includes("\n")) return false;
  if (!silent) {
    const [target, label] = src.slice(open, end).split("|");
    const t = state.push("wikilink", "", 0);
    t.meta = { target: target.trim(), label: (label ?? "").trim() };
  }
  state.pos = end + 2;
  return true;
}

export function markdown(): InstanceType<typeof MarkdownIt> {
  const md = new MarkdownIt({ html: false, linkify: true, breaks: false });
  md.inline.ruler.before("escape", "math", mathInline);
  md.inline.ruler.before("link", "wikilink", wikilink);
  md.block.ruler.before("fence", "math", mathBlock, { alt: ["paragraph", "reference", "blockquote", "list"] });
  const esc = md.utils.escapeHtml;
  md.renderer.rules.math_inline = (t, i) => `<span class="cc-math" data-tex="${esc(t[i].content)}">${esc(t[i].content)}</span>`;
  md.renderer.rules.math_display = (t, i) => `<div class="cc-math cc-display" data-tex="${esc(t[i].content)}">${esc(t[i].content)}</div>`;
  md.renderer.rules.wikilink = (t, i) => {
    const { target, label } = t[i].meta as { target: string; label: string };
    const shown = label || target.split("#")[0].split("/").pop() || target;
    return `<a class="internal-link" data-href="${esc(target)}" href="#">${esc(shown)}</a>`;
  };
  // a code block: its language and a copy button over it (view.ts wires the button)
  md.renderer.rules.fence = (t, i) => {
    const lang = t[i].info.trim().split(/\s+/)[0] ?? "";
    return `<div class="cc-code"><div class="cc-code-head"><span>${esc(lang || "text")}</span><button class="cc-copy" type="button">Copy</button></div><pre><code>${esc(t[i].content)}</code></pre></div>`;
  };
  return md;
}
