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
  expect(e.byTex.get("a = b \\label{eq-first}")).toBe("1");
  expect(e.byTex.get(texKey("$$\n> e = f\n> $$ ^eq-inside"))).toBe("2"); // the editor's source in a callout, the reader's TeX alike
  expect(e.byTex.get("\\begin{align} k &= l \\end{align}")).toBe("3"); // unlabelled, but a numbered environment
  expect(e.byTex.has("c = d")).toBe(false);
  expect(e.spanOf.get("eq-first")).toEqual([2, 4]);
});

test("adding an equation above renumbers the ones below", () => {
  const more = NOTE.replace("Intro $x$.", () => "Intro $x$.\n$$ z \\label{eq-new} $$");
  expect(noteEquations(more).byId.get("eq-last")).toBe("5");
});

test("KaTeX gets the TeX without labels, a numbered environment as its twin, and the number as a tag", () => {
  expect(numberedTex("$$\na \\label{x}\n$$", "3")).toBe("$$\na \n\\tag{3}$$");
  expect(numberedTex("\\begin{align} k &= l \\end{align}", "3")).toBe("\\begin{aligned} k &= l \\end{aligned}\\tag{3}");
  expect(numberedTex("g \\label{x}")).toBe("g ");
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
