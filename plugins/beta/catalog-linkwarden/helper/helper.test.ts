// What Linkwarden is sent for a catalogued thing, and its answers.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { harness, Reply, Status } from "atlas-helper/testing";
import { linkOf } from "./helper";

let token: string | null = "t";
beforeEach(() => {
  harness.reset();
  token = "t";
  harness.web = () => ({ response: { id: 42 } });
  harness.api = (verb, path) => {
    if (verb === "GET" && path.includes("/secrets/token")) return { value: token };
    throw new Status(404, `${verb} ${path}`);
  };
});

test("the address is the thing's own link, else the best its IDs give", () => {
  assert.equal(linkOf({ url: "https://a.example.org", doi: "10.1/x" }, {}), "https://a.example.org");
  assert.equal(linkOf({ arxiv: "2401.00001", youtube: "x" }, {}), "https://arxiv.org/abs/2401.00001");
  assert.equal(linkOf({ imdb: "tt0111161" }, {}), "https://www.imdb.com/title/tt0111161/");
  assert.equal(linkOf({}, { source: "https://s.example.org" }), "https://s.example.org");
  assert.equal(linkOf({}, {}), null);
});

test("a link is saved in its library's collection with the tags, the token filled in by the core", async () => {
  const r = await harness.call("save", {
    settings: { address: "https://links.example.org/", tags: ["atlas"] }, library: "Films & Series",
    ids: { imdb: "tt0111161" }, props: { title: "The Shawshank Redemption" }, options: { tags: ["atlas", "watch"] },
  });
  assert.deepEqual(r, { fields: { linkwarden: "https://links.example.org/links/42" } });
  const sent = harness.asked[0];
  assert.equal(sent.url, "https://links.example.org/api/v1/links");
  assert.deepEqual(sent.headers?.Authorization, { secret: "token", prefix: "Bearer " });
  assert.deepEqual(JSON.parse(String(sent.body)), {
    url: "https://www.imdb.com/title/tt0111161/", name: "The Shawshank Redemption", description: "",
    tags: [{ name: "atlas" }, { name: "watch" }], collection: { name: "Films & Series" },
  });
});

test("no token: no header; already there is not an error; a failure says the answer", async () => {
  token = null;
  await harness.call("save", { settings: { address: "https://l" }, ids: { url: "https://x" } });
  assert.equal(harness.asked[0].headers?.Authorization, undefined);
  harness.web = () => new Reply(409);
  assert.deepEqual(await harness.call("save", { settings: { address: "https://l" }, ids: { url: "https://x" } }), { fields: {}, already: true });
  harness.web = () => new Reply(500, "boom");
  await assert.rejects(harness.call("save", { settings: { address: "https://l" }, ids: { url: "https://x" } }), /Linkwarden answered 500: boom/);
  assert.ok((await harness.call("save", { settings: {}, ids: { url: "https://x" } })).skipped);
});
