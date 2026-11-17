import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
// @ts-expect-error a plugin's module is plain JavaScript, loaded as the page loads it
import { audiobookItem, matchTitle, normTitle } from "../../plugins/beta/books/audiobook.js";

// The Books readers' audiobook (plugins/beta/books/audiobook.js): which audiobook the book's note names, and the text's
// chapter matching the audio's by title. The cases are the native reader's too (AudioChaptersTest, android/test/run.sh).
type Cases = {
  item: { props: Record<string, string>; want: string | null }[];
  norm: [string, string][];
  match: { titles: string[]; title: string; want: number }[];
};
const cases: Cases = JSON.parse(readFileSync(new URL("./fixtures/audiobook-chapters.json", import.meta.url), "utf8"));

test("the audiobook named by the note: the catalog's id first, else the item in an audiobook link", () => {
  for (const c of cases.item) expect(audiobookItem(c.props), JSON.stringify(c.props)).toBe(c.want);
});

test("chapter titles normalised: accents, case, punctuation and a leading 'chapter' gone", () => {
  for (const [title, want] of cases.norm) expect(normTitle(title), title).toBe(want);
});

test("a chapter matched by title: the same first, else the only one starting the other at a word's end", () => {
  for (const c of cases.match) expect(matchTitle(c.titles, c.title), `${c.title} in ${c.titles.join(" | ")}`).toBe(c.want);
});
