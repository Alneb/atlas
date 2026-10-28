import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SFTP_ROOT } from "../playwright.config";

// The SSH example plugin's hosts in Atlas's explorer (panes/Explorer.svelte): a host's files over sftp. The "host" is a stand-in:
// fixtures/fake_ssh.sh answers sftp's subsystem request with this machine's sftp-server, started in
// SFTP_ROOT (playwright.config.ts) — a real sftp client and server, over a pipe, no network.
const H = { "x-atlas": "1" };
const DIR = ".atlas/plugins/ssh";
const put = (r: APIRequestContext, path: string, text: string) => r.put("/api/file", { headers: H, data: { path, text } });
const read = async (r: APIRequestContext, path: string) => { const res = await r.get(`/api/file?path=${encodeURIComponent(path)}`, { headers: H }); return res.ok() ? ((await res.json()) as { text: string }).text : null; };
// the helper as the webServer builds it (playwright.config.ts): the plugin's own bin/ is built by engine/build.sh
const HELPER = fileURLToPath(new URL("../../target/debug/atlas-ssh", import.meta.url));
const example = (f: string) => readFileSync(fileURLToPath(new URL(`../../plugins/stable/ssh/${f}`, import.meta.url)), "utf8");

test.beforeAll(async ({ request }) => {
  await put(request, `${DIR}/main.js`, example("main.js"));
  // no hosts read from the machine's own ssh config: one host, "iq", from the settings
  await put(request, `${DIR}/plugin.toml`, example("plugin.toml").replace(/^run = .*$/m, `run = "${HELPER}"`));
  await put(request, ".atlas/plugin-settings/ssh.toml", 'config = "no-such-ssh-config"\nextra = ["iq"]\n'); // the vault's values, never in the manifest
});
test.afterAll(async ({ request }) => {
  await put(request, `${DIR}/main.js`, "export function register() {}\n");
  await request.post("/api/plugins/ssh/helper/stop", { headers: H });
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
async function choose(page: Page, text: string, row: string | RegExp) {
  const palette = page.getByTestId("palette");
  await expect(palette.getByRole("textbox")).toBeFocused();
  await page.keyboard.type(text);
  await expect(palette.getByText(row).first()).toBeVisible();
  await page.keyboard.press("Enter");
}

test("the explorer browses a host's files, opens and edits one, downloads, uploads, makes, renames and deletes", async ({ page, request }) => {
  test.setTimeout(90_000); // one sftp session per action
  mkdirSync(join(SFTP_ROOT, "old"), { recursive: true });
  writeFileSync(join(SFTP_ROOT, "old", "keep.txt"), "kept\n");
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __atlas: { commands(): { id: string }[] } }).__atlas.commands().some((c) => c.id === "plugin.ssh.files")), { timeout: 15_000 }).toBe(true);

  await command(page, "SSH: browse files", "SSH: browse files on… (SFTP)");
  await choose(page, "iq", "iq");
  const pane = page.locator(".explorer");
  await expect(page.getByTestId("sidebar").locator(".tab", { hasText: "(iq)" })).toBeVisible();
  const row = (name: string) => pane.locator(".x-row", { has: page.locator(".label", { hasText: new RegExp(`^${name.replace(/[[\]]/g, "\\$&")}$`) }) });
  await expect(row("data run")).toBeVisible({ timeout: 15_000 });
  await expect(row("notes.md")).toContainText("40 B");
  await expect(row(".bashrc"), "hidden files are hidden at first").toHaveCount(0);
  await expect(pane.locator(".crumbs")).toContainText(basename(SFTP_ROOT)); // the run's own folder (ATLAS_PW_WS may move it)
  await expect(pane.locator(".place.on .dot.up"), "connected").toBeVisible();

  // into a folder (a name with a space) and back with the keyboard
  await row("data run").dblclick();
  await expect(row("out [1].txt")).toBeVisible();
  await pane.locator(".list").press("Backspace");
  await expect(row("data run")).toHaveClass(/sel/);
  await pane.getByRole("button", { name: "Hidden" }).click();
  await expect(row(".bashrc")).toBeVisible();

  // a new folder, typed in place
  await pane.getByRole("button", { name: "New folder" }).click();
  await pane.getByRole("textbox", { name: "New folder name" }).fill("made here");
  await page.keyboard.press("Enter");
  await expect(row("made here")).toBeVisible();
  expect(existsSync(join(SFTP_ROOT, "made here"))).toBe(true);

  // rename with F2
  await row("notes.md").click();
  await pane.locator(".list").press("F2");
  const name = pane.getByRole("textbox", { name: "New name for notes.md" });
  await expect(name).toBeFocused();
  await name.fill("cluster.md");
  await page.keyboard.press("Enter");
  await expect(row("cluster.md")).toBeVisible();
  expect(existsSync(join(SFTP_ROOT, "cluster.md"))).toBe(true);

  // delete asks first; a folder with something in it is refused, an empty one goes
  await row("old").hover();
  await row("old").getByRole("button", { name: "Delete" }).click();
  await expect(pane.getByRole("alertdialog")).toContainText("Delete the folder “old” from iq?");
  await pane.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(pane.locator(".status .msg.bad")).toContainText("only an empty folder");
  expect(existsSync(join(SFTP_ROOT, "old", "keep.txt"))).toBe(true);
  await row("made here").hover();
  await row("made here").getByRole("button", { name: "Delete" }).click();
  await pane.getByRole("alertdialog").getByRole("button", { name: "Cancel" }).click();
  await expect(row("made here"), "Cancel keeps it").toBeVisible();
  await row("made here").click();
  await pane.locator(".list").press("Delete");
  await pane.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(row("made here")).toHaveCount(0);
  expect(existsSync(join(SFTP_ROOT, "made here"))).toBe(false);

  // download into a folder of the vault, typed as a new one
  await row("cluster.md").hover();
  await row("cluster.md").getByRole("button", { name: "Download…" }).click();
  await choose(page, "notes/remote", /Into notes\/remote/);
  await expect(pane.locator(".status .msg")).toContainText("Downloaded to notes/remote/cluster.md");
  expect(await read(request, "notes/remote/cluster.md")).toBe("# Remote notes\n\nWritten on the cluster.\n");

  // upload a note of the vault into this folder
  await pane.getByRole("button", { name: "Upload…" }).click();
  await page.getByRole("menuitem", { name: "A file of this vault…" }).click();
  await choose(page, "hubbard", "hubbard"); // a picker names a note without its extension
  await expect(row("hubbard.md")).toBeVisible();
  expect(readFileSync(join(SFTP_ROOT, "hubbard.md"), "utf8")).toContain("# Hubbard");

  // a remote text file opens in the editor, as any file does; a save goes back to the host
  await row("cluster.md").dblclick();
  const ed = page.locator(".dv-active-group .cm-editor");
  await expect(ed).toContainText("Written on the cluster.");
  await ed.locator(".cm-content").click();
  await page.keyboard.press("Control+End");
  if (await page.locator(".cm-fat-cursor").count()) await page.keyboard.press("o"); // vim: a new line, insert mode
  else await page.keyboard.press("Enter");
  await page.keyboard.type("Edited in Atlas.");
  await page.keyboard.press("Control+s");
  await expect.poll(() => readFileSync(join(SFTP_ROOT, "cluster.md"), "utf8")).toContain("Edited in Atlas.");
  // the save is done when it says so: the helper notes the file's size and date after its put, and a change made before
  // that would be taken for the save's own
  await expect(page.locator(".toast", { hasText: "Saved" })).toBeVisible();
  // changed on the host meanwhile: not overwritten unseen — the notice says so, and a click saves over it
  writeFileSync(join(SFTP_ROOT, "cluster.md"), "# Remote notes\n\nSomeone else changed this, longer now.\n");
  await page.keyboard.type(" Again.");
  await page.keyboard.press("Control+s");
  const notice = page.getByText(/changed on iq since it was opened here/);
  await expect(notice).toBeVisible({ timeout: 15_000 });
  expect(readFileSync(join(SFTP_ROOT, "cluster.md"), "utf8")).toContain("Someone else changed this");
  await notice.click();
  await expect.poll(() => readFileSync(join(SFTP_ROOT, "cluster.md"), "utf8")).toContain("Edited in Atlas. Again.");

  // a picture opens in the image viewer, from its copy too
  writeFileSync(join(SFTP_ROOT, "dot.png"), Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));
  await page.getByTestId("sidebar").locator(".tab", { hasText: "(iq)" }).click();
  await page.locator(".explorer").getByRole("button", { name: "Refresh" }).click();
  await row("dot.png").dblclick();
  await expect(page.locator(".dv-active-group .dv-tab.dv-active-tab")).toContainText("dot.png");
  await expect(page.locator(".dv-active-group img").first()).toBeVisible();
});

// "ssh file exploring seems to make the app slow, make sure the app is not left waiting for slow connections":
// a measurement, not a check by default — ATLAS_FAKE_SSH_DELAY=<s> ATLAS_SSH_SLOW=1 runs it. While a listing
// waits on the link: the frames, and how long the palette and another note take.
test("slow link: the app stays responsive while a folder listing waits", async ({ page }) => {
  test.skip(!process.env.ATLAS_SSH_SLOW, "set ATLAS_SSH_SLOW=1 and ATLAS_FAKE_SSH_DELAY=<seconds>");
  test.setTimeout(120_000);
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __atlas: { commands(): { id: string }[] } }).__atlas.commands().some((c) => c.id === "plugin.ssh.files")), { timeout: 15_000 }).toBe(true);
  await page.evaluate(() => {
    const w = window as unknown as { gaps: number[] }; w.gaps = [];
    let last = performance.now();
    const tick = (t: number) => { w.gaps.push(t - last); last = t; requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  await command(page, "SSH: browse files", "SSH: browse files on… (SFTP)");
  await choose(page, "iq", "iq");
  const t0 = Date.now();
  await page.waitForTimeout(500);
  const t1 = Date.now();
  await page.keyboard.press("Control+p");
  await page.keyboard.type("FOCUS.md");
  await expect(page.getByTestId("palette").getByText("FOCUS", { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator(".dv-active-group .cm-editor")).toContainText("Finish the GW notes.");
  const other = Date.now() - t1;
  await page.getByTestId("sidebar").locator(".tab", { hasText: "(iq)" }).click();
  await expect(page.locator(".x-row").first()).toBeVisible({ timeout: 60_000 });
  const listed = Date.now() - t0;
  // into a folder (waits on the link) and back up: the folder seen before shows at once, "updating…" behind it
  const row = (name: string) => page.locator(".x-row", { has: page.locator(".label", { hasText: new RegExp(`^${name}$`) }) });
  await row("data run").dblclick();
  await expect(row("out \\[1\\].txt")).toBeVisible({ timeout: 60_000 });
  const t2 = Date.now();
  await page.locator(".list").press("Backspace");
  await expect(row("data run")).toBeVisible();
  const back = Date.now() - t2;
  await expect(page.locator(".status")).not.toContainText("updating", { timeout: 60_000 });
  const g = await page.evaluate(() => { const f = (window as unknown as { gaps: number[] }).gaps.slice().sort((a, b) => a - b); return { n: f.length, p50: Math.round(f[f.length >> 1]), worst: Math.round(f[f.length - 1]), over100: f.filter((x) => x > 100).length }; });
  console.log(`[ssh-slow] delay ${process.env.ATLAS_FAKE_SSH_DELAY}s: listing shown after ${listed} ms; back to a folder seen before in ${back} ms; meanwhile palette → another note open in ${other} ms; frames ${g.n}, p50 ${g.p50} ms, worst ${g.worst} ms, >100 ms ${g.over100}`);
});
