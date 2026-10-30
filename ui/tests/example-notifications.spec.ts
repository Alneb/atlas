import { test, expect, type APIRequestContext } from "@playwright/test";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// The Notifications plugin installed as it is, against a stand-in ntfy server: "send to my phone" is one POST to
// /<phone topic> from the plugin's helper, its body the text, its title (in the address: UTF-8) the note it came from,
// the token handed to the helper by the core; what the phone sent to the inbox topic is polled and captured.
const H = { "x-atlas": "1" };
const put = (r: APIRequestContext, path: string, text: string) => r.put("/api/file", { headers: H, data: { path, text } });
const example = (f: string) => readFileSync(fileURLToPath(new URL(`../../plugins/beta/notifications/${f}`, import.meta.url)), "utf8");
let server: Server, port = 0;
const got: { url: string; title: string; auth: string; body: string }[] = [];

test.beforeAll(async ({ request }) => {
  server = createServer((req, res) => {
    if (req.method === "GET") { // ntfy's poll (`?poll=1&since=…`): one JSON object per line; only the inbox has any
      res.writeHead(200, { "content-type": "application/x-ndjson" });
      const inbox = (req.url ?? "").startsWith("/phone-inbox/json");
      res.end(inbox ? JSON.stringify({ event: "message", id: "m1", time: 1761357000, message: "from the phone qqp" }) + "\n" : "");
      return;
    }
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const u = new URL(req.url ?? "/", "http://x");
      got.push({ url: u.pathname, title: u.searchParams.get("title") ?? "", auth: String(req.headers.authorization ?? ""), body });
      res.writeHead(200); res.end("{}");
    });
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  port = (server.address() as AddressInfo).port;
  await put(request, ".atlas/plugins/notifications/helper.js", example("helper.js")); // its helper, run in the core
  for (const f of ["main.js", "sources.js", "send.js"]) await put(request, `.atlas/plugins/notifications/${f}`, example(f));
  await put(request, ".atlas/plugins/notifications/plugin.toml", example("plugin.toml"));
});
test.afterAll(async ({ request }) => {
  await put(request, ".atlas/plugins/notifications/main.js", "export function register() {}\n");
  await request.post(`/api/fs/trash?path=${encodeURIComponent("notifications/backups.md")}`, { headers: H });
  await new Promise((done) => server.close(done));
});

test("Send to my phone is a dialog: a title, the text, then sent through ntfy with the token", async ({ page, request }) => {
  await request.put("/api/plugins/notifications/settings", { headers: H, data: { server: `http://127.0.0.1:${port}`, phone_topic: "my-phone", token: "tk-1" } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("F1");
  await page.keyboard.type("Notifications: send to my phone");
  await page.keyboard.press("Enter");
  const dialog = page.locator(".ntp");
  await expect(dialog.getByRole("textbox", { name: "Text" })).toBeFocused({ timeout: 15_000 });
  await expect(dialog.getByRole("textbox", { name: "Title" })).toHaveValue("Home"); // the active note's (or page's) name
  await page.keyboard.type("buy milk");
  for (const scheme of ["light", "dark"] as const) { // judged in both themes (docs/guides/UI-STYLE.md)
    await page.emulateMedia({ colorScheme: scheme });
    await page.screenshot({ path: test.info().outputPath(`notifications-send-${scheme}.png`) });
  }
  await page.keyboard.press("Control+Enter");
  await expect.poll(() => got.length).toBe(1);
  expect(got[0]).toMatchObject({ url: "/my-phone", title: "Home", auth: "Bearer tk-1", body: "buy milk" });
  await expect(dialog).toContainText("Sent, through ntfy.");
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(dialog).toHaveCount(0);
});

test("Mute a source… is a dialog: each source with its unread count, muted in place", async ({ page, request }) => {
  await put(request, "notifications/backups.md", "---\nunread: 2\nmuted: false\n---\n## A message\n");
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("F1");
  await page.keyboard.type("Notifications: mute a source");
  await page.keyboard.press("Enter");
  const row = page.locator(".nts li", { hasText: "backups" });
  await expect(row).toContainText("2 unread", { timeout: 15_000 });
  const mute = row.getByRole("combobox", { name: "Mute backups" });
  await expect(mute).toHaveValue("off");
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.screenshot({ path: test.info().outputPath(`notifications-sources-${scheme}.png`) });
  }
  await mute.selectOption("7");
  const week = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
  await expect(row).toContainText(`until ${week}`);
  const text = async () => (await (await request.get(`/api/file?path=${encodeURIComponent("notifications/backups.md")}`, { headers: H })).json()).text as string;
  await expect.poll(text).toContain(`muted: ${week}`);
  await mute.selectOption("off");
  await expect.poll(text).toContain("muted: false");
});

test("messages sent to the inbox topic from the phone become captures (the page's first sync polls it)", async ({ page, request }) => {
  await request.put("/api/plugins/notifications/settings", { headers: H, data: { server: `http://127.0.0.1:${port}`, phone_topic: "my-phone", inbox: "phone-inbox" } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  const d = new Date(), day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const log = async () => ((await (await request.get(`/api/file?path=log/${day}.md`, { headers: H })).json()) as { text?: string }).text ?? "";
  await expect.poll(log, { timeout: 15_000 }).toContain("from the phone qqp");
  await request.put("/api/plugins/notifications/settings", { headers: H, data: { inbox: "" } });
  await request.post("/api/plugins/notifications/helper/stop", { headers: H });
});

