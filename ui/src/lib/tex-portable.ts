// Atlas's own TeX for other TeX readers: the macros KaTeX gets from Atlas (`\ket`, `\Tr`, `\mbox`…) as definitions a
// document can carry. math.ts draws with the table; the Export plugin puts the
// definitions in each document (the formulas keep `\ket` as written).

/** The macros every formula in Atlas may use, as KaTeX's `macros` option writes them (`#1` for an argument). */
export const MACROS: Record<string, string> = {
  "\\R": "\\mathbb{R}",
  "\\C": "\\mathbb{C}",
  "\\N": "\\mathbb{N}",
  "\\Z": "\\mathbb{Z}",
  "\\ket": "\\left| #1\\right\\rangle",
  "\\bra": "\\left\\langle #1\\right|",
  "\\braket": "\\left\\langle #1\\right\\rangle",
  "\\Tr": "\\operatorname{Tr}",
  "\\mbox": "\\text{#1}", // standard LaTeX and MathJax's; KaTeX has no such command and drew it as an error
};

/** The macros as definitions: `providecommand` for LaTeX (a package or preamble defining one first wins),
 *  `newcommand` for pandoc's reader, which applies them to every formula for Typst and Word. */
export function macroDefinitions(command: "providecommand" | "newcommand", macros: Record<string, string> = MACROS): string {
  return Object.entries(macros).map(([name, body]) => `\\${command}{${name}}${body.includes("#1") ? "[1]" : ""}{${body}}`).join("\n");
}

