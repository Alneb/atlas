import { test, expect, type APIRequestContext } from "@playwright/test";
import { openFile, runCommand } from "./open";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// The FreshRSS plugin installed as it is, against stand-ins of its two APIs. Fever (the fallback): unread articles in
// a block, "Save" makes a note of one, the tools. Google Reader (the default): the reader pane lists the feeds and the
// articles, an article is drawn cleaned in the shared frame and marked read on FreshRSS by opening it.
const H = { "x-atlas": "1" };
const put = (r: APIRequestContext, path: string, text: string) => r.put("/api/file", { headers: H, data: { path, text } });
const read = async (r: APIRequestContext, path: string) => ((await (await r.get(`/api/file?path=${encodeURIComponent(path)}`, { headers: H })).json()) as { text?: string }).text ?? "";
const shipped = (f: string) => readFileSync(fileURLToPath(new URL(`../../plugins/beta/freshrss/${f}`, import.meta.url)), "utf8");
const FILES = ["main.js", "view.js", "helper.js", "fr.js", "plugin.toml"];
let server: Server, port = 0;
const bodies: string[] = [];
const greader: { url: string; auth: string; body: string }[] = [];
const READ = "user/-/state/com.google/read";
const GITEM = { id: "tag:google.com,2005:reader/item/0001", title: "Spin chains", published: 1764230400, canonical: [{ href: "https://example.org/spin" }],
  summary: { content: "<p>Heisenberg <b>chains</b> again.</p><script>window.parent.hacked = 1</script>" }, origin: { streamId: "feed/3", title: "Condensed matter" }, categories: [] };

/** Articles the stand-in's stream gives after GITEM: a round's new ones. */
const later: Record<string, unknown>[] = [];

test.beforeAll(async ({ request }) => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const url = req.url ?? "";
      if (url.startsWith("/api/greader.php")) {
        greader.push({ url, auth: String(req.headers.authorization ?? ""), body });
        const json = (v: unknown) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(v)); };
        if (url.endsWith("/accounts/ClientLogin")) {
          if (!body.includes("Passwd=api-pass")) { res.writeHead(401); return res.end("Error=BadAuthentication"); }
          res.writeHead(200); return res.end("SID=alice/x\nLSID=null\nAuth=alice/tok1\n");
        }
        if (req.headers.authorization !== "GoogleLogin auth=alice/tok1") { res.writeHead(401); return res.end(); }
        if (url.includes("/subscription/list")) return json({ subscriptions: [{ id: "feed/3", title: "Condensed matter", categories: [{ label: "Physics" }] }] });
        if (url.includes("/unread-count")) return json({ unreadcounts: [{ id: "feed/3", count: 1 }] });
        if (url.includes("/stream/contents/")) return json({ items: [GITEM, ...later] });
        if (url.includes("/stream/items/contents")) return json({ items: body.includes(encodeURIComponent(GITEM.id)) ? [GITEM] : [] });
        if (url.endsWith("/reader/api/0/token")) { res.writeHead(200); return res.end("wtok\n"); }
        if (url.endsWith("/reader/api/0/edit-tag")) { res.writeHead(200); return res.end("OK"); }
        res.writeHead(404); return res.end();
      }
      bodies.push(body);
      res.writeHead(200, { "content-type": "application/json" });
      if ((req.url ?? "").includes("unread_item_ids")) return res.end(JSON.stringify({ auth: 1, unread_item_ids: "7,8" }));
      res.end(JSON.stringify({ auth: 1, items: [{ id: 7, title: "Kondo physics today", url: "https://example.org/kondo", html: "<p>The <b>Kondo</b> effect again.</p>" }, { id: 8, title: "Second article", url: "https://example.org/2", html: "" }] }));
    });
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  port = (server.address() as AddressInfo).port;
  for (const f of FILES) await put(request, `.atlas/plugins/freshrss/${f}`, shipped(f));
  await put(request, "notes/feeds.md", "# Feeds\n\n```view\ntype: freshrss.unread\n```\n\nend\n");
});
test.afterAll(async ({ request }) => {
  await put(request, ".atlas/plugins/freshrss/main.js", "export function register() {}\n");
  await new Promise((done) => server.close(done));
});

test("a FreshRSS block lists the unread articles; Save makes a note of one", async ({ page, request }) => {
  await request.put("/api/plugins/freshrss/settings", { headers: H, data: { server: `http://127.0.0.1:${port}`, protocol: "fever", api_key: "fever-key" } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await openFile(page, "feeds.md");
  const row = page.locator(".cm-content li", { hasText: "Kondo physics today" });
  await expect(row).toBeVisible();
  expect(bodies[0]).toBe("api_key=fever-key");
  await row.getByRole("button", { name: "Save" }).click();
  await expect.poll(() => read(request, "notes/reading/Kondo physics today.md")).toContain("The Kondo effect again.");
});

// The reading and saving are the helper's: the freshrss_unread and freshrss_save tools (an agent, the phone) do the same.
test("the FreshRSS tools list the unread articles and save one, never over a note", async ({ request }) => {
  await request.put("/api/plugins/freshrss/settings", { headers: H, data: { server: `http://127.0.0.1:${port}`, protocol: "fever", api_key: "fever-key", folder: "notes/feeds-saved" } });
  const list = await request.post("/api/plugins/freshrss/tools/unread", { headers: H, data: { limit: 5 } });
  expect(list.ok(), await list.text()).toBe(true);
  expect(JSON.stringify(await list.json())).toContain("Kondo physics today");
  const save = async () => (await request.post("/api/plugins/freshrss/tools/save", { headers: H, data: { id: "7" } })).json();
  expect(JSON.stringify(await save())).toContain("notes/feeds-saved/Kondo physics today.md");
  await expect.poll(() => read(request, "notes/feeds-saved/Kondo physics today.md")).toContain("source: \"https://example.org/kondo\"");
  expect(JSON.stringify(await save())).toMatch(/"made":\s*false/); // there already: not written over
});

test("the reader signs in to Google Reader, lists feeds and articles, draws an article cleaned and marks it read", async ({ page, request }) => {
  await request.put("/api/plugins/freshrss/settings", { headers: H, data: { server: `http://127.0.0.1:${port}`, protocol: "greader", user: "alice", api_password: "api-pass" } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await runCommand(page, "FreshRSS: read", "FreshRSS: read");
  const reader = page.locator(".fr");
  await expect(reader.locator(".feeds")).toContainText("Condensed matter");
  await expect(reader.locator(".folder")).toHaveText("Physics");
  await reader.locator(".item", { hasText: "Spin chains" }).click();
  const frame = page.frameLocator(".reading iframe");
  await expect(frame.locator("body")).toContainText("Heisenberg chains again.");
  expect(await page.evaluate(() => (window as unknown as { hacked?: number }).hacked)).toBeUndefined();
  expect(await frame.locator("script").count()).toBe(0);
  await expect.poll(() => greader.find((g) => g.url.endsWith("/edit-tag"))?.body ?? "").toBe(`i=${encodeURIComponent(GITEM.id)}&a=${encodeURIComponent(READ)}&T=wtok`);
  expect(greader[0].body).toBe("Email=alice&Passwd=api-pass");
  expect(greader.filter((g) => !g.url.endsWith("/ClientLogin")).every((g) => g.auth === "GoogleLogin auth=alice/tok1")).toBe(true);
});

test("an agent reads one article's whole text, without its HTML", async ({ request }) => {
  await request.put("/api/plugins/freshrss/settings", { headers: H, data: { server: `http://127.0.0.1:${port}`, protocol: "greader", user: "alice", api_password: "api-pass" } });
  const unread = await (await request.post("/api/plugins/freshrss/tools/unread", { headers: H, data: {} })).json();
  expect(unread.map((a: { title: string }) => a.title)).toEqual(["Spin chains"]);
  const r = await request.post("/api/plugins/freshrss/tools/read", { headers: H, data: { id: GITEM.id } });
  expect(r.ok(), await r.text()).toBe(true);
  const one = await r.json();
  expect(one).toMatchObject({ title: "Spin chains", feed: "Condensed matter", url: "https://example.org/spin" });
  expect(one.text).toContain("Heisenberg chains again.");
});

test("the round tells the articles that came since the last one, once, and only when asked", async ({ request }) => {
  const settings = { server: `http://127.0.0.1:${port}`, protocol: "greader", user: "alice", api_password: "api-pass" };
  const round = async () => { const r = await request.post("/api/plugins/freshrss/tools/check", { headers: H, data: {}, timeout: 60_000 }); expect(r.ok(), await r.text()).toBe(true); return r.json(); };
  await request.put("/api/plugins/freshrss/settings", { headers: H, data: settings });
  expect((await round()).skipped).toContain("off");
  await request.put("/api/plugins/freshrss/settings", { headers: H, data: { ...settings, notify: true } });
  expect((await round()).summary).toContain("first round");
  later.push({ ...GITEM, id: "tag:google.com,2005:reader/item/0002", title: "Majorana modes", crawlTimeMsec: String(Date.now() + 60_000) });
  const told = await round();
  expect(told.notices?.[0]).toMatchObject({ id: "freshrss-new", title: "1 new article in FreshRSS: Condensed matter" });
  expect(told.notices[0].body).toContain("Majorana modes");
  expect((await round()).summary).toBe("nothing new");
  later.length = 0;
});
