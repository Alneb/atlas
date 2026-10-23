import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { readFileSync, rmSync, mkdirSync, cpSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { WS } from "../playwright.config";

// The Email pane (plugins/beta/email: the Rust engine and the Svelte pane, docs/refactor/REFACTOR-email-rust.md)
// against the engine's stand-in server (engine/src/fake.rs, the `fake-mail` binary: IMAP and SMTP on 127.0.0.1, three
// messages in the inbox) — never a real account. It writes what it holds to state.json and what it was sent to
// sent/<n>.eml, which is what these tests read back.
const H = { "x-atlas": "1" };
const PLUGIN = fileURLToPath(new URL("../../plugins/beta/email", import.meta.url));
const REPO = fileURLToPath(new URL("../..", import.meta.url));
const STATE = `${WS}-mail`;
const put = (r: APIRequestContext, path: string, text: string) => r.put("/api/file", { headers: H, data: { path, text } });
const read = async (r: APIRequestContext, path: string) => { const res = await r.get(`/api/file?path=${encodeURIComponent(path)}`, { headers: H }); return res.ok() ? ((await res.json()) as { text: string }).text : null; };
type Box = { uid: number; flags: string[]; subject: string }[];
const box = (name: string) => (JSON.parse(readFileSync(`${STATE}/state.json`, "utf8")) as Record<string, Box>)[name] ?? [];
const subjects = (name: string) => box(name).map((m) => m.subject);

let server: ChildProcess;
test.beforeAll(async ({ request }) => {
  test.setTimeout(300_000); // the stand-in server is built once
  const built = spawnSync("cargo", ["build", "-q", "-p", "atlas-email", "--bin", "fake-mail"], { cwd: REPO, stdio: "inherit" });
  if (built.status !== 0) throw new Error("cannot build fake-mail");
  rmSync(STATE, { recursive: true, force: true });
  mkdirSync(STATE, { recursive: true });
  server = spawn(join(REPO, "target/debug/fake-mail"), [STATE], { stdio: ["ignore", "pipe", "inherit"] });
  const ports = await new Promise<{ imap: number; smtp: number }>((ok) => createInterface({ input: server.stdout! }).once("line", (l) => ok(JSON.parse(l))));
  // the plugin as shipped (its committed helper and built pane), copied into the test vault
  const dir = join(WS, ".atlas/plugins/email");
  rmSync(dir, { recursive: true, force: true });
  for (const f of ["plugin.toml", "view.js", "main.js", "ui-lib", "bin"]) cpSync(join(PLUGIN, f), join(dir, f), { recursive: true });
  await put(request, ".atlas/plugin-settings/email.toml",
    `undo_send = 1\nprefetch = 50\n\n[[accounts]]\nname = "test"\nuser = "me@example.org"\nfrom = "Me <me@example.org>"\nsignature = "Me\\nPhysics dept."\nimap_host = "127.0.0.1"\nimap_port = ${ports.imap}\nsmtp_host = "127.0.0.1"\nsmtp_port = ${ports.smtp}\nsecurity = "none"\n`);
  await request.put(`/api/plugins/email/secrets/${encodeURIComponent("accounts.test.password")}`, { headers: H, data: { value: "pw" } });
  await request.post("/api/plugins/email/helper/stop", { headers: H });
});
test.afterAll(async ({ request }) => {
  await request.post("/api/plugins/email/helper/stop", { headers: H });
  rmSync(join(WS, ".atlas/plugins/email"), { recursive: true, force: true });
  await request.delete(`/api/plugins/email/secrets/${encodeURIComponent("accounts.test.password")}`, { headers: H });
  server?.kill();
});

async function command(page: Page, text: string, title: string) {
  const palette = page.getByTestId("palette");
  await expect(async () => {
    if (await palette.isVisible()) await page.keyboard.press("Escape");
    await page.keyboard.press("F1");
    await expect(palette.getByRole("textbox")).toBeFocused({ timeout: 1000 });
    await page.keyboard.type(text);
    await expect(palette.getByText(title, { exact: true }).first()).toBeVisible({ timeout: 1000 });
    await page.keyboard.press("Enter");
  }).toPass({ timeout: 15_000 });
}

async function openPane(page: Page) {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __atlas: { commands(): { id: string }[] } }).__atlas.commands().some((c) => c.id === "plugin.email.open")), { timeout: 20_000 }).toBe(true);
  await command(page, "Email: open mail", "Email: open mail");
  const mail = page.locator(".mail");
  await expect(mail).toBeVisible();
  return mail;
}

const subjectsIn = (mail: ReturnType<Page["locator"]>) => mail.locator(".list .row .subject");

test("the inbox from the index: read marks read, keys move and archive, Undo brings it back", async ({ page }) => {
  test.setTimeout(120_000);
  const mail = await openPane(page);
  await expect(subjectsIn(mail)).toHaveText(["Séminaire jeudi", "Draft of the DCA section", "Cluster time on iq"], { timeout: 30_000 });
  const row = (s: string) => mail.locator(".list .row", { hasText: s });
  await expect(row("Draft of the DCA section")).toHaveClass(/unread/);
  // the sidebar: roles first, the decoded name, Exchange's stores folded under More
  const side = mail.getByRole("navigation", { name: "Mail folders" });
  await expect(side.getByText("Lectures été")).toBeVisible();
  await expect(side.getByText("More (3)")).toBeVisible();

  await row("Draft of the DCA section").click();
  const reader = mail.getByRole("region", { name: "The conversation" });
  await expect(reader.locator("h2.subject")).toContainText("Draft of the DCA section");
  await expect(reader.locator(".fname")).toHaveText(["notes.txt"]);
  await expect(row("Draft of the DCA section")).not.toHaveClass(/unread/);
  await expect.poll(() => box("INBOX").find((m) => m.uid === 2)?.flags).toEqual(["\\Seen"]);

  // e archives (to Archive), the next conversation opens; z undoes
  await page.keyboard.press("e");
  await expect(row("Draft of the DCA section")).toHaveCount(0);
  await expect.poll(() => subjects("Archive")).toContain("Draft of the DCA section");
  await expect(mail.locator(".toast")).toContainText("Archived 1 conversation");
  await page.keyboard.press("z");
  await expect(row("Draft of the DCA section")).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => subjects("Archive")).not.toContain("Draft of the DCA section");

  // s stars, # deletes to the Trash
  await row("Séminaire jeudi").click();
  await page.keyboard.press("s");
  await expect.poll(() => box("INBOX").find((m) => m.subject === "Séminaire jeudi")?.flags).toContain("\\Flagged");
  await page.keyboard.press("#");
  await expect.poll(() => subjects("Trash")).toEqual(["Séminaire jeudi"]);
});

test("a reply leaves threaded, quoted under the signature, Bcc never shown; a sent copy is kept", async ({ page }) => {
  test.setTimeout(120_000);
  const mail = await openPane(page);
  await mail.locator(".list .row", { hasText: "Cluster time on iq" }).click();
  await page.keyboard.press("r");
  const form = mail.getByRole("form", { name: "Reply" });
  await expect(form.locator(".chip")).toContainText(["Ada Lovelace"]);
  await form.getByRole("button", { name: "Bcc" }).click();
  await form.getByRole("textbox", { name: "Bcc" }).fill("boss@example.org");
  await form.getByRole("textbox", { name: "The message" }).fill("Thank you, **Ada**.");
  await page.keyboard.press("Control+Enter");
  await expect.poll(() => existsSync(`${STATE}/sent/1.eml`), { timeout: 20_000 }).toBe(true);
  // quoted-printable, as mail is sent: decoded to read it
  const sent = readFileSync(`${STATE}/sent/1.eml`, "utf8").replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/g, (_m, h: string) => String.fromCharCode(parseInt(h, 16)));
  expect(sent).toContain("In-Reply-To: <seed-1@example.org>");
  expect(sent).toContain("Subject: Re: Cluster time on iq");
  expect(sent).toMatch(/Thank you, \*\*Ada\*\*\./);
  expect(sent).toContain("<strong>Ada</strong>");
  expect(sent, "the signature above the quote").toMatch(/^-- \r?\nMe\r?\nPhysics dept\.[\s\S]*^> The allocation/m);
  expect(sent.toLowerCase()).not.toContain("bcc:");
  await expect.poll(() => subjects("Sent")).toContain("Re: Cluster time on iq");
  await expect.poll(() => box("INBOX").find((m) => m.uid === 1)?.flags).toContain("\\Answered");
  // the conversation now holds both
  await expect(mail.locator(".list .row", { hasText: "Cluster time on iq" }).locator(".count")).toHaveText("2", { timeout: 15_000 });
});

test("search with operators, an HTML mail drawn safely, and Save as note drawn as mail", async ({ page, request }) => {
  test.setTimeout(120_000);
  const mail = await openPane(page);
  await expect(subjectsIn(mail).first()).toBeVisible({ timeout: 30_000 });
  const search = mail.getByRole("textbox", { name: "Search mail" });
  await search.fill("from:news pictures");
  await expect(subjectsIn(mail)).toHaveText(["Newsletter with pictures"]);
  await expect(mail.locator(".chip").first()).toContainText("from:news");
  await mail.locator(".list .row").first().click();
  const reader = mail.getByRole("region", { name: "The conversation" });
  await expect(reader.getByText(/1 remote picture blocked/)).toBeVisible();
  const frame = reader.frameLocator("iframe.frame").first();
  await expect(frame.locator("p.hl")).toHaveText("Styled heading");
  await expect(frame.locator("a", { hasText: "the talk page" })).toHaveAttribute("href", "https://example.org/talk");
  await expect(frame.locator("script")).toHaveCount(0);
  await expect(frame.locator("img[alt=logo]")).toHaveAttribute("src", /^data:image\/png;base64,/);
  await expect(frame.locator("details.atlas-quoted")).toHaveCount(1);
  await expect(reader.getByRole("button", { name: "Unsubscribe" }).first()).toBeVisible();
  await expect(reader.locator(".fname")).toHaveText(["photo.png"]);

  // Save as note: the old thread-note shape, uid kept; opened, it is drawn as mail
  await page.keyboard.press("Shift+N");
  await expect(mail.locator(".toast")).toContainText("Saved as a note");
  const path = "mail/test/Lectures été/2026-10-15 Newsletter with pictures.md";
  await expect.poll(async () => (await read(request, path)) ?? "").toContain("type: email-thread");
  const text = (await read(request, path))!;
  expect(text).toContain('"uid":"1"');
  expect(text).toContain("data-remote-src=\"https://tracker.example.org/pixel.gif\"");
  expect(readdirSync(join(WS, "mail/test/Lectures été/2026-10-15 Newsletter with pictures files"))).toContain("photo.png");
  await mail.locator(".toast").getByRole("button", { name: "Open" }).click();
  await expect(page.locator(".nv h1")).toHaveText("Newsletter with pictures");
});

// "and mcp should be able to read emails" · "with permission" (2026-10-15): an agent's read of an account whose card
// says "ask" waits for the user's answer in the window; "always" is remembered on the card.
test("Claude's read of an account asks in the window first; Always is kept on the card", async ({ page, request }) => {
  test.setTimeout(90_000);
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __atlas: { commands(): { id: string }[] } }).__atlas.commands().some((c) => c.id === "plugin.email.check")), { timeout: 20_000 }).toBe(true);
  const asked = request.post("/api/plugins/email/tools/inbox", { headers: H, data: { limit: 2 } });
  const palette = page.getByTestId("palette");
  await expect(palette.getByRole("textbox")).toHaveAttribute("placeholder", /Claude asks to read test/, { timeout: 30_000 });
  await palette.getByText("Allow this once").click();
  const once = (await (await asked).json()) as { messages?: { subject: string }[] };
  expect(once.messages?.length, JSON.stringify(once)).toBe(2);
  const again = request.post("/api/plugins/email/tools/inbox", { headers: H, data: { limit: 1 } });
  await expect(palette.getByRole("textbox")).toHaveAttribute("placeholder", /Claude asks to read test/, { timeout: 15_000 });
  await palette.getByText("Always allow for test").click();
  expect(((await (await again).json()) as { messages: unknown[] }).messages).toHaveLength(1);
  await expect.poll(async () => (await read(request, ".atlas/plugin-settings/email.toml")) ?? "").toMatch(/claude = "always"/);
});

test("important: i pins it on top and keeps it as a note; n sends it to Not important, g n shows it there", async ({ page }) => {
  test.setTimeout(120_000);
  const mail = await openPane(page);
  const row = (s: string) => mail.locator(".list .row", { hasText: s });
  await expect(row("Cluster time on iq")).toBeVisible({ timeout: 30_000 });
  await row("Cluster time on iq").click();
  await page.keyboard.press("i");
  await expect.poll(() => box("INBOX").find((m) => m.subject === "Cluster time on iq")?.flags).toContain("\\Flagged");
  // the inbox's important section: its heading, then the conversation first
  await expect(mail.locator(".list .sect").first()).toContainText("Important", { timeout: 15_000 });
  await expect(subjectsIn(mail).first()).toHaveText("Cluster time on iq");
  // kept in the vault at once (save_important), in the mail note shape
  const kept = () => (existsSync(join(WS, "mail/test")) ? (readdirSync(join(WS, "mail/test"), { recursive: true }) as string[]).filter((f) => f.endsWith(".md") && f.includes("Cluster time")) : []);
  await expect.poll(kept, { timeout: 20_000 }).toHaveLength(1);
  // n: unstarred and out of the inbox, into a "Not important" folder made for it
  await page.keyboard.press("n");
  await expect.poll(() => subjects("Not important")).toContain("Cluster time on iq");
  await expect(row("Cluster time on iq")).toHaveCount(0, { timeout: 15_000 });
  await mail.locator(".list").click({ position: { x: 5, y: 5 } }).catch(() => {});
  await page.keyboard.press("g");
  await page.keyboard.press("n");
  await expect(row("Cluster time on iq")).toBeVisible({ timeout: 15_000 });
});
