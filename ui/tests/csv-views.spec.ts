import { test, expect } from "@playwright/test";
import { describeView, readViews, writeViews } from "../src/lib/csv/views";

// A table's saved views in its companion note (lib/csv/views.ts): one ```table-views``` block, a JSON view a line,
// the owner's text around it untouched. Pure.
const note = "---\ntitle: prices\n---\n\nMy notes about the prices.\n";

test("views are added at the end, read back, replaced and removed, the owner's text kept", () => {
  const a = { name: "Cheap", filters: { price: "<5", empty: " " }, sort: { col: "price", dir: 1 as const } };
  const once = writeViews(note, [a]);
  expect(once.startsWith(note.trimEnd())).toBe(true);
  expect(once.endsWith("```table-views\n" + '{"name":"Cheap","filters":{"price":"<5"},"sort":{"col":"price","dir":1}}' + "\n```\n")).toBe(true);
  expect(readViews(once)).toEqual([{ name: "Cheap", filters: { price: "<5" }, sort: { col: "price", dir: 1 } }]);

  // the owner wrote below the block: it stays where it is
  const below = once + "\nMore words.\n";
  const twice = writeViews(below, [a, { name: "No notes", hidden: ["notes"], quick: "apple" }]);
  expect(twice.endsWith("```\n\nMore words.\n")).toBe(true);
  expect(readViews(twice).map((v) => v.name)).toEqual(["Cheap", "No notes"]);
  expect(readViews(twice)[1]).toEqual({ name: "No notes", quick: "apple", hidden: ["notes"] });

  // none left: the block goes, the rest is as it was
  expect(writeViews(twice, [])).toBe(note.trimEnd() + "\n\nMore words.\n");
  expect(writeViews(note, [])).toBe(note);
});

test("a hand-written line in the block is skipped, an empty note gets only the block", () => {
  const md = "```table-views\nnot json\n{\"name\":\"\"}\n{\"name\":\"All\"}\n```\n";
  expect(readViews(md)).toEqual([{ name: "All" }]);
  expect(writeViews("", [{ name: "All" }])).toBe("```table-views\n{\"name\":\"All\"}\n```\n");
  expect(readViews("no block here")).toEqual([]);
});

test("a view in words, as the note shows it", () => {
  expect(describeView({ name: "a", quick: "apple", filters: { price: "<5" }, sort: { col: "price", dir: -1 }, group: "shop", hidden: ["notes", "id"] }))
    .toBe("“apple” anywhere · price <5 · sorted by price ▼ · grouped by shop · notes, id hidden");
  expect(readViews(writeViews("", [{ name: "g", group: "shop" }]))).toEqual([{ name: "g", group: "shop" }]);
  expect(describeView({ name: "all" })).toBe("every row, the file's order");
});
