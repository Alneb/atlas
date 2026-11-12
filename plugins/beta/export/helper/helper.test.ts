// The translation on a fake vault, and each road's pandoc / latexmk / Typst calls through the SDK's harness (no
// program runs; a real export is the e2e spec's).
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { harness } from "atlas-helper/testing";
import { translate, relative, mathPortable } from "./translate";
import { macroDefinitions } from "../../../../ui/src/lib/tex-portable";
import { latexErrors, yamlEntry, equationMarks } from "./helper";

const REPORT = `---
author: Alice
---
# A report

Citing [[hubbard1963]], linking [[Mott|the Mott note]], ==key==. %%hidden%%

## Model

![[plot.png|600]]

*Figure 1. The spectral function.*

> [!note] Remember
> the half-filled case. ^blk1

| Paper | Year |
| --- | --- |
| [[hubbard1963\\|Hubbard]] | 1963 |

\`[[not a link]]\`

\`\`\`python
x = "[[kept]]"
\`\`\`

\`\`\`view
type: task-list
\`\`\`

\`\`\`typst
$ x^2 $
\`\`\`

![[Mott#Gap]]
`;

const VAULT: Record<string, string> = {
  "notes/Report.md": REPORT,
  "notes/Mott.md": "# Mott\n\n## Gap\nThe gap opens.\n\n## Other\nnot this\n",
  "figs/plot.png": "png",
  "figs/plot.pdf": "%PDF",
  "refs/refs.bib": "@article{hubbard1963,\n title={Electron correlations}\n}\n",
  "notes/Fig.md": "# Fig\n\n```tikz\n\\begin{tikzpicture}\\draw (0,0) -- (1,1);\\end{tikzpicture}\n```\n",
};
const vault = { files: Object.keys(VAULT), read: async (p: string) => VAULT[p] };

test("the note's title block, a paper link a citation, a note link its text", async () => {
  const t = await translate(vault, "notes/Report.md", "exports/notes", new Set(["hubbard1963"]));
  assert.deepEqual(t.meta, { author: "Alice", title: "A report" });
  assert.ok(!t.markdown.includes("# A report"));
  assert.ok(t.markdown.includes("Citing [@hubbard1963], linking the Mott note, ==key==."), t.markdown);
  assert.ok(t.markdown.includes("| [@hubbard1963] | 1963 |"), "a table's escaped alias bar");
  assert.deepEqual(t.cited, ["hubbard1963"]);
});

test("a figure with its caption, its vector twin and its width", async () => {
  const t = await translate(vault, "notes/Report.md", "exports/notes", new Set());
  assert.ok(t.markdown.includes("![The spectral function.](<../../figs/plot.pdf>){width=86%}"), t.markdown);
});

test("what has no print goes, code stays, pictures wait for their road", async () => {
  const t = await translate(vault, "notes/Report.md", "exports/notes", new Set());
  for (const gone of ["hidden", "^blk1", "type: task-list", "[!note]", "not this", "$ x^2 $"]) assert.ok(!t.markdown.includes(gone), gone);
  for (const kept of ["`[[not a link]]`", 'x = "[[kept]]"', "The gap opens.", "**Remember**", "<!--fence:0-->"]) assert.ok(t.markdown.includes(kept), kept);
  assert.deepEqual(t.fences, [{ lang: "typst", source: "$ x^2 $" }]);
});

test("paths as the output folder names them", () => {
  assert.equal(relative("exports/notes", "figs/plot.pdf"), "../../figs/plot.pdf");
  assert.equal(relative("", "figs/plot.pdf"), "figs/plot.pdf");
  assert.equal(relative("a/b", "a/b/c.png"), "c.png");
});

test("LaTeX's errors with the lines after them", () => {
  assert.equal(latexErrors("ok\n! Undefined control sequence.\nl.12 \\foo\n\nmore\nend"), "! Undefined control sequence.\nl.12 \\foo\n");
});

// --- the roads, the programs faked ---

let written: Record<string, string>;
let typst: { path: string; to: string; source?: string }[];
beforeEach(() => {
  harness.reset();
  written = {};
  typst = [];
  harness.api = (verb, path, body) => {
    if (path.startsWith("/api/files")) return Object.keys(VAULT);
    if (path.startsWith("/api/file") && verb === "GET") return { text: VAULT[decodeURIComponent(/[?&]path=([^&]*)/.exec(path)?.[1] ?? "")] ?? "" };
    if (path.startsWith("/api/file") && verb === "PUT") { written[body.path] = body.text; return { mtime: 1 }; }
    throw new Error(`unexpected ${verb} ${path}`);
  };
  harness.native = (op, a) => {
    if (op === "hash.sha256") return "ab".repeat(32);
    if (op === "convert.typst") { typst.push(a); return a.to; }
    throw new Error(op);
  };
  harness.exec = (program, args, opts) => ({ status: 0, stdout: program === "pandoc" ? `${args[3]}:${opts.stdin?.length}` : "", stderr: "" });
});

test("PDF (Typst): pandoc writes Typst with the page and the bibliography, the core compiles it", async () => {
  const r = await harness.call("export", { path: "notes/Report.md", format: "pdf-typst", options: { paper: "letter", columns: 2, toc: true, numbered: true, style: "physics" } });
  assert.deepEqual(r.written, ["exports/notes/Report.pdf"]);
  const pandoc = harness.ran.find((x) => x.program === "pandoc")!;
  assert.deepEqual(pandoc.args.slice(0, 5), ["-f", "markdown+mark-implicit_figures+implicit_figures", "-t", "typst", "-s"]);
  const input = pandoc.stdin!;
  for (const line of ['papersize: "us-letter"', "columns: 2", "toc: true", 'section-numbering: "1.1"', 'bibliography: "../../refs/refs.bib"', 'bibliographystyle: "american-physics-society"', 'title: "A report"'])
    assert.ok(input.includes(line), line);
  assert.ok(input.includes("```{=typst}\n$ x^2 $\n```"), "the typst picture goes in raw");
  assert.deepEqual(typst.map((x) => [x.path, x.to]), [["exports/notes/Report.typ", "exports/notes/Report.pdf"]]);
});

test("PDF (LaTeX): the .tex written beside, latexmk's own files in the cache, a typst picture drawn as a PDF", async () => {
  const r = await harness.call("export", { path: "notes/Report.md", to: "pdf", settings: { format: "pdf-latex", engine: "xelatex" } });
  assert.deepEqual(r.written, ["exports/notes/Report.tex", "exports/notes/Report.pdf"]);
  const [pandoc, latexmk] = harness.ran;
  assert.ok(pandoc.args.includes("--biblatex") && pandoc.args.includes(".atlas/plugins/export/tikz.lua"));
  assert.ok(pandoc.stdin!.includes('biblio-style: "numeric-comp"') && pandoc.stdin!.includes("](<../../.atlas/cache/plugins/export/figures/abababababababab.pdf>)"));
  assert.equal(latexmk.program, "latexmk");
  assert.equal(latexmk.cwd, "exports/notes");
  assert.ok(latexmk.args.includes("-xelatex") && latexmk.args.includes("-auxdir=../../.atlas/cache/plugins/export/build/notes_Report.md"));
  assert.deepEqual(typst[0], { path: "notes/.fence.typ", to: ".atlas/cache/plugins/export/figures/abababababababab.pdf", source: "$ x^2 $", fence: true });
});

test("the LaTeX layouts: chapter makes a KOMA report of numbered chapters with contents, two columns kept", async () => {
  await harness.call("export", { path: "notes/Report.md", to: "tex", settings: { format: "pdf-latex", layout: "chapter", columns: 2 } });
  const [pandoc] = harness.ran;
  assert.ok(pandoc.args.includes("--top-level-division=chapter"));
  for (const line of ['documentclass: "scrreprt"', "numbersections: true", "toc: true", 'classoption: ["parskip=half","open=any","twocolumn"]', "\\usepackage{microtype}"])
    assert.ok(pandoc.stdin!.includes(line), line);
  harness.ran.length = 0;
  await harness.call("export", { path: "notes/Report.md", to: "tex", settings: { format: "pdf-latex" } });
  assert.ok(!harness.ran[0].stdin!.includes("documentclass") && !harness.ran[0].args.includes("--top-level-division=chapter"), "plain stays pandoc's article");
});

test("a preview goes to the cache; Word cites through citeproc and says the Typst picture stays code", async () => {
  const p = await harness.call("export", { path: "notes/Report.md", format: "pdf-typst", preview: true });
  assert.equal(p.pdf, ".atlas/cache/plugins/export/preview/notes/Report.pdf");
  harness.reset();
  const w = await harness.call("export", { path: "notes/Report.md", format: "docx" });
  assert.deepEqual(w.written, ["exports/notes/Report.docx"]);
  const pandoc = harness.ran[0];
  assert.ok(pandoc.args.includes("--citeproc") && pandoc.args.includes("--resource-path=exports/notes") && pandoc.stdin!.includes('bibliography: "refs/refs.bib"'));
  assert.ok(w.warnings.some((x: string) => /typst picture is left as code/.test(x)));
});

test("the formats say what they need", async () => {
  harness.exec = (program) => { if (program === "latexmk") throw new Error("latexmk is not installed"); return { status: 0, stdout: "pandoc 3.7", stderr: "" }; };
  const f = await harness.call("formats");
  assert.deepEqual(f.filter((x: any) => !x.ok).map((x: any) => [x.id, x.needs]), [["pdf-latex", "latexmk (a TeX distribution)"]]);
});

test("a tikz picture: its source and key for the dialog; the PNG the dialog drew on the Typst and Word roads", async () => {
  const d = await harness.call("describe", { path: "notes/Fig.md" });
  assert.deepEqual(d.tikz.map((t: any) => [t.key, t.png]), [["abababababababab", ".atlas/cache/plugins/export/figures/abababababababab.png"]]);
  assert.ok(d.tikz[0].source.includes("\\draw (0,0)"));
  const drawn = await harness.call("export", { path: "notes/Fig.md", format: "typ", figures: { abababababababab: 72.5 } });
  assert.ok(harness.ran[0].stdin!.includes("](<../../.atlas/cache/plugins/export/figures/abababababababab.png>){width=72.5pt}"), String(harness.ran[0].stdin));
  assert.ok(!drawn.warnings.length, drawn.warnings.join());
  harness.reset();
  const left = await harness.call("export", { path: "notes/Fig.md", format: "docx" }); // the dialog drew nothing
  assert.ok(harness.ran[0].stdin!.includes("```tikz"));
  assert.ok(left.warnings.some((x: string) => /tikz picture is left as code/.test(x)));
});

test("a header of several lines goes as a block scalar (pandoc reads a quoted one as inline: \\usepackage became \\texttt)", () => {
  const y = yamlEntry("header-includes", ["```{=latex}\n\\usepackage{soul}\n```"]);
  assert.equal(y, "header-includes:\n- |\n    ```{=latex}\n    \\usepackage{soul}\n    ```");
  assert.equal(yamlEntry("title", "One line"), 'title: "One line"');
});

test("formulas: Atlas's macros kept and defined per road, a $$align block an aligned, a heading after a line its own", async () => {
  assert.equal(mathPortable("a $\\ket{\\psi}$ b"), "a $\\ket{\\psi}$ b"); // LaTeX keeps it; the road defines it
  assert.equal(mathPortable("x\n$$\n\\braket{a|b} \\cdot \n$$\ny"), "x\n$$\n\\braket{a|b} \\cdot\n$$\ny");
  assert.equal(mathPortable("$$align\na = b\nc \\leq d\n$$"), "$$\n\\begin{aligned}\na &= b \\\\\nc &\\leq d\n\\end{aligned}\n$$");
  assert.equal(mathPortable("$$\\begin{align}x &= 1\\end{align}$$"), "$$\n\\begin{aligned}x &= 1\\end{aligned}\n$$");
  assert.match(macroDefinitions("providecommand"), /^\\providecommand\{\\ket\}\[1\]\{\\left\| #1\\right\\rangle\}$/m);
  assert.match(macroDefinitions("newcommand"), /^\\newcommand\{\\Tr\}\{\\operatorname\{Tr\}\}$/m);
  const files: Record<string, string> = { "n.md": "Intro line\n## Next\ntext\n" };
  const t = await translate({ files: Object.keys(files), read: async (p) => files[p] }, "n.md", "", new Set());
  assert.match(t.markdown, /Intro line\n\n## Next/);
});

test("equations are numbered over the whole document, an embedded note's continuing the host's; links read the number", async () => {
  const files: Record<string, string> = {
    "notes/Host.md": "# Host\n\nFirst\n$$ a = b \\label{eq-a} $$\nthen ![[Deriv]]\nand [[#^eq-a]], [[Deriv#^eq-d]], [[Far#^eq-f]].\n\n$$ c $$\n",
    "notes/Deriv.md": "$$\n\\begin{align} x &= y \\end{align}\n$$ ^eq-d\n$$ z \\tag{D2} \\label{eq-z} $$\n",
    "notes/Far.md": "$$ u \\label{eq-g} $$\n$$ v \\label{eq-f} $$\n",
  };
  const t = await translate({ files: Object.keys(files), read: async (p: string) => files[p] }, "notes/Host.md", "exports", new Set());
  const md = t.markdown.replace(/\s+/g, " ").replace(/\u0005/g, "@").replace(/\u0006([^\u0006]*)\u0006/g, "<$1>");
  assert.ok(md.includes("a = b\\tag{1}@"), md); // @: the display links go to
  assert.ok(md.includes("\\end{aligned}\\tag{2}@"), md); // the embedded note continues: (2)
  assert.ok(md.includes("z \\tag{D2}@") && !md.includes("\\label"), md);
  assert.ok(md.includes("and <1>, <2>, Far (2)."), md); // a note not in the document: its own numbers, as text
  assert.ok(md.includes("$$ c $$"), "a plain display stays unnumbered");

  // each road: LaTeX labels and \eqref, Typst the number beside the formula, a label and a link to it, Word the text
  const roads = (r: "latex" | "typst" | "docx") => equationMarks(t.markdown, r).replace(/\s+/g, " ");
  const latex = roads("latex"), typst = roads("typst"), word = roads("docx");
  assert.ok(latex.includes("a = b\\tag{1}\\label{eq-1} $$") && latex.includes("\\tag{D2}\\label{eq-D2}"), latex);
  assert.ok(latex.includes("and `\\eqref{eq-1}`{=latex}, `\\eqref{eq-2}`{=latex}, Far (2)."), latex);
  assert.ok(typst.includes("a = b\\qquad\\text{(1)} $$`<eq-1>`{=typst}"), typst);
  assert.ok(typst.includes("and `#link(<eq-1>)[(1)]`{=typst}, `#link(<eq-2>)[(2)]`{=typst}, Far (2)."), typst);
  assert.ok(word.includes("a = b\\qquad\\text{(1)} $$ then") && word.includes("and (1), (2), Far (2).") && !/[\u0005\u0006]/.test(word), word);
});

test("an equation number is linked once, at its first display; a starred tag reads without brackets", () => {
  const md = "$$ a \\tag*{A}\u0005\n$$\n\n$$ b \\tag{A}\n$$\n\nsee \u0006A\u0006";
  const typst = equationMarks(md, "typst");
  assert.equal((typst.match(/<eq-A>`/g) ?? []).length, 1, typst);
  assert.ok(typst.includes("a \\qquad\\text{A}") && typst.includes("b \\qquad\\text{(A)}"), typst);
  assert.equal((equationMarks(md, "latex").match(/\\label/g) ?? []).length, 1);
});

test("a link to a figure reads Figure n, and the figure's block id is gone", async () => {
  const files: Record<string, string> = {
    "notes/Host.md": "# Host\n\n![[a.png|First]] ^fig-a\n\n![[b.png|Second]] ^fig-b\n\nSee [[#^fig-b]] and [[Far#^fig-x]].\n",
    "notes/Far.md": "![[x.png]] ^fig-x\n",
  };
  const t = await translate({ files: Object.keys(files), read: async (p: string) => files[p] }, "notes/Host.md", "exports", new Set());
  const md = t.markdown.replace(/\s+/g, " ");
  assert.ok(md.includes("See Figure 2 and Far, Figure 1."), md);
  assert.ok(!md.includes("^fig-"), md);
});
