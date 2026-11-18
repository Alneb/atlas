import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { runCommand } from "./open";
import { readFileSync, rmSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { WS } from "../playwright.config";
import { installEmailPlugin } from "./fixtures/plugins";

// The Email pane (plugins/stable/email: the Rust engine and the Svelte pane, docs/refactor/REFACTOR-email-rust.md)
// against the engine's stand-in server (engine/src/fake.rs, the `fake-mail` binary: IMAP and SMTP on 127.0.0.1, three
// messages in the inbox) — never a real account. It writes what it holds to state.json and what it was sent to
// sent/<n>.eml, which is what these tests read back.
const H = { "x-atlas": "1" };
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
  installEmailPlugin(); // the plugin as shipped, its helper built from this checkout
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

async function openPane(page: Page) {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __atlas: { commands(): { id: string }[] } }).__atlas.commands().some((c) => c.id === "plugin.email.open")), { timeout: 20_000 }).toBe(true);
  await runCommand(page, "Email: open mail", "Email: open mail");
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

test("a conversation's right-click acts on it, not on the open one: its keys' commands, named as in the palette", async ({ page }) => {
  const mail = await openPane(page);
  const row = (s: string) => mail.locator(".list .row", { hasText: s });
  await expect(row("Cluster time on iq")).toBeVisible({ timeout: 30_000 });
  await row("Draft of the DCA section").click(); // open: the keys would act on this one
  await row("Cluster time on iq").click({ button: "right" });
  const menu = page.getByRole("menu");
  for (const name of [/^Reply(?! all)/, /^Reply all/, /^Forward/, /^Archive/, /^Star/, /^Snooze…/, /^Move to…/, /^Delete/]) await expect(menu.getByRole("menuitem", { name })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("mail-row-menu.png") });
  await menu.getByRole("menuitem", { name: /^Star/ }).click();
  await expect.poll(() => box("INBOX").find((m) => m.subject === "Cluster time on iq")?.flags).toContain("\\Flagged");
  expect(box("INBOX").find((m) => m.subject === "Draft of the DCA section")?.flags ?? []).not.toContain("\\Flagged");
  // starred now: the same row reads Unstar
  await row("Cluster time on iq").click({ button: "right" });
  await page.getByRole("menu").getByRole("menuitem", { name: /^Unstar/ }).click();
  await expect.poll(() => box("INBOX").find((m) => m.subject === "Cluster time on iq")?.flags).not.toContain("\\Flagged");
});

test("the vault's search lists the mail in its own group, and a hit opens the message in the Email pane", async ({ page }) => {
  const mail = await openPane(page); // the index synced
  await expect(mail.locator(".list .row", { hasText: "Cluster time on iq" })).toBeVisible({ timeout: 30_000 });
  await page.keyboard.press("Control+Shift+F");
  const pane = page.locator(".search-pane");
  await pane.getByLabel("Search", { exact: true }).fill("cluster time");
  const hit = pane.locator(".plugin-hit", { hasText: "Cluster time on iq" });
  await expect(hit).toBeVisible({ timeout: 15_000 });
  await expect(pane.locator(".group-label", { hasText: "Email" })).toBeVisible();
  for (const scheme of ["dark", "light"] as const) { // judged in both themes (docs/guides/UI-STYLE.md)
    await page.emulateMedia({ colorScheme: scheme });
    await page.screenshot({ path: test.info().outputPath(`vault-search-mail-${scheme}.png`) });
  }
  // the keys reach it after the files' rows: ↓ until it is the chosen row, then Enter opens it
  const box = pane.getByLabel("Search", { exact: true });
  for (let i = 0; i < 40 && !(await hit.evaluate((b) => b.classList.contains("sel"))); i++) await box.press("ArrowDown");
  await expect(hit).toHaveClass(/sel/);
  await box.press("Enter");
  await expect(page.locator(".mail .reader .subject")).toContainText("Cluster time on iq", { timeout: 15_000 });
  // the pane's own search: the best matches first, the newest first one click away
  await mail.getByPlaceholder("Search mail…").fill("cluster");
  const order = mail.locator(".chips button", { hasText: /Best match|Newest first/ });
  await expect(order).toHaveText("Best match");
  await expect(mail.locator(".list .row", { hasText: "Cluster time on iq" })).toBeVisible();
  await order.click();
  await expect(order).toHaveText("Newest first");
  await expect(mail.locator(".list .row", { hasText: "Cluster time on iq" })).toBeVisible();
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
  // Shift+click: the system's browser, through the desktop's core (web-links.ts openOutside)
  const outside: string[] = [];
  await page.route("**/api/open-outside", async (r) => { outside.push(r.request().postDataJSON().url); await r.fulfill({ status: 204 }); });
  await frame.locator("a", { hasText: "the talk page" }).click({ modifiers: ["Shift"] });
  await expect.poll(() => outside).toEqual(["https://example.org/talk"]);
  await mail.locator(".list .row").first().click(); // the keys below are the pane's, not the frame's
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

// MCP reads mail, with permission: an agent's read of an account whose card
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

test("Ctrl+F finds in the conversation's frames; a pasted picture goes in the text and leaves inline", async ({ page }) => {
  test.setTimeout(120_000);
  const mail = await openPane(page);
  const row = (s: string) => mail.locator(".list .row", { hasText: s });
  await expect(row("Draft of the DCA section")).toBeVisible({ timeout: 30_000 });
  await row("Draft of the DCA section").click();
  const reader = mail.getByRole("region", { name: "The conversation" });
  await expect(reader.locator("h2.subject")).toContainText("Draft of the DCA section");
  await page.keyboard.press("Control+f");
  const find = reader.getByRole("textbox", { name: "Find in this conversation" });
  await expect(find).toBeFocused();
  await find.fill("ATTACHED");
  await expect(reader.locator(".find .count")).toHaveText(/^1 of \d+$/);
  const frame = reader.frameLocator("iframe.frame").first();
  await expect(frame.locator("mark.atlas-find.cur")).toHaveText("attached");
  await find.press("Escape");
  await expect(frame.locator("mark.atlas-find")).toHaveCount(0);
  await page.screenshot({ path: "target/email-find.png" });

  // a new message; a long subject never widens the window (the popup stays put)
  await page.keyboard.press("c");
  const form = mail.getByRole("form", { name: "New message" });
  await form.getByRole("textbox", { name: "To" }).fill("ana@example.org");
  await form.getByRole("textbox", { name: "Subject" }).fill("A picture ".repeat(20));
  // the chip To makes on blur leaves the cursor in the subject
  await expect(form.getByRole("textbox", { name: "Subject" })).toHaveValue(/^A picture/);
  await expect(form.getByRole("textbox", { name: "Subject" })).toBeFocused();
  const win = mail.locator(".win").first();
  expect(await win.evaluate((w) => w.scrollWidth - w.clientWidth)).toBeLessThanOrEqual(0);
  const body = form.getByRole("textbox", { name: "The message" });
  await body.fill("Look:\n");
  // a right-click in the text: the editor's menu (where the plugins' rows, Spelling's suggestions, go), without a
  // note's own rows
  await body.click({ button: "right" });
  const menu = page.getByRole("menu");
  await expect(menu.locator('[data-label="Paste"]')).toBeVisible();
  await expect(menu.locator('[data-label="Bold"]')).toBeVisible();
  await expect(menu.locator('[data-label="Task…"]')).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  // the text is the app's prose editor (atlas.editor.prose): the caret to its end, then the paste
  await body.press("Control+End");
  await body.evaluate(async (t: HTMLElement) => {
    // a 1×1 PNG on the clipboard, as a screenshot tool leaves it
    const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([png], "image.png", { type: "image/png" }));
    t.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await expect(body).toContainText("![](cid:pasted-1.png)");
  await expect(form.locator(".file")).toContainText("pasted-1.png");
  // a file dragged from the file tree onto the text attaches it, and its path is not typed into the message
  await body.evaluate((t: HTMLElement) => {
    const dt = new DataTransfer();
    dt.setData("application/x-atlas-path", "papers/report.pdf");
    dt.setData("text/plain", "papers/report.pdf");
    for (const type of ["dragover", "drop"]) t.dispatchEvent(new DragEvent(type, { dataTransfer: dt, bubbles: true, cancelable: true }));
  });
  await expect(form.locator(".file", { hasText: "report.pdf" })).toBeVisible();
  await expect(body).not.toContainText("papers/report.pdf");
  await form.getByRole("button", { name: "Remove report.pdf" }).click(); // not in this vault: not sent
  await form.getByRole("button", { name: "Preview" }).click();
  await expect(form.locator(".preview img")).toHaveAttribute("src", /^data:image\/png;base64,/);
  await page.screenshot({ path: "target/email-compose-paste.png" });
  const before = existsSync(`${STATE}/sent`) ? readdirSync(`${STATE}/sent`).length : 0;
  await page.keyboard.press("Control+Enter");
  await expect.poll(() => (existsSync(`${STATE}/sent`) ? readdirSync(`${STATE}/sent`).length : 0), { timeout: 20_000 }).toBe(before + 1);
  const sent = readFileSync(`${STATE}/sent/${before + 1}.eml`, "utf8");
  expect(sent.toLowerCase()).toContain("multipart/related");
  expect(sent).toMatch(/Content-ID: <pasted-1\.png>/i);
  expect(sent).toContain("[image: pasted-1.png]");
});

test("Link: a conversation linked to any note is kept in its own note's links, listed under Linked, the target untouched", async ({ page, request }) => {
  test.setTimeout(120_000);
  await put(request, "notes/Link target.md", "# Link target\n\nMy own text.\n");
  const mail = await openPane(page);
  await mail.locator(".list .row", { hasText: "Cluster time on iq" }).click();
  const reader = mail.getByRole("region", { name: "The conversation" });
  await expect(reader.locator("h2.subject")).toContainText("Cluster time on iq");
  // a visible Link button, not an entry hidden under ⋯
  await reader.getByRole("button", { name: "Link" }).click();
  await reader.getByRole("menuitem", { name: /To a note or a mail/ }).click();
  const palette = page.getByTestId("palette");
  await expect(palette).toBeVisible();
  await page.keyboard.type("Link target");
  await palette.getByText("Link target", { exact: true }).first().click();
  await expect(mail.locator(".toast")).toContainText("Linked to Link target");
  // the link lives in the conversation's note (Email's file), the user's note is not written
  await expect.poll(async () => {
    const r = await request.get("/api/files", { headers: H });
    const files = (await r.json()) as string[];
    const note = files.find((f) => f.startsWith("mail/") && f.includes("Cluster time on iq"));
    return note ? (await read(request, note)) ?? "" : "";
  }, { timeout: 20_000 }).toContain("[[notes/Link target]]");
  expect(await read(request, "notes/Link target.md")).toBe("# Link target\n\nMy own text.\n");
  // listed under the subject, both themes looked at
  const chip = reader.getByRole("button", { name: "Link target" });
  await expect(chip).toBeVisible({ timeout: 15_000 });
  await page.screenshot({ path: "test-results/email-linked-light.png" });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.screenshot({ path: "test-results/email-linked-dark.png" });
});
