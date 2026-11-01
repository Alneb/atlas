import { test, expect } from "@playwright/test";
import { fences } from "../src/lib/fence-walk";
import { noteHeadings } from "../src/lib/note-anchor";

// Lines and paths read as the core reads them: fenced code (lib/fence-walk.ts ↔ atlas-text fence.rs, the same cases
// as its test) and a path out of the vault (lib/paths.ts ↔ links.rs normalize). Pure.
const code = (text: string) => { const f = fences(); return text.split("\n").map((l) => f.code(l)); };

test("fences close as CommonMark says, as the core reads them", () => {
  expect(code("a\n```js\nx\n```\nb")).toEqual([false, true, true, true, false]);
  expect(code("````\n```\nx\n````\nb"), "a shorter run is text inside").toEqual([true, true, true, true, false]);
  expect(code("```\n~~~\nx\n```\nb"), "the other mark is text inside").toEqual([true, true, true, true, false]);
  expect(code("```\n```js\nx\n```\nb"), "a closing fence has nothing after it").toEqual([true, true, true, true, false]);
  expect(code("~~~\nx\n~~~~\nb"), "a longer run closes").toEqual([true, true, true, false]);
  expect(code("``` a`b\nx"), "a backtick in the info string").toEqual([false, false]);
  expect(code("    ```\nx"), "four spaces in").toEqual([false, false]);
  expect(code("  ```\nx\r\n  ```\r\nb")).toEqual([true, true, true, false]);
  expect(noteHeadings("# A\n```\n~~~\n# not\n```\n# B".split("\n")).map((h) => h.text), "a ~~~ inside ``` hides no heading").toEqual(["A", "B"]);
});

test("a path out of the vault resolves to nothing for a link, as the core's normalize", async () => {
  const { resolveRel, resolveInVault } = await import("../src/lib/paths");
  expect([resolveInVault("../x.md", ""), resolveInVault("../x.md", "a"), resolveInVault("/b/./c/../x.md")]).toEqual([null, "x.md", "b/x.md"]);
  expect(resolveRel("../x.md", ""), "the lenient form stays for a new file's place").toBe("x.md");
});
