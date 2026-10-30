// Where the caret is, for whatever types differently in math: math, text or code, and which math. The core's, as
// note completion and the LaTeX symbols ask it too; a plugin asks through `atlas.editor.place`.
import type { EditorState } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";

/** Heuristic scan up to the caret: `$`/`$$`/`\(`/`\[`, fences skipped; an unclosed `$` counts as math, as it is while
 *  a formula is being typed. */
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

/** Math in a .tex file: `$…$`, `$$…$$`, `\(…\)`, `\[…\]` and math environments (their starred forms too); `%` comments
 *  and `\%` handled. Elsewhere is text. */
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

/** The line start of the top-level block (a child of the document) at `pos`; the line's start between blocks. */
function blockStart(state: EditorState, pos: number): number {
  let n = syntaxTree(state).resolveInner(pos, -1);
  while (n.parent && n.parent.parent) n = n.parent;
  const from = n.parent ? n.from : pos;
  return state.doc.lineAt(Math.min(from, pos)).from;
}

/** The fence or code span around `pos` in a note: its language ("" when it names none), or null outside code. */
function codeAt(state: EditorState, pos: number): string | null {
  for (let n: ReturnType<ReturnType<typeof syntaxTree>["resolveInner"]> | null = syntaxTree(state).resolveInner(pos, -1); n; n = n.parent) {
    if (n.name === "FencedCode") {
      const info = n.getChild("CodeInfo");
      return info ? state.sliceDoc(info.from, info.to).trim().split(/\s/)[0].toLowerCase() : "";
    }
    if (/^(CodeBlock|InlineCode|CodeText)$/.test(n.name)) return "";
  }
  return null;
}

/** Math at `pos` in a note. From the start of the caret's top-level block, not of the note: math does not span blocks,
 *  and scanning a big note from its top on every key cost ~3 ms a key. */
function noteMath(state: EditorState, pos: number): "display" | "inline" | null {
  const start = blockStart(state, pos);
  const here = mathMode(state.doc.sliceString(start, pos), pos - start);
  if (here) return here;
  // a `$$` display holding a blank line (a matrix's empty row, a snippet's stop) spans several Markdown blocks: its
  // `$$` counted from further back — only "display" trusted there, an inline `$` parity does not cross blocks
  const wide = state.doc.lineAt(Math.max(0, pos - 4000)).from;
  return start > wide && mathMode(state.doc.sliceString(wide, pos), pos - wide) === "display" ? "display" : null;
}

// Arguments that hold words or names, not formulas: nothing about math applies inside them. `\mathbf{r}` is not here,
// as its argument is a symbol.
const TEXT_ARGS = /^(?:text\w*|mathrm|operatorname\*?|mbox|hbox|label|tag\*?|ref|eqref|cref|Cref|cite\w*|begin|end|hspace\*?|vspace\*?|color|textcolor|href|url)$/;
const SCAN_BACK = 600; // an argument longer than this is not a label

/** Whether `pos` is inside a text-like argument of a formula (`\text{…}`, `\label{…}`), at any depth. */
export function inTextArg(state: EditorState, pos: number): boolean {
  const from = Math.max(0, pos - SCAN_BACK), s = state.sliceDoc(from, pos);
  let depth = 0;
  for (let i = s.length - 1; i >= 0; i--) {
    const c = s[i];
    if (c !== "{" && c !== "}") continue;
    if (s[i - 1] === "\\") continue; // \{ and \} are not groups
    if (c === "}") { depth++; continue; }
    if (depth) { depth--; continue; }
    const name = /\\([A-Za-z]+\*?)$/.exec(s.slice(Math.max(0, i - 24), i))?.[1];
    if (name && TEXT_ARGS.test(name)) return true;
  }
  return false;
}

/** What a place in a file is. */
export type Place =
  | { kind: "text" }
  | { kind: "math"; form: "inline" | "display"; textArg: boolean }
  /** In a code file or a note's fence. `lang`: the fence's word or the file's extension; "" when unnamed. */
  | { kind: "code"; lang: string };

export const isTex = (path: string) => /\.tex$/i.test(path);
const isNote = (path: string) => /\.(md|markdown)$/i.test(path);
const extOf = (path: string) => /\.([^./]+)$/.exec(path)?.[1].toLowerCase() ?? "";

/** The place at `pos` of the file at `path`. Scans the text: asked when something needs it, not on every key. */
export function placeAt(state: EditorState, pos: number, path: string): Place {
  const tex = isTex(path);
  if (!tex && !isNote(path)) return { kind: "code", lang: extOf(path) };
  if (!tex) {
    const lang = codeAt(state, pos);
    if (lang !== null) return { kind: "code", lang };
  }
  const form = tex ? texMathMode(state.doc.sliceString(0, pos), pos) : noteMath(state, pos);
  return form ? { kind: "math", form, textArg: inTextArg(state, pos) } : { kind: "text" };
}
