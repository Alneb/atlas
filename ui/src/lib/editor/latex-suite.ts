// LaTeX Suite snippets for CodeMirror (a port of obsidian-web's latexsuite.js, which ported the
// core of Obsidian's LaTeX Suite). Snippets come from the user's own file (/api/snippets, the
// plugin's JS-array format); tab stops become CodeMirror snippet fields.
//   options: t text · m math · M display · n inline · c code · A auto · r regex · w word boundary
import { EditorView, keymap } from "@codemirror/view";
import { Prec, type EditorState, type Extension } from "@codemirror/state";
import { snippet, type CompletionContext, type CompletionResult } from "@codemirror/autocomplete";
import { syntaxTree } from "@codemirror/language";
import { api } from "../api";

type Raw = { trigger?: string | RegExp; replacement?: string | ((m: unknown) => unknown); options?: string; priority?: number };
type Compiled = {
  plain: string | null; regex: RegExp | null; replacement: Raw["replacement"]; auto: boolean; word: boolean;
  text: boolean; math: boolean; display: boolean; inline: boolean; code: boolean; priority: number;
};
type Ctx = "code" | "display" | "inline" | null;

const TAIL = 120; // only the text just before the caret can hold a trigger

function stripWrappers(s: string): string {
  s = s.replace(/^\s*import\b[^\n;]*;?\s*$/gm, "").replace(/export\s+default\s+/, "");
  s = s.replace(/export\s+const\s+[A-Za-z_$][\w$]*\s*=\s*/, "").replace(/^\s*const\s+[A-Za-z_$][\w$]*\s*=\s*/m, "");
  return s.trim().replace(/;\s*$/, "");
}
// The user's own snippet file, evaluated like the Obsidian plugin does (it is JS, not JSON).
// Function replacements that need Node (`require`) fail when called and are skipped then.
function evalSource(src: string): unknown {
  let s = src;
  if (/^\s*(#|---)/.test(s)) s = /```(?:js|javascript|json)?\s*([\s\S]*?)```/.exec(s)?.[1] ?? s;
  return new Function(`return (${stripWrappers(s)});`)();
}
function parseVars(text: string): Record<string, string> {
  if (!text.trim()) return {};
  try { return (evalSource(text) as Record<string, string>) ?? {}; } catch { return {}; }
}

function compile(s: Raw, vars: Record<string, string>): Compiled | null {
  if (!s || s.trigger == null || s.replacement == null) return null;
  const o = String(s.options ?? "");
  const text = o.includes("t"), code = o.includes("c"), display = o.includes("M"), inline = o.includes("n");
  let regex: RegExp | null = null, plain: string | null = null;
  try {
    if (s.trigger instanceof RegExp) regex = new RegExp(`(?:${s.trigger.source})$`, s.trigger.flags.replace(/[gy]/g, ""));
    else {
      let t = String(s.trigger);
      for (const k in vars) t = t.split(k).join(vars[k]); // ${GREEK} → (alpha|beta|…)
      if (o.includes("r")) regex = new RegExp(`(?:${t})$`);
      else if (t) plain = t;
      else return null;
    }
  } catch { return null; }
  return {
    plain, regex, replacement: s.replacement, auto: o.includes("A"), word: o.includes("w"), text, code, display, inline,
    math: o.includes("m") || display || inline || (!text && !code), priority: typeof s.priority === "number" ? s.priority : 0,
  };
}

let SNIPPETS: Compiled[] = [];
// command names for the completion list: the Greek letters always, plus what the vault's snippet
// variables name (${GREEK}, ${SYMBOL}…: "alpha|beta|…") — those expand by pattern, so no trigger lists them
const GREEK = "alpha beta gamma Gamma delta Delta epsilon varepsilon zeta eta theta vartheta Theta iota kappa lambda Lambda mu nu xi Xi pi Pi rho varrho sigma varsigma Sigma tau upsilon Upsilon phi varphi Phi chi psi Psi omega Omega".split(" ");
let SYMBOLS: string[] = GREEK;
const symbolsOf = (vars: Record<string, string>): string[] =>
  [...new Set([...GREEK, ...Object.values(vars).flatMap((v) => String(v).split("|")).filter((w) => /^[A-Za-z]{2,}$/.test(w))])];
let loading: Promise<void> | null = null;
/** (Re)loads the configured snippets; cheap to call on every settings change. */
export function reloadSnippets(): Promise<void> {
  loading = (async () => {
    try {
      const d = await api.snippets();
      const vars = parseVars(d.variables);
      SYMBOLS = symbolsOf(vars);
      const list: Compiled[] = [];
      for (const src of d.sources) {
        try {
          const arr = evalSource(src);
          if (Array.isArray(arr)) for (const s of arr) { const c = compile(s as Raw, vars); if (c) list.push(c); }
        } catch (err) { console.warn("[atlas] latex snippets: could not parse a source", err); }
      }
      // stable: higher priority first, then file order (the plugin's rule)
      SNIPPETS = list.map((s, i) => [s, i] as const).sort((a, b) => b[0].priority - a[0].priority || a[1] - b[1]).map(([s]) => s);
    } catch { SNIPPETS = []; }
  })();
  return loading;
}
export const snippetCount = () => SNIPPETS.length;

/** Heuristic scan up to the caret (obsidian-web latexsuite-context.js): `$`/`$$`/`\(`/`\[`, fences skipped. */
export function mathMode(text: string, pos: number): "display" | "inline" | null {
  let inline = false, display = false, code = false, i = 0;
  while (i < pos) {
    if (i === 0 || text[i - 1] === "\n") {
      const fence = /^([`~]{3,})[^\n]*\n?/.exec(text.slice(i, i + 200));
      if (fence) {
        const j = i + fence[0].length;
        const m = new RegExp(`(^|\\n)[ \\t]*\\${fence[1][0]}{3,}[^\\n]*(\\n|$)`).exec(text.slice(j, pos));
        i = m ? j + m.index + m[0].length : pos;
        code = false;
        continue;
      }
    }
    const c = text[i];
    if (c === "\\") {
      const n = text[i + 1];
      if (n === "(") inline = true; else if (n === ")") inline = false; else if (n === "[") display = true; else if (n === "]") display = false;
      i += 2; continue;
    }
    if (c === "`") { code = !code; i++; continue; }
    if (!code && c === "$") {
      if (text[i + 1] === "$") { display = !display; i += 2; continue; }
      inline = !inline; i++; continue;
    }
    i++;
  }
  return display ? "display" : inline ? "inline" : null;
}

const MATH_ENV = /^(equation|align|alignat|gather|multline|flalign|eqnarray|math|displaymath|dmath)\*?$/;

/** Math context in a .tex file: `$…$`, `$$…$$`, `\(…\)`, `\[…\]` and math environments (equation,
 *  align…; their starred forms); `%` comments and `\%` handled. Text elsewhere is text mode, so text
 *  snippets fire in prose and math snippets only in math (it used to treat the whole file as math). */
export function texMathMode(text: string, pos: number): "display" | "inline" | null {
  let inline = false, display = false, env = 0;
  for (let i = 0; i < pos; i++) {
    const c = text[i];
    if (c === "%" ) { const nl = text.indexOf("\n", i); if (nl < 0 || nl >= pos) break; i = nl; continue; }
    if (c === "\\") {
      const n = text[i + 1];
      if (n === "(") inline = true; else if (n === ")") inline = false;
      else if (n === "[") display = true; else if (n === "]") display = false;
      else {
        const m = /^\\(begin|end)\{([^}]*)\}/.exec(text.slice(i, i + 40));
        if (m && MATH_ENV.test(m[2])) { env = Math.max(0, env + (m[1] === "begin" ? 1 : -1)); i += m[0].length - 1; continue; }
      }
      i++; continue;
    }
    if (c === "$") {
      if (text[i + 1] === "$") { display = !display; i++; } else inline = !inline;
    }
  }
  return display || env > 0 ? "display" : inline ? "inline" : null;
}

function contextAt(state: EditorState, pos: number, tex: boolean): Ctx {
  if (tex) return texMathMode(state.doc.sliceString(0, pos), pos);
  // code comes from the syntax tree (the scan cannot see it reliably); math from the scan, which
  // treats an unclosed `$` as math — exactly the state while a formula is being typed
  for (let n: ReturnType<ReturnType<typeof syntaxTree>["resolveInner"]> | null = syntaxTree(state).resolveInner(pos, -1); n; n = n.parent) {
    if (/^(FencedCode|CodeBlock|InlineCode|CodeText)$/.test(n.name)) return "code";
  }
  // from the start of the caret's top-level block, not of the note: math does not span blocks (a `$$` display, a fence
  // is a block of its own), and slicing and scanning a big note from its top on every key cost ~3 ms a key
  const start = blockStart(state, pos);
  return mathMode(state.doc.sliceString(start, pos), pos - start);
}

/** The line start of the top-level block (a child of the document) at `pos`; the line's start between blocks. */
function blockStart(state: EditorState, pos: number): number {
  let n = syntaxTree(state).resolveInner(pos, -1);
  while (n.parent && n.parent.parent) n = n.parent;
  const from = n.parent ? n.from : pos;
  return state.doc.lineAt(Math.min(from, pos)).from;
}

function modeOk(s: Compiled, ctx: Ctx): boolean {
  if (ctx === "code") return s.code;
  if (ctx === null) return s.text;
  if (!s.math) return false;
  return ctx === "display" ? !s.inline : !s.display;
}

/** LaTeX Suite replacement → CodeMirror snippet template. Tab stops shift by one: LaTeX Suite's
 *  `$0` is the *first* stop, CodeMirror's `${0}` the last (as in VS Code). Literal braces escaped. */
export function toTemplate(repl: string): string {
  const esc = repl.replace(/\\([{}])/g, "\\\\$1").replace(/#\{/g, "#\\{");
  return esc.replace(/\$\{(\d+)(?::([^}]*))?\}|\$(\d+)/g, (_m, a: string, ph: string | undefined, b: string) => `\${${Number(a ?? b) + 1}${ph ? `:${ph}` : ""}}`);
}

function replacementFor(s: Compiled, m: RegExpExecArray | null): string | null {
  let r = s.replacement;
  if (typeof r === "function") {
    try { r = r(m ?? undefined) as string; } catch { return null; } // e.g. needs Node's require
    if (typeof r !== "string") return null;
  }
  let out = String(r);
  if (m) out = out.replace(/\[\[(\d+)\]\]/g, (_w, d: string) => m[Number(d) + 1] ?? "");
  return out;
}

const isVisual = (s: Compiled) => typeof s.replacement === "string" && s.replacement.includes("${VISUAL}");

// --- the longest trigger wins --------------------------------------------------------------------
// LaTeX Suite fires the first auto snippet that matches, so a trigger that starts with another one
// ("kVA" after "kV", "pauli1" after "pauli") can never be typed. Here, among plain auto snippets of
// one priority the longest match wins, and one that could still grow into a longer trigger waits
// for the next key: that key either continues the longer one or releases the waiting one.

/** `text` ends with a start of `t`'s trigger that contains all of `s`'s and is not yet complete. */
const growsInto = (text: string, s: Compiled, t: Compiled): boolean => {
  if (t === s || !t.auto || !t.plain || t.plain.length <= s.plain!.length || isVisual(t)) return false;
  for (let k = s.plain!.length; k < t.plain.length; k++) {
    const start = t.plain.slice(0, k);
    if (start.endsWith(s.plain!) && text.endsWith(start)) return true;
  }
  return false;
};

type Waiting = { s: Compiled; from: number; to: number };
const waiting = new WeakMap<EditorView, Waiting>();
/** The snippet held back at the last key, if the caret is still right after its trigger. */
function takeWaiting(view: EditorView, head: number): Waiting | null {
  const w = waiting.get(view);
  waiting.delete(view);
  return w && w.to === head && view.state.sliceDoc(w.from, w.to) === w.s.plain ? w : null;
}
function expand(view: EditorView, s: Compiled, m: RegExpExecArray | null, from: number, to: number): boolean {
  const repl = replacementFor(s, m);
  if (repl == null) return false;
  snippet(toTemplate(repl))(view, null as never, from, to);
  return true;
}

/** Expands the snippet ending at `head` (with `typed` about to be inserted): the first that matches,
 *  or a longer plain one of the same priority; true when the key was handled. */
function tryExpand(view: EditorView, head: number, typed: string, autoOnly: boolean, tex: boolean): boolean {
  if (!SNIPPETS.length) return false;
  const held = takeWaiting(view, head);
  const line = view.state.doc.lineAt(head);
  const before = view.state.doc.sliceString(Math.max(line.from, head - TAIL), head) + typed;
  // the math context scans the note up to the caret: asked only once a trigger matches the text (most keys match
  // none), never on every key — on a long note that scan was ~33 ms a key (scripts/dev/profile-ui.mjs, 2026-10-16)
  let ctx: Ctx | undefined;
  const mode = () => (ctx === undefined ? (ctx = contextAt(view.state, head, tex)) : ctx);
  const startOf = (len: number) => head + typed.length - len; // where in the document a match of that length starts
  const kind = (s: Compiled) => autoOnly === s.auto && !isVisual(s); // visual ones need a selection
  const usable = (s: Compiled) => kind(s) && modeOk(s, mode());
  const plainHit = (s: Compiled) => {
    if (!s.plain || !before.endsWith(s.plain)) return false;
    const start = before.length - s.plain.length;
    return !(s.word && start > 0 && /[A-Za-z0-9]/.test(before[start - 1]));
  };
  let hit: { s: Compiled; m: RegExpExecArray | null; len: number } | null = null;
  for (const s of SNIPPETS) {
    if (!kind(s)) continue;
    const m = s.regex ? s.regex.exec(before) : null;
    if (s.regex ? !m : !plainHit(s)) continue;
    if (!modeOk(s, mode())) continue;
    hit = { s, m, len: m ? m[0].length : s.plain!.length };
    break;
  }
  if (hit && !hit.s.regex && autoOnly) {
    const first = hit.s;
    for (const s of SNIPPETS) if (s.priority === first.priority && plainHit(s) && s.plain!.length > hit.len && usable(s)) hit = { s, m: null, len: s.plain!.length };
  }
  // a waiting snippet that this key does not continue is released first, then the key is typed
  if (held && (!hit || startOf(hit.len) >= held.to)) {
    if (!expand(view, held.s, null, held.from, held.to)) return false;
    const at = view.state.selection.main.head;
    if (typed && !tryExpand(view, at, typed, autoOnly, tex)) view.dispatch(view.state.replaceSelection(typed));
    return true;
  }
  if (!hit) return false;
  const best = hit.s;
  if (autoOnly && best.plain && typed && SNIPPETS.some((t) => growsInto(before, best, t) && usable(t))) {
    waiting.set(view, { s: best, from: startOf(hit.len), to: head + typed.length });
    return false; // the key is typed as it is; the next one decides
  }
  return expand(view, best, hit.m, startOf(hit.len), head);
}

/** LaTeX Suite "visual" snippets: with text selected, typing the trigger wraps the selection
 *  (e.g. select `x`, type `U` → `\underbrace{x}_{…}`). */
function wrapSelection(view: EditorView, from: number, to: number, typed: string, tex: boolean): boolean {
  const ctx = contextAt(view.state, from, tex);
  const s = SNIPPETS.find((x) => isVisual(x) && x.plain === typed && modeOk(x, ctx));
  if (!s) return false;
  // the selection goes in literally: escape what the snippet syntax would read as fields
  const sel = view.state.sliceDoc(from, to).replace(/[\\{}]/g, (c) => "\\" + c);
  snippet(toTemplate((s.replacement as string).split("${VISUAL}").join("\u0000")).split("\u0000").join(sel))(view, null as never, from, to);
  return true;
}

/** Tab has a LaTeX job here (a waiting trigger to release, math to expand in or tab out of): a
 *  completion list still on its way must not take it (create.ts `walkList`). */
export function latexOwnsTab(view: EditorView): boolean {
  const head = view.state.selection.main.head;
  return waiting.has(view) || contextAt(view.state, head, false) !== null;
}

/** Tab right after a waiting trigger expands it. */
function releaseWaiting(view: EditorView): boolean {
  const w = takeWaiting(view, view.state.selection.main.head);
  return !!w && expand(view, w.s, null, w.from, w.to);
}

/** Tab with nothing to expand: jump over a closing bracket or `$` (LaTeX Suite's "tabout"). */
function tabout(view: EditorView): boolean {
  const { head } = view.state.selection.main;
  const next = view.state.doc.sliceString(head, head + 2);
  const step = next.startsWith("$$") ? 2 : /^[)\]}$]/.test(next) ? 1 : 0;
  if (!step) return false;
  view.dispatch({ selection: { anchor: head + step } });
  return true;
}

/** The triggers as completion entries — a way to find a snippet without knowing its name: while
 *  typing in math (two letters or more), and anywhere on Ctrl+Space. Only snippets with a fixed
 *  trigger and text: regex, visual and computed ones have nothing to list. */
export function snippetSource(tex: boolean) {
  return (ctx: CompletionContext): CompletionResult | null => {
    const word = ctx.matchBefore(/[A-Za-z@:][\w@:]*$/);
    if (!SNIPPETS.length || (!word && !ctx.explicit)) return null;
    const where = contextAt(ctx.state, ctx.pos, tex);
    if (where !== "display" && where !== "inline" && !ctx.explicit) return null; // never a popup over prose
    const typed = word?.text ?? "";
    const fixed = SNIPPETS.filter((s) => s.plain?.trim() && typeof s.replacement === "string" && !isVisual(s) && modeOk(s, where));
    // "x@a": the trigger starts where some snippet's name starts, not where the word does
    // never the empty prefix after a typed word (it listed every snippet, the first of them over prose)
    for (let i = 0; i <= Math.max(0, typed.length - (ctx.explicit ? 1 : 2)); i++) {
      const prefix = typed.slice(i);
      const found = fixed.filter((s) => s.plain!.trim().startsWith(prefix) && s.plain!.trim() !== prefix);
      if (!found.length) continue;
      const options = found
        .sort((a, b) => a.plain!.length - b.plain!.length || a.plain!.localeCompare(b.plain!))
        .slice(0, 50)
        .map((s) => {
          const repl = s.replacement as string;
          return {
            label: s.plain!.trim(), detail: repl.replace(/\s+/g, " ").slice(0, 48), type: "keyword",
            apply: (view: EditorView, _c: unknown, from: number, to: number) => snippet(toTemplate(repl))(view, null as never, from, to),
          };
        });
      return { from: (word?.from ?? ctx.pos) + i, options, filter: false };
    }
    return null;
  };
}

/** `\\alpha`, `\\nabla`…: command names in math, from two letters on (with or without the backslash). */
export function symbolSource(tex: boolean) {
  return (ctx: CompletionContext): CompletionResult | null => {
    const word = ctx.matchBefore(/\\?[A-Za-z]{2,}$/);
    if (!word) return null;
    const where = contextAt(ctx.state, ctx.pos, tex);
    if (where !== "display" && where !== "inline") return null;
    const typed = word.text.replace(/^\\/, "");
    const found = SYMBOLS.filter((s) => s.toLowerCase().startsWith(typed.toLowerCase()) && s !== typed).sort((a, b) => a.length - b.length || a.localeCompare(b)).slice(0, 40);
    return found.length ? { from: word.from, options: found.map((s) => ({ label: `\\${s}`, type: "constant" })), filter: false } : null;
  };
}

export function latexSuite(opts: { tex: boolean; enabled: () => boolean }): Extension {
  if (!loading) void reloadSnippets();
  return [
    EditorView.inputHandler.of((view, from, to, text) => {
      if (!opts.enabled() || text.length !== 1 || view.state.selection.ranges.length > 1) return false;
      if (from !== to) return wrapSelection(view, from, to, text, opts.tex);
      return tryExpand(view, from, text, true, opts.tex);
    }),
    // below CodeMirror's own snippet-field Tab (Prec.highest), above indentation
    Prec.high(keymap.of([{
      key: "Tab",
      run: (view) => opts.enabled() && view.state.selection.main.empty && (releaseWaiting(view) || tryExpand(view, view.state.selection.main.head, "", false, opts.tex) || (contextAt(view.state, view.state.selection.main.head, opts.tex) !== null && tabout(view))),
    }])),
  ];
}
