// Open Library's answers (cut down, in their real shapes) as the catalog sees them.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { harness } from "atlas-helper/testing";
import "./helper";
import { withCoauthors, yearOf } from "./helper";

test("a co-author Open Library keeps only on the edition is an author too", () => {
  // Ashcroft & Mermin, ISBN 9780030839931: the work links Ashcroft alone
  const ed = { contributors: [{ name: "N. David Mermin", role: "Co-Author" }], by_statement: "[by] Neil W. Ashcroft [and] N. David Mermin." };
  assert.deepEqual(withCoauthors(["Neil W. Ashcroft"], ed), ["Neil W. Ashcroft", "N. David Mermin"]);
  assert.deepEqual(withCoauthors(["Neil W. Ashcroft"], { by_statement: "[by] Neil W. Ashcroft [and] N. David Mermin." }), ["Neil W. Ashcroft", "N. David Mermin"]);
  assert.deepEqual(withCoauthors(["Frank Herbert"], { by_statement: "edited by Brian Herbert", contributors: [{ name: "John Schoenherr", role: "Illustrator" }] }), ["Frank Herbert"]);
});

const OL = "https://openlibrary.org";
const WORK = { title: "Dune", first_publish_date: "1965", authors: [{ author: { key: "/authors/OL79034A" } }],
  description: { type: "/type/text", value: "Set on the desert planet Arrakis…" },
  subjects: ["Science fiction", "Accessible book", "nyt:mass-market-paperback=2021-11-07", "Fiction, science fiction, general", "Arrakis (Imaginary place)"] };
const answers = (work: object = WORK): Record<string, object> => ({
  [`${OL}/isbn/9780441172719.json`]: { title: "Dune", publishers: ["Ace"], publish_date: "Aug 01, 1990", number_of_pages: 535,
    works: [{ key: "/works/OL893415W" }], covers: [12345], isbn_13: ["9780441172719"] },
  [`${OL}/works/OL893415W.json`]: work,
  [`${OL}/authors/OL79034A.json`]: { name: "Frank Herbert" },
});

beforeEach(() => {
  harness.reset();
  const a = answers();
  harness.web = (url) => a[url] ?? null;
});

test("an ISBN gives the work, its author and the edition's details", async () => {
  const r = await harness.call("lookup", { kind: "book", ids: { isbn: "9780441172719" } });
  const f = r.fields;
  assert.deepEqual([f.title, f.author, f.year, f.pages, f.publisher], ["Dune", "Frank Herbert", 1965, 535, "Ace"]);
  assert.deepEqual(f.genres, ["Science Fiction", "Arrakis (Imaginary Place)"], "Open Library's bookkeeping subjects left out");
  assert.deepEqual([f.description, f.cover], ["Set on the desert planet Arrakis…", "https://covers.openlibrary.org/b/id/12345-L.jpg"]);
  assert.deepEqual(r.ids, { openlibrary: "OL893415W" });
});

test("a work id alone, and a Goodreads link that waits for its page", async () => {
  const f = (await harness.call("lookup", { kind: "book", ids: { openlibrary: "OL893415W" } })).fields;
  assert.deepEqual([f.title, f.year], ["Dune", 1965]);
  assert.deepEqual(await harness.call("lookup", { kind: "book", ids: { goodreads: "234225" } }), { later: true });
  assert.ok((await harness.call("lookup", { kind: "book", ids: { isbn: "9780000000000" } })).skipped);
  assert.equal(yearOf("Jun 01, 1990"), 1990);
});

test("a book is a book: reference or not is the vault's (Catalog · Science), never guessed from subjects", async () => {
  const a = answers({ ...WORK, title: "Modern Quantum Mechanics", subjects: ["Quantum theory", "Textbooks"] });
  harness.web = (url) => a[url] ?? null;
  assert.equal("kind" in (await harness.call("lookup", { kind: "book", ids: { isbn: "9780441172719" } })), false);
});
