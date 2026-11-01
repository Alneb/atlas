import { test, expect } from "@playwright/test";
import { tagAt, tagMayFollow } from "../src/lib/tag-syntax";

// What a #tag is in the editor and the reading view (lib/tag-syntax.ts): the core's rule, its tags.rs cases. Pure.
const tags = (line: string) => {
  const out: string[] = [];
  for (let i = 0; i < line.length; i++) {
    if (line[i] !== "#" || !tagMayFollow(i ? line[i - 1] : undefined, line[i - 2])) continue;
    const t = tagAt(line.slice(i + 1));
    if (t) { out.push(t); i += t.length; }
  }
  return out;
};

test("tags as the core counts them: nested, after ( [ , ;, not numbers, not mid-word", () => {
  expect(tags("See #idea and (#physics/qmc), issue #42, a#b and C# neither")).toEqual(["idea", "physics/qmc"]);
  expect(tags("#1a [#todo] x,#later;#y1984 #1984 #2/3 #a//b")).toEqual(["1a", "todo", "later", "y1984"]);
  expect(tags("#é_tag-2 #日本")).toEqual(["é_tag-2", "日本"]);
  expect(tags("[[#Heading]] [up](#anchor) [#ok] (#ok2)"), "a link's target is not a tag").toEqual(["ok", "ok2"]);
});
