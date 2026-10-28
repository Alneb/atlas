// The request TubeArchivist gets, and what is left alone.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { harness, Status } from "atlas-helper/testing";
import "./helper";

const secrets: Record<string, string> = {};
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
  const r = await harness.call("archive", { settings: { address: "https://tube.example.org/" }, ids: { youtube: "bkMKtf2V6Js" } });
  assert.deepEqual(r, { fields: { tubearchivist: "https://tube.example.org/video/bkMKtf2V6Js/" } });
  const sent = harness.asked[0];
  assert.deepEqual([sent.url, sent.method], ["https://tube.example.org/api/download/", "POST"]);
  assert.deepEqual(JSON.parse(String(sent.body)), { data: [{ youtube_id: "bkMKtf2V6Js", status: "pending" }] });
  assert.deepEqual(sent.headers?.Authorization, { secret: "token", prefix: "Token " });
});

test("no video, archiving off, or no address: nothing is sent", async () => {
  assert.ok((await harness.call("archive", { settings: { address: "https://t" }, ids: {} })).skipped);
  assert.ok((await harness.call("archive", { settings: { address: "https://t", auto: false }, ids: { youtube: "x" } })).skipped);
  assert.ok((await harness.call("archive", { settings: {}, ids: { youtube: "x" } })).skipped);
  assert.equal(harness.asked.length, 0);
});
