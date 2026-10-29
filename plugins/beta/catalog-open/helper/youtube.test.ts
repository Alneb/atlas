// The manifest's link patterns and `lookup` through the SDK's harness (run in the plugin's folder).
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { harness, Reply } from "atlas-helper/testing";
import "./helper";

// [contributes.catalog] recognize, read from plugin.toml as the core reads it ((?i) → the `i` flag): every source's
// patterns, so a YouTube link matched by another source's pattern too would show
const PATTERNS = [...readFileSync("plugin.toml", "utf8").matchAll(/\{ pattern = ("(?:[^"\\]|\\.)*"), kind = "(\w+)", id = "(\w+)"/g)]
  .map(([, p, kind, id]) => [new RegExp((JSON.parse(p) as string).replace("(?i)", ""), "i"), kind, id] as const);
const recognise = (text: string) => PATTERNS.flatMap(([rx, kind]) => { const m = rx.exec(text); return m ? [[kind, m[1]]] : []; });

beforeEach(() => harness.reset());

test("every link shape is recognised once, and YouTube Music is a song", () => {
  assert.equal(PATTERNS.filter(([, , id]) => id === "youtube").length, 3);
  const cases: Record<string, string[][]> = {
    "https://www.youtube.com/watch?v=bkMKtf2V6Js&si=abc": [["video", "bkMKtf2V6Js"]],
    "https://youtu.be/bkMKtf2V6Js?si=tracking": [["video", "bkMKtf2V6Js"]],
    "https://m.youtube.com/watch?feature=share&v=bkMKtf2V6Js": [["video", "bkMKtf2V6Js"]],
    "https://www.youtube.com/shorts/aBcDeFgHiJk": [["video", "aBcDeFgHiJk"]],
    "https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=RDAMVM": [["song", "dQw4w9WgXcQ"]],
    "see youtube.com/watch?v=dQw4w9WgXcQ": [["video", "dQw4w9WgXcQ"]],
  };
  for (const [text, want] of Object.entries(cases)) assert.deepEqual(recognise(text), want, text);
});

test("a song takes its artist from the Topic channel, and the address is clean", async () => {
  harness.web = () => ({ title: "Paranoid Android", author_name: "Radiohead - Topic" });
  const r = await harness.call("youtube", { kind: "song", ids: { youtube: "fHiGbolFFGw" } });
  assert.deepEqual(r.ids, { youtube: "fHiGbolFFGw", url: "https://music.youtube.com/watch?v=fHiGbolFFGw" });
  assert.deepEqual([r.fields.artist, r.fields.title, r.fields.channel], ["Radiohead", "Paranoid Android", undefined]);
  assert.match(harness.asked[0].url, /^https:\/\/www\.youtube\.com\/oembed\?format=json&url=https%3A%2F%2Fwww\.youtube\.com%2Fwatch%3Fv%3DfHiGbolFFGw$/);
});

test("a video YouTube hides is skipped with its clean address", async () => {
  harness.web = () => new Reply(401);
  const gone = await harness.call("youtube", { kind: "video", ids: { youtube: "x".repeat(11) } });
  assert.ok(gone.skipped);
  assert.equal(gone.ids.url, "https://www.youtube.com/watch?v=xxxxxxxxxxx");
  assert.deepEqual(await harness.call("youtube", { kind: "video" }), { fields: {}, skipped: "no YouTube id" });
});
