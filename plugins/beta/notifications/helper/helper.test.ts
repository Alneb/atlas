// The helper against a stand-in ntfy and an in-memory vault: messages filed in a note per source (the first tag, else
// the topic), newest first, `unread` counted, a muted source still logged but not loud, nothing filed twice, the inbox
// topic captured, `send` through Apprise or ntfy; and the core's side through the harness.
import { test } from "node:test";
import assert from "node:assert/strict";
import { harness, Status } from "atlas-helper/testing";
import { auth, muted, sendWith, syncWith, type Message, type Net, type Vault } from "./helper";

/** ntfy: each topic's messages, `since=<id>` honoured as the real one does; the POSTs made. */
function ntfy(topics: Record<string, Message[]>) {
  const posts: { url: string; body: string; headers: Record<string, string> }[] = [];
  const net: Net = {
    get: async (url) => {
      const [path, query] = url.split("?");
      const msgs = topics[decodeURIComponent(path.split("/").slice(-2)[0])] ?? [];
      const since = decodeURIComponent(/since=([^&]*)/.exec(query)?.[1] ?? "");
      const at = msgs.findIndex((m) => m.id === since);
      return msgs.slice(at + 1).map((m) => JSON.stringify({ event: "message", ...m })).join("\n") + "\n";
    },
    post: async (url, body, headers) => posts.push({ url, body, headers }),
  };
  return { net, posts };
}

function memory(files: Record<string, string> = {}) {
  const captured: string[] = [], since: Record<string, string> = {};
  const vault: Vault = {
    read: async (p) => files[p] ?? null,
    write: async (p, t) => (files[p] = t),
    capture: async (t) => captured.push(t),
    since: async (t) => since[t] ?? "",
    keep: async (t, id) => void (since[t] = id),
    today: () => "2026-10-25",
  };
  return { vault, files, captured, since };
}

const settings = (over: Record<string, unknown> = {}) => ({ settings: { server: "https://ntfy.example.org", topics: "server", folder: "notifications", ...over }, secrets: {} });

test("the sign-in is a user and password, else a token", () => {
  assert.deepEqual(auth({ settings: { user: "me" }, secrets: { password: "pw", token: "tk" } }), { Authorization: "Basic bWU6cHc=" });
  assert.deepEqual(auth({ settings: { user: "zoë" }, secrets: { password: "ü" } }), { Authorization: "Basic em/DqzrDvA==" }, "UTF-8, as ntfy reads it");
  assert.deepEqual(auth({ settings: {}, secrets: { token: "tk" } }), { Authorization: "Bearer tk" });
  assert.deepEqual(auth({ settings: {}, secrets: {} }), {});
});

test("messages are filed by source, newest first, and never twice", async () => {
  const server: Message[] = [
    { id: "a1", time: 1761354000, title: "Backup done", message: "2.1 GB", tags: ["backups"], priority: 3 },
    { id: "a2", time: 1761354600, title: "Backup failed", message: "repository locked\nrestic said so", tags: ["backups"], priority: 5, click: "https://example.org/b" },
    { id: "a3", time: 1761354700, message: "untagged", priority: 2 },
  ];
  const { net } = ntfy({ server }), m = memory();
  const r = await syncWith(net, m.vault, settings());
  assert.equal(r.new, 3);
  let note = m.files["notifications/backups.md"];
  assert.ok(note.startsWith("---\ntype: notifications\nsource: backups\nfrom: ntfy: server\nmuted: false\nunread: 2\n---\n# Backups\n\n"), note);
  assert.ok(note.indexOf("Backup failed") < note.indexOf("Backup done"), "newest first");
  assert.ok(note.includes("🔴 **Backup failed** — repository locked · [open](https://example.org/b) <!-- n=a2 -->\n  > restic said so"), note);
  assert.match(note, /^- \d{4}-\d\d-\d\d \d\d:\d\d · 🔴/m);
  assert.ok(m.files["notifications/server.md"].includes("untagged"), "no tag: the topic is the source");
  assert.deepEqual(new Set(r.loud.map((l) => l.source)), new Set(["backups", "server"]));
  assert.equal(m.since.server, "a3");
  // again: nothing new, nothing filed twice
  assert.equal((await syncWith(net, m.vault, settings())).new, 0);
  assert.equal(m.files["notifications/backups.md"].split("Backup failed").length, 2);
  // a new one later on: on top, unread grows
  server.push({ id: "a4", time: 1761355000, title: "Backup done", message: "again", tags: ["backups"] });
  await syncWith(net, m.vault, settings());
  note = m.files["notifications/backups.md"];
  assert.ok(note.includes("unread: 3"));
  assert.ok(note.indexOf("again") < note.indexOf("Backup failed"));
});

test("a muted source is logged but not loud", async () => {
  const m = memory({ "notifications/updates.md": "---\ntype: notifications\nsource: updates\nmuted: true\nunread: 0\n---\n# Updates\n\n" });
  const { net } = ntfy({ server: [{ id: "u1", time: 1761356000, title: "jellyfin 10.11", message: "updated", tags: ["updates"] }] });
  const r = await syncWith(net, m.vault, settings());
  assert.ok(m.files["notifications/updates.md"].includes("jellyfin 10.11"));
  assert.deepEqual(r.loud, []);
  assert.ok(muted({ muted: "2999-01-01" }, "2026-10-25") && muted({ muted: "2026-10-25" }, "2026-10-25"));
  assert.ok(!muted({ muted: "2000-01-01" }, "2026-10-25") && !muted({ muted: "false" }, "2026-10-25"));
});

test("a topic that fails is said, and the others go on", async () => {
  const { net } = ntfy({ ok: [{ id: "o1", time: 1761356000, message: "fine" }] });
  const failing: Net = { ...net, get: async (url) => (url.includes("/down/") ? Promise.reject(new Error("ntfy.example.org answered 502")) : net.get(url, {})) };
  const r = await syncWith(failing, memory().vault, settings({ topics: "down, ok" }));
  assert.equal(r.new, 1);
  assert.deepEqual(r.problems, ["down: ntfy.example.org answered 502"]);
  assert.equal(r.summary, "1 new; down: ntfy.example.org answered 502");
});

test("the inbox is captured, and send goes through Apprise or ntfy", async () => {
  const { net, posts } = ntfy({ inbox: [{ id: "i1", time: 1761357000, message: "buy milk" }] });
  const m = memory();
  assert.equal((await syncWith(net, m.vault, settings({ topics: "", inbox: "inbox" }))).captured, 1);
  assert.deepEqual(m.captured, ["buy milk"]);
  assert.equal((await sendWith(net, { text: "done", title: "Job", settings: { apprise: "https://apprise.example.org/notify/key" } })).through, "apprise");
  assert.deepEqual(JSON.parse(posts.at(-1)!.body), { title: "Job", body: "done" });
  assert.equal((await sendWith(net, { text: "done", settings: { server: "https://ntfy.example.org", phone_topic: "me" }, secrets: {} })).through, "ntfy");
  assert.equal(posts.at(-1)!.url, "https://ntfy.example.org/me?title=Atlas");
  await assert.rejects(sendWith(net, { text: "x", settings: {} }), /phone's topic/);
});

test("through the core: the poll is fetched, the note written and the last id kept in the cache", async () => {
  const files: Record<string, string> = { ".atlas/cache/plugins/test/since-server": "old1\n" };
  harness.api = (verb, path, body) => {
    const p = decodeURIComponent(/path=([^&]*)/.exec(path)?.[1] ?? "");
    if (verb === "GET" && path.startsWith("/api/file?")) {
      if (!(p in files)) throw new Status(404, `no ${p}`);
      return { text: files[p] };
    }
    if (verb === "PUT" && path.startsWith("/api/file")) return (files[body.path] = body.text), {};
    throw new Error(`unexpected ${verb} ${path}`);
  };
  harness.web = (url) => (url.includes("/server/json") ? `${JSON.stringify({ event: "open" })}\n${JSON.stringify({ event: "message", id: "n1", time: 1761357000, message: "hello" })}\n` : null);
  const r = await harness.call("sync", settings());
  assert.equal(r.new, 1, JSON.stringify(r));
  assert.ok(harness.asked[0].url.endsWith("/server/json?poll=1&since=old1"), "the Python helper's last id is carried over");
  assert.ok(files["notifications/server.md"].includes("hello"));
  assert.deepEqual(JSON.parse(files[".atlas/cache/test.json"]), { since: { server: "n1" } });
});
