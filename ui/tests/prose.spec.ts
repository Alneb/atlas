import { test, expect } from "@playwright/test";
import { frontMatterEnd, guessLanguage, plainProse, proseRanges, wordsOf } from "../src/lib/editor/prose";
import { addWord, parseWords } from "../../plugins/beta/spelling/ui/src/words";
import { editCost, edits1, LETTERS, suggestions, swaps } from "../src/lib/editor/spell-rank";

// Prose in a note (lib/editor/prose.ts), shared by the Spelling and Predictor plugins: what is prose, its words, its
// language; and the Spelling plugin's words note.

test("words: accents and inner apostrophes kept; ids, tags, paths and file names left out", () => {
  expect(wordsOf("Don't stop — corazón, well-known x2 #tag @alice a/b file.md e.g.").map((w) => w.word))
    .toEqual(["Don't", "stop", "corazón", "well-known", "file", "e"]);
  expect(wordsOf("ab cd", 10)[1]).toEqual({ word: "cd", from: 13, to: 15 });
});

test("prose ranges: the nodes that are not prose and the front matter are holes", () => {
  const nodes = [{ name: "Paragraph", from: 0, to: 30 }, { name: "InlineMath", from: 5, to: 10 }, { name: "Wikilink", from: 20, to: 25 }];
  const iterate = (spec: { from: number; to: number; enter(n: { name: string; from: number; to: number }): boolean | void }) => {
    for (const n of nodes) if (n.to > spec.from && n.from < spec.to) spec.enter(n);
  };
  expect(proseRanges(iterate, 0, 30)).toEqual([[0, 5], [10, 20], [25, 30]]);
  expect(proseRanges(iterate, 0, 30, 3)).toEqual([[3, 5], [10, 20], [25, 30]]);
  expect(frontMatterEnd("---\na: 1\n---\nbody")).toBe(13);
  expect(frontMatterEnd("body\n---\n")).toBe(0);
});

test("plain prose for counting: math, code, links, tags and the front matter blanked, lines kept", () => {
  const t = "---\nlang: es\n---\nA $x$ b `c` [[d]] [e](http://f) #g\n```\ncode\n```\n$$\ny\n$$\nend";
  const p = plainProse(t);
  expect(p.length).toBe(t.length);
  expect(p.split("\n").length).toBe(t.split("\n").length);
  expect(wordsOf(p).map((w) => w.word)).toEqual(["A", "b", "e", "end"]);
});

test("a note's language: its lang property, else its common words, else the fallback", () => {
  const en = "The electrons in the insulator are localised, and the centers of the functions are carried by the phases of the bands.";
  const es = "Los electrones de la red se localizan en el aislante, y los centros de las funciones son llevados por las fases.";
  expect(guessLanguage(en, ["en", "es"], "en")).toBe("en");
  expect(guessLanguage(es, ["en", "es"], "en")).toBe("es");
  expect(guessLanguage(en, ["en", "es"], "en", "es-ES")).toBe("es");
  expect(guessLanguage("Short note.", ["en", "es"], "es")).toBe("es");
});

test("the vault's words note: read, and a word added sorted, a new note made when there is none", () => {
  const made = addWord("", "Wannier");
  expect(made).toContain("```words\nWannier\n```");
  const more = addWord(made, "Berry");
  expect([...parseWords(more)]).toEqual(["Berry", "Wannier"]);
  expect(more.startsWith("# This vault's words")).toBe(true);
  expect(addWord(more, "Berry")).toBe(more);
});

test("suggestions: the likeliest slip to the commonest word first; the vault's words count as common", () => {
  expect(swaps("teh")).toEqual(["eth", "the"]);
  const known = new Set(["the", "ten", "tea", "eh"]);
  const zipf: Record<string, number> = { the: 7.7, ten: 5.4, tea: 4.9, eh: 4.1, receive: 4.6, relieve: 3.8, weird: 4.7, wired: 4.2, información: 5.5, también: 6.3, cambien: 3.2 };
  const k = (dict: string[], uses: Record<string, number> = {}) => ({ correct: (w: string) => known.has(w) || w in zipf, dictionary: () => dict, uses: (w: string) => uses[w] ?? 0, zipf: (w: string) => zipf[w] ?? 0, letters: LETTERS.es });
  expect(suggestions("teh", k(["ten", "eh", "tea"]))[0]).toBe("the"); // nspell offers "ten" first
  expect(suggestions("recieve", k(["receive", "relieve"]))[0]).toBe("receive");
  expect(suggestions("wierd", k(["wired", "weird"]))[0]).toBe("weird");
  expect(suggestions("informacion", k([]))[0]).toBe("información"); // found by the frequencies alone: an accent
  expect(suggestions("tambien", k(["cambien", "también"]))[0]).toBe("también");
  expect(suggestions("Tambien", k([]))[0]).toBe("También"); // the typed capital kept
  // a word of the vault's beats a common one at the same distance
  expect(suggestions("tem", k(["ten", "tea"], { tea: 40 }))[0]).toBe("tea");
  expect(editCost("informacion", "información")).toBeLessThan(0.1);
  expect(editCost("teh", "the")).toBeLessThan(editCost("teh", "tah"));
  expect(edits1("ab", "ab")).toEqual(expect.arrayContaining(["a", "b", "ba", "aab", "bb"]));
});

test("judging a word: hyphen parts, possessives, short words, acronyms and a capital at a sentence's start", async () => {
  const { isWrong } = await import("../../plugins/beta/spelling/ui/src/judge");
  const dict = new Set(["sub", "bath", "self", "energy", "the", "plaquette"]);
  const knows = (w: string) => dict.has(w);
  expect(isWrong("sub-bath", knows)).toBe(false);
  expect(isWrong("self-energy", knows)).toBe(false);
  expect(isWrong("self-enrgy", knows)).toBe(true);
  expect(isWrong("plaquette's", knows)).toBe(false);
  expect(isWrong("The", knows)).toBe(false);
  expect(isWrong("et", knows) || isWrong("Eq", knows) || isWrong("GW", knows) || isWrong("McDonald", knows)).toBe(false);
  expect(isWrong("teh", knows)).toBe(true);
  expect(isWrong("plaquettes", knows)).toBe(false);
});
