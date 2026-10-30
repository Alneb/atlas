// Where Tab and Shift+Tab go in a formula: the next or previous place to type, one bracket at a time. The formula's text
// is read as a flat list of brackets and bounds, so both directions follow the same rules.
type Kind = "open" | "close" | "bound" | "wall";
interface Tok { from: number; to: number; kind: Kind }

// a delimiter after \left / \right: a bracket, `.`, `|`, or a command (\{, \langle, \rvert…)
const DELIM = /^(?:\\[A-Za-z]+|\\.|[^A-Za-z\s])/;
const OPENS = /^\\(?:langle|lvert|lVert|lfloor|lceil|lbrace)(?![A-Za-z])/, CLOSES = /^\\(?:rangle|rvert|rVert|rfloor|rceil|rbrace)(?![A-Za-z])/;
const ENV = /^\\(begin|end)\{([A-Za-z]+\*?)\}/;
// an environment that is the formula itself, in a .tex file; any other (`pmatrix`) is only something inside it
const MATH_ENV = /^(?:equation|align|alignat|flalign|gather|multline|eqnarray|displaymath|math)\*?$/;

/** The brackets and bounds of `text`, in order. A blank line is a wall: math does not cross one. */
function tokens(text: string): Tok[] {
  const out: Tok[] = [];
  const add = (from: number, len: number, kind: Kind) => { out.push({ from, to: from + len, kind }); return from + len; };
  for (let i = 0; i < text.length; ) {
    const rest = text.slice(i, i + 32), c = rest[0];
    const env = c === "\\" ? ENV.exec(rest) : null;
    if (env) i = MATH_ENV.test(env[2]) ? add(i, env[0].length, "bound") : i + env[0].length; // never into the name
    else if (rest.startsWith("\\left") && !/^\\left[A-Za-z]/.test(rest)) i = add(i, 5 + (DELIM.exec(rest.slice(5))?.[0].length ?? 0), "open");
    else if (rest.startsWith("\\right") && !/^\\right[A-Za-z]/.test(rest)) i = add(i, 6 + (DELIM.exec(rest.slice(6))?.[0].length ?? 0), "close");
    else if (OPENS.test(rest)) i = add(i, OPENS.exec(rest)![0].length, "open");
    else if (CLOSES.test(rest)) i = add(i, CLOSES.exec(rest)![0].length, "close");
    else if (rest.startsWith("\\{")) i = add(i, 2, "open");
    else if (rest.startsWith("\\}")) i = add(i, 2, "close");
    else if (rest.startsWith("\\[") || rest.startsWith("\\(") || rest.startsWith("\\]") || rest.startsWith("\\)")) i = add(i, 2, "bound");
    else if (c === "\\") i += /^\\(?:[A-Za-z]+|.|$)/s.exec(rest)?.[0].length ?? 1;
    else if ("{([".includes(c)) i = add(i, 1, "open");
    else if ("})]".includes(c)) i = add(i, 1, "close");
    else if (c === "$") i = add(i, rest[1] === "$" ? 2 : 1, "bound");
    else if (c === "\n" && /^\n[ \t]*\n/.test(rest)) i = add(i, 1, "wall");
    else i++;
  }
  return out;
}

/** Forward from the start of `text`: into the next bracket, out of the one that closes next (and straight into a bracket
 *  that follows it, as in `\frac{a}{b}` or `(a)(b)`, across a `^` or `_`), or out of the formula. Null: nowhere to go. */
export function nextPlace(text: string): number | null {
  const toks = tokens(text), t = toks[0];
  if (!t || t.kind === "wall") return null;
  if (t.kind !== "close") return t.to;
  const n = toks[1], gap = text.slice(t.to, n?.from ?? t.to);
  return n?.kind === "open" && (gap === "" || gap === "^" || gap === "_") ? n.to : t.to;
}

/** The same backward from the end of `text`, which is what stands before the caret. */
export function prevPlace(text: string): number | null {
  const toks = tokens(text), t = toks[toks.length - 1];
  if (!t || t.kind === "wall") return null;
  if (t.kind !== "open") return t.from;
  const script = /[\^_]$/.test(text.slice(0, t.from)) ? 1 : 0, before = t.from - script, p = toks[toks.length - 2];
  return p?.kind === "close" && p.to === before ? p.from : before;
}
