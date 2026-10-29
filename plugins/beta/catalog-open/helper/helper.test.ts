// The `sources` setting: a source left out is not asked, the others are.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { harness } from "atlas-helper/testing";
import "./helper";

beforeEach(() => harness.reset());

test("a source left out of the setting answers nothing and fetches nothing", async () => {
  harness.web = () => ({ title: "A video", author_name: "Someone" });
  const off = await harness.call("youtube", { kind: "video", ids: { youtube: "x".repeat(11) }, settings: { sources: ["books"] } });
  assert.deepEqual(off.fields, {});
  assert.match(off.skipped, /youtube is not in/);
  assert.deepEqual(await harness.call("wikipedia", { url: "https://en.wikipedia.org/wiki/Dune_(novel)", settings: { sources: [] } }), { candidates: [] });
  assert.equal(harness.asked.length, 0, "nothing asked of the web");
  const on = await harness.call("youtube", { kind: "video", ids: { youtube: "x".repeat(11) }, settings: { sources: [" YouTube "] } });
  assert.equal(on.fields.title, "A video", "names are matched loosely");
  const unset = await harness.call("youtube", { kind: "video", ids: { youtube: "x".repeat(11) }, settings: {} });
  assert.equal(unset.fields.title, "A video", "no setting: every source");
});
