// KaTeX rendering shared by the reading views and the live-preview editor (renderMath hook).
// KaTeX (~260 KB) is fetched on first use, not at start: until it arrives a formula is a `.math-pending` span holding
// its source, rendered in place once it does (wherever that HTML went: a note, a list, a title).
import type { KatexOptions } from "katex";
import { rendererArrived } from "./lazy-render";

type Katex = typeof import("katex").default;
let katex: Katex | null = null;
let loading: Promise<Katex> | null = null;

/** KaTeX, fetched once; on arrival every pending formula on the page is drawn. */
export function loadMath(): Promise<Katex> {
  return (loading ??= import("katex").then((m) => {
    katex = m.default;
    for (const el of document.querySelectorAll<HTMLElement>(".math-pending")) drawPending(el);
    rendererArrived();
    return katex;
  }));
}

/** KaTeX if it has arrived (else null, and it is on its way). */
export function katexNow(): Katex | null {
  if (!katex) void loadMath();
  return katex;
}

/** A formula waiting for KaTeX: its source, drawn when KaTeX arrives. */
export const PENDING = (source: string, block: boolean) =>
  `<span class="math-pending"${block ? " data-display" : ""}>${source.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!)}</span>`;

function drawPending(el: HTMLElement): void {
  const source = el.textContent ?? "", block = el.hasAttribute("data-display");
  el.classList.remove("math-pending");
  try { katex!.render(compat(source), el, opts(block)); } catch { el.classList.add("math-error"); }
}

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

const opts = (displayMode: boolean): KatexOptions => ({
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
    try { katex!.renderToString(`\\${name}`, { throwOnError: true, macros: {} }); hit = true; }
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
  if (katex) { katex.render(compat(source), host, opts(block)); return; }
  host.innerHTML = PENDING(source, block);
  void loadMath();
}

export function mathToString(source: string, block: boolean): string {
  if (!katex) { void loadMath(); return PENDING(source, block); }
  try {
    return katex.renderToString(compat(source), opts(block));
  } catch {
    return `<code class="math-error">${source.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!)}</code>`;
  }
}
