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

test("a closing `#` run needs a blank before it, and the frontmatter's `# comments` are not headings", async () => {
  const { noteHeadings } = await import("../src/lib/note-anchor");
  const md = ["---", "# a YAML comment", "tags: [x]", "---", "# C#", "## Done ##", "### F# notes"];
  expect(noteHeadings(md).map((h) => [h.i, h.text])).toEqual([[4, "C#"], [5, "Done"], [6, "F# notes"]]);
  expect(noteHeadings(["# only"]).map((h) => h.i)).toEqual([0]);
  expect(noteHeadings(["---", "# unclosed"]).map((h) => h.text)).toEqual(["unclosed"]);
});

test("a CRLF note's frontmatter closes as the core reads it", async () => {
  const { frontmatterOf } = await import("../src/lib/property-model");
  const { noteHeadings } = await import("../src/lib/note-anchor");
  const crlf = "---\r\n# comment\r\ntags: [x]\r\n---\r\n# Title\r\n";
  expect(frontmatterOf(crlf)?.data).toEqual({ tags: ["x"] });
  expect(noteHeadings(crlf.split("\n")).map((h) => [h.i, h.text])).toEqual([[4, "Title"]]);
});

test("the editor reads the frontmatter's fences as the core", async () => {
  const { Text } = await import("@codemirror/state");
  const { frontmatterClose, bodyStart } = await import("../src/lib/editor/live/live-preview.js");
  const at = (s: string) => frontmatterClose(Text.of(s.split("\n")));
  expect(at("---\na: 1\n---\nbody")).toBe(3);
  expect(at("---\na: 1\n...  \nbody")).toBe(3);
  expect(at("---\n---\n")).toBe(2);
  expect(at(" ---\na: 1\n---")).toBe(0); // an indented first line opens nothing
  expect(at("---\na: 1\n  ---\nb")).toBe(0); // nor closes
  expect(bodyStart(Text.of(["---", "a: 1", "---", "body"]))).toBe(13);
});

test("a block id inside a code fence is an example, not a place", () => {
  const md = ["```", "x ^ex", "```", "real ^ex", "| a |", "^tab"].join("\n");
  expect(anchorLine(md, "^ex")).toBe(4);
  expect(anchorLine(md, "^tab")).toBe(6);
});

test("a block embed shows the block its id marks, without the id", () => {
  const md = ["# T", "first line", "second line ^para", "", "- a", "- b ^item", "- c", "", "| x |", "| - |", "| 1 |", "^tab", "", "- p", "- q", "^list"].join("\n");
  expect(sectionOf(md, "^para")).toBe("first line\nsecond line");
  expect(sectionOf(md, "^item")).toBe("- b");
  expect(sectionOf(md, "^tab")).toBe("| x |\n| - |\n| 1 |");
  expect(sectionOf(md, "^list")).toBe("- p\n- q");
  expect(sectionOf(md, "^none")).toBe(md);
});
