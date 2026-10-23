// KaTeX rendering shared by the reading views and the live-preview editor (renderMath hook).
import katex from "katex";

// One macro table for the session, so `\def`/`\newcommand` in one formula carry to the next
// (what readers of physics notes expect from MathJax-era documents).
const macros: Record<string, string> = {
  "\\R": "\\mathbb{R}",
  "\\C": "\\mathbb{C}",
  "\\N": "\\mathbb{N}",
  "\\Z": "\\mathbb{Z}",
  "\\ket": "\\left|#1\\right\\rangle",
  "\\bra": "\\left\\langle#1\\right|",
  "\\braket": "\\left\\langle#1\\right\\rangle",
  "\\Tr": "\\operatorname{Tr}",
};

const opts = (displayMode: boolean): katex.KatexOptions => ({
  displayMode,
  throwOnError: false,
  output: "html",
  macros,
  globalGroup: true,
  strict: "ignore",
  errorColor: "var(--red)",
});

// --- MathJax habits (the notes were written in Obsidian, which renders with MathJax) ---------------
const defined = new Map<string, boolean>();
/** Whether `\name` already means something to KaTeX (a built-in or an earlier \newcommand). */
function isDefined(name: string): boolean {
  if (macros[`\\${name}`] !== undefined) return true;
  let hit = defined.get(name);
  if (hit === undefined) {
    try { katex.renderToString(`\\${name}`, { throwOnError: true, macros: {} }); hit = true; }
    catch (e) { hit = !String((e as Error).message).includes("Undefined control sequence"); }
    defined.set(name, hit);
  }
  return hit;
}

/**
 * MathJax accepts what KaTeX rejects: `\newcommand` over an existing name (`\div`, or the same
 * note rendered twice) and a bare `_`/`^` inside `\text{}` (`\text{Nb_3Ge}`). Rewrite both.
 */
function compat(source: string): string {
  return source
    .replace(/\\(re)?newcommand\s*\{?\\([A-Za-z]+)\}?/g, (_m, _re, name: string) =>
      `\\${isDefined(name) ? "renewcommand" : "newcommand"}{\\${name}}`)
    .replace(/\\text\{([^{}]*)\}/g, (_m, body: string) => `\\text{${body.replace(/(?<!\\)([_^])/g, (c) => (c === "_" ? "\\_" : "\\^{}"))}}`);
}

export function renderMathInto(host: HTMLElement, source: string, block: boolean): void {
  katex.render(compat(source), host, opts(block));
}

export function mathToString(source: string, block: boolean): string {
  try {
    return katex.renderToString(compat(source), opts(block));
  } catch {
    return `<code class="math-error">${source.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!)}</code>`;
  }
}
