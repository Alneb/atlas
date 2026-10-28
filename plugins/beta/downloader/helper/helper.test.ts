// The request the settings make, and what is left alone.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { harness, Reply, Status } from "atlas-helper/testing";
import "./helper";

const S = { address: "https://dl.example.org/add", body: '{"url": "{url}", "format": "mp3", "name": "{artist} - {title}"}', kinds: ["song"], header: "X-Api-Key" };
const P = { kind: "song", settings: S, ids: { youtube: "fHiGbolFFGw", url: "https://music.youtube.com/watch?v=fHiGbolFFGw" }, props: { title: 'Say "hi"', artist: "Radiohead" } };

beforeEach(() => {
  harness.reset();
  harness.web = () => "{}";
  harness.api = (verb, path) => {
    if (verb === "GET" && path.includes("/secrets/token")) return { value: "k" };
    throw new Status(404, `${verb} ${path}`);
  };
});

test("a song is sent as the settings shape it, the token filled in by the core", async () => {
  assert.deepEqual(await harness.call("send", P), { fields: { downloaded: "requested" } });
  const sent = harness.asked[0];
  assert.deepEqual(sent.headers?.["X-Api-Key"], { secret: "token" });
  assert.deepEqual(JSON.parse(String(sent.body)), { url: "https://music.youtube.com/watch?v=fHiGbolFFGw", format: "mp3", name: 'Radiohead - Say "hi"' });
});

test("an address template is URL-escaped, and GET sends no body", async () => {
  await harness.call("send", { ...P, settings: { ...S, address: "https://dl.example.org/get?u={url}&n={title}", method: "get" } });
  const sent = harness.asked[0];
  assert.equal(sent.url, "https://dl.example.org/get?u=https%3A%2F%2Fmusic.youtube.com%2Fwatch%3Fv%3DfHiGbolFFGw&n=Say%20%22hi%22");
  assert.deepEqual([sent.method, sent.body], ["GET", undefined]);
});

test("other kinds are left alone, a bad body is said before sending, a failure says the answer", async () => {
  assert.ok((await harness.call("send", { ...P, kind: "video" })).skipped);
  assert.equal(harness.asked.length, 0);
  await assert.rejects(harness.call("send", { ...P, settings: { ...S, body: "{url}" } }), /JSON/);
  assert.equal(harness.asked.length, 0);
  harness.web = () => new Reply(500, "boom");
  await assert.rejects(harness.call("send", P), /answered 500: boom/);
});
