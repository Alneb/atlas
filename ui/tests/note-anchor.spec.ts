import { test, expect } from "@playwright/test";
import { anchorLine, sectionOf } from "../src/lib/note-anchor";

// A link's `#Heading` / `#^block` found in a note the Obsidian way (lib/note-anchor.ts): links, bookmarks and note
// embeds all use it.
const NOTE = ["# Title", "", "## Methods ##", "text ^claim1", "```sh", "# not a heading", "```", "### Sub", "x", "## Results", "y"].join("\n");

test("a heading by its name, any level, without case; `A#B` names B; a block by its ^id", () => {
  expect(anchorLine(NOTE, "methods")).toBe(3);
  expect(anchorLine(NOTE, "Title#Results")).toBe(10);
  expect(anchorLine(NOTE, "^claim1")).toBe(4);
  expect(anchorLine(NOTE, "not a heading")).toBeUndefined(); // inside a code fence
  expect(anchorLine(NOTE, "^nothing")).toBeUndefined();
});

test("a section runs to the next heading of its level or above, past fences and deeper headings", () => {
  expect(sectionOf(NOTE, "Methods")).toBe(["## Methods ##", "text ^claim1", "```sh", "# not a heading", "```", "### Sub", "x"].join("\n"));
  expect(sectionOf(NOTE, "missing")).toBe(NOTE);
});

test("a PDF place link may name an annotation or one of the note's marks", async () => {
  const { placeOf } = await import("../src/lib/pdf-place");
  expect(placeOf("x.pdf#page=3&annotation=47R")).toEqual({ page: 3, annotation: "47R" });
  expect(placeOf("x.pdf#page=3&annotation=m-k2f9q1xz")).toEqual({ page: 3, annotation: "m-k2f9q1xz" });
  expect(placeOf("x.pdf#page=3&annotation=nonsense")).toEqual({ page: 3 });
});
