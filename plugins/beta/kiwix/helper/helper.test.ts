// Kiwix in the vault's search, through the SDK's harness: kiwix-serve's catalog and suggestions (cut down).
import { test } from "node:test";
import assert from "node:assert/strict";
import { harness } from "atlas-helper/testing";
import { booksOf, chosen } from "./helper";

const SERVER = "https://wiki.example.org/kiwix";
const CATALOG = `<feed>
  <entry><title>Wikipedia</title><name>wikipedia_en_all</name>
    <link rel="http://opds-spec.org/acquisition/open-access" type="application/x-zim" href="https://dl.example.org/w.zim"/>
    <link type="text/html" href="/kiwix/content/wikipedia_en_all_maxi_2024-01"/></entry>
  <entry><title>Wiktionary &amp; more</title><name>wiktionary_en_all</name>
    <link type="text/html" href="/kiwix/content/wiktionary_en_all_2024-02"/></entry>
</feed>`;

test("the catalog's books by their content links, under the server's own root", () => {
  const books = booksOf(CATALOG, SERVER);
  assert.deepEqual(books.map((b) => b.id), ["wikipedia_en_all_maxi_2024-01", "wiktionary_en_all_2024-02"]);
  assert.equal(books[1].title, "Wiktionary & more");
  assert.deepEqual(chosen(books, "wiktionary").map((b) => b.name), ["wiktionary_en_all"]);
  assert.equal(chosen(books, "nothing-like-it").length, 2, "a setting naming none: every book");
});

test("search answers the titles as hits that open the article; nothing without a server or words", async () => {
  harness.web = (url) => {
    if (url.includes("/catalog/")) return CATALOG;
    if (url.includes("/suggest") && url.includes("wikipedia")) return JSON.stringify([
      { kind: "path", value: "Hubbard model", path: "A/Hubbard_model" },
      { kind: "pattern", value: "containing 'hubbard'…" },
    ]);
    return "[]";
  };
  const hits = await harness.call("search", { q: "hubbard", limit: 5, settings: { server: SERVER + "/", books: "wikipedia" } });
  assert.deepEqual(hits, { hits: [{ title: "Hubbard model", detail: "Wikipedia", url: `${SERVER}/content/wikipedia_en_all_maxi_2024-01/A/Hubbard_model` }] });
  assert.deepEqual(await harness.call("search", { q: "hubbard", settings: {} }), { hits: [] });
  assert.deepEqual(await harness.call("search", { q: "h", settings: { server: SERVER } }), { hits: [] });
});
