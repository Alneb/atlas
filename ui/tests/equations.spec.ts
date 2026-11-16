import { test, expect } from "@playwright/test";
import { equationSection, equationTarget, figureCaption, linkText, noteEquations, numberedTex, refOf, texKey } from "../src/lib/equations";

// Numbered equations (lib/equations.ts): labelled displays and numbered environments are numbered in note order;
// links read "(n)" in their note, "Note (n)" from another.
const NOTE = [
  "Intro $x$.",
  "$$",
  "a = b \\label{eq-first}",
  "$$",
  "",
  "$$ c = d $$",
  "",
  "> [!derivation]-",
  "> $$",
  "> e = f",
  "> $$ ^eq-inside",
  "",
  "$$ g \\tag{D1} \\label{eq-own} $$",
  "",
  "```md",
  "$$ h \\label{eq-example} $$",
  "```",
  "$$ i \\notag \\label{eq-none} $$",
  "",
  "$$",
  "\\begin{align} k &= l \\end{align}",
  "$$",
  "$$ j $$ ^eq-last",
].join("\n");

test("labelled displays and numbered environments are numbered in order; plain $$, fences and \\notag are not", () => {
  const e = noteEquations(NOTE);
  expect([...e.byId]).toEqual([["eq-first", "1"], ["eq-inside", "2"], ["eq-own", "D1"], ["eq-last", "4"]]);
  expect(e.byTex.get("a = b \\label{eq-first}")).toEqual(["1"]);
  expect(e.byTex.get(texKey("$$\n> e = f\n> $$ ^eq-inside"))).toEqual(["2"]); // the editor's source in a callout, the reader's TeX alike
  expect(e.byTex.get("\\begin{align} k &= l \\end{align}")).toEqual(["3"]); // unlabelled, but a numbered environment
  expect(e.byTex.has("c = d")).toBe(false);
  expect(e.spanOf.get("eq-first")).toEqual([2, 4]);
});

test("adding an equation above renumbers the ones below", () => {
  const more = NOTE.replace("Intro $x$.", () => "Intro $x$.\n$$ z \\label{eq-new} $$");
  expect(noteEquations(more).byId.get("eq-last")).toBe("5");
});

test("KaTeX gets the TeX without labels, a numbered environment as its twin, and the number as a tag", () => {
  expect(numberedTex("$$\na \\label{x}\n$$", ["3"])).toBe("$$\na \n\\tag{3}$$");
  expect(numberedTex("\\begin{equation} k = l \\end{equation}", ["3"])).toBe(" k = l\\tag{3}");
  expect(numberedTex("\\begin{align} k &= l \\end{align}", ["3"])).toBe("\\begin{align} k &= l \\tag{3}\\end{align}");
  expect(numberedTex("g \\label{x}")).toBe("g ");
});

// LaTeX numbers each row of align/gather/eqnarray: a row's \label names it, \notag skips it, a nested environment's
// rows are not the display's, a trailing \\ makes no row.
const ROWS = [
  "$$",
  "\\begin{align}",
  "a &= b \\label{eq-a} \\\\",
  "c &= \\begin{cases} 1 \\\\ 2 \\end{cases} \\notag \\\\",
  "e &= f \\tag{T} \\\\",
  "g &= h \\label{eq-g} \\\\",
  "\\end{align}",
  "$$ ^eq-rows",
  "$$ z \\label{eq-after} $$",
].join("\n");

test("each row of an align is numbered: its own label, \\notag, \\tag and a nested environment", () => {
  const e = noteEquations(ROWS);
  expect([...e.byId]).toEqual([["eq-a", "1"], ["eq-g", "2"], ["eq-rows", "2"], ["eq-after", "3"]]);
  expect(e.spanOf.get("eq-g")).toEqual([1, 8]);
  const display = ROWS.split("\n").slice(0, 8).join("\n");
  const nums = e.byTex.get(texKey(display));
  expect(nums).toEqual(["1", null, "T", "2"]);
  const tex = numberedTex(texKey(display), nums);
  expect(tex.match(/\\tag\{[^}]*\}/g)).toEqual(["\\tag{1}", "\\tag{T}", "\\tag{2}"]);
  expect(tex).not.toContain("label");
  expect(numberedTex("\\begin{eqnarray} a &=& b \\\\ c &=& d \\end{eqnarray}", ["4", "5"])).toBe("\\begin{align} a &=& b \\tag{4}\\\\ c &=& d \\tag{5}\\end{align}");
  expect(noteEquations("$$\\begin{align*} a \\\\ b \\end{align*}$$").byTex.size).toBe(0);
});

test("a link names an equation by `note#^label`; from another note it reads with the note's name", () => {
  expect(equationTarget("Thomas–Fermi screening#^eq-tf")).toEqual(["Thomas–Fermi screening", "eq-tf"]);
  expect(equationTarget("#^eq-tf")).toEqual(["", "eq-tf"]);
  expect(equationTarget("note#Heading")).toBeNull();
  expect([linkText("", "(3)"), linkText("notes/Screening", "(3)")]).toEqual(["(3)", "Screening (3)"]);
});

test("`![[note#^label]]` embeds that one display, with its number written in", async () => {
  const { sectionOf, anchorLine } = await import("../src/lib/note-anchor");
  expect(sectionOf(NOTE, "^eq-first")).toBe("$$\na = b \n\\tag{1}$$");
  expect(sectionOf(NOTE, "^eq-inside")).toBe("$$\ne = f\n\\tag{2}$$"); // out of its callout
  expect(anchorLine(NOTE, "^eq-first")).toBe(2); // a link opens the note at the display
});

test("an embed line ending in a block id is a figure, numbered in note order; links read Figure n", () => {
  const md = [
    "![[gap.png|The gap closes|600]] ^fig-gap",
    "Some text ^para",
    "```md",
    "![[example.png]] ^fig-example",
    "```",
    "$$ a \\label{eq-a} $$",
    "> ![Spectral function](a.svg) ^fig-spec",
    "![[plain.png]]",
  ].join("\n");
  const e = noteEquations(md);
  expect([...e.figures]).toEqual([["fig-gap", "1"], ["fig-spec", "2"]]);
  expect(e.spanOf.get("fig-spec")).toEqual([7, 7]);
  expect([refOf(e, "fig-spec"), refOf(e, "eq-a"), refOf(e, "para")]).toEqual(["Figure 2", "(1)", undefined]);
  expect([linkText("", "Figure 2"), linkText("notes/Screening", "Figure 2")]).toEqual(["Figure 2", "Screening, Figure 2"]);
  expect([figureCaption("![[gap.png|The gap closes|600]]"), figureCaption("![[gap.png|center]]"), figureCaption("![Spectral function](a.svg)")])
    .toEqual(["The gap closes", "", "Spectral function"]);
  expect(equationSection(md, "fig-spec")).toBe('![Spectral function](a.svg)\n\n<p class="figure-caption"><b>Figure 2.</b> Spectral function</p>');
});
