// The TubeArchivist preset: the request TubeArchivist gets, the note's link to the archive, and what is left alone.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { harness, Status } from "atlas-helper/testing";
import "./helper";

const secrets: Record<string, string> = {};
const TA = { preset: "TubeArchivist", address: "https://tube.example.org/", kinds: ["video"] };
beforeEach(() => {
  harness.reset();
  harness.web = () => "{}";
  harness.api = (verb, path) => {
    const name = /\/secrets?\/([\w-]+)/.exec(path)?.[1] ?? "";
    if (verb === "GET" && name) return { value: secrets[name] ?? null }; // the core's answer: null when unset
    throw new Status(404, `${verb} ${path}`);
  };
});

test("a video is queued with the token the core fills in, and the note links the archive", async () => {
  secrets.token = "x";
  const r = await harness.call("send", { kind: "video", settings: TA, ids: { youtube: "bkMKtf2V6Js", url: "https://www.youtube.com/watch?v=bkMKtf2V6Js" } });
  assert.deepEqual(r, { fields: { tubearchivist: "https://tube.example.org/video/bkMKtf2V6Js/" } });
  const sent = harness.asked[0];
  assert.deepEqual([sent.url, sent.method], ["https://tube.example.org/api/download/", "POST"]);
  assert.deepEqual(JSON.parse(String(sent.body)), { data: [{ youtube_id: "bkMKtf2V6Js", status: "pending" }] });
  assert.deepEqual(sent.headers?.Authorization, { secret: "token", prefix: "Token " });
});

test("not a YouTube video, sending off, or no address: nothing is sent", async () => {
  const url = "https://example.org/v";
  assert.ok((await harness.call("send", { kind: "video", settings: TA, ids: { url } })).skipped);
  assert.ok((await harness.call("send", { kind: "video", settings: { ...TA, auto: false }, ids: { youtube: "x", url } })).skipped);
  assert.ok((await harness.call("send", { kind: "video", settings: { ...TA, address: "" }, ids: { youtube: "x", url } })).skipped);
  assert.equal(harness.asked.length, 0);
  // a rule asking for it sends even with sending off (the old `links: { tubearchivist: { archive: true } }`)
  await harness.call("send", { kind: "video", settings: { ...TA, auto: false }, ids: { youtube: "x", url }, options: { archive: true } });
  assert.equal(harness.asked.length, 1);
});

test("a note that already links its archive is not queued again", async () => {
  const r = await harness.call("send", { kind: "video", settings: TA, ids: { youtube: "x", url: "u" }, note: { tubearchivist: "https://tube.example.org/video/x/" } });
  assert.deepEqual(r, {});
  assert.equal(harness.asked.length, 0);
});
