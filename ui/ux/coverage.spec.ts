// Coverage journeys: not a chosen path but EVERYTHING — every command Atlas lists, every on/off
// setting, every file type in the sample, the git flow. Inventories come from the app itself
// (`window.__atlas`), so a new command or pane kind is covered (or reported uncovered) automatically.
import { expect, type Page } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { journey, OUT, type User } from "./harness";

const T = { timeout: 6000 };
type CmdInfo = { id: string; title: string; source: "ui" | "builtin" | "script"; keys?: string };

async function ready(p: Page) {
  await p.goto("/");
  await expect(p.getByTestId("capture")).toBeVisible(T);
}

/** Leave whatever has focus (a terminal swallows Ctrl+K) and close palettes. */
async function neutral(u: User) {
  await u.page.keyboard.press("Escape");
  await u.page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
}

async function errorToast(p: Page): Promise<string | null> {
  const t = p.locator('.toast[data-kind="error"]');
  return (await t.count()) ? ((await t.first().textContent()) ?? "error").trim().slice(0, 200) : null;
}

/** Commands that must not run unattended, with the reason (reported as skipped, never hidden). */
function skipReason(c: CmdInfo, description: string): string | null {
  if (c.id === "ux.audit") return "runs this audit itself";
  if (/\bargs?\s*\{/.test(description)) return "needs arguments (its description says so) — exercised through its pane instead";
  return null;
}

journey("Every command", "Run each command Atlas lists, from the palette, the way a user would", async (u) => {
  const p = u.page;
  await ready(p);
  const cmds: CmdInfo[] = await p.evaluate(() => (window as unknown as { __atlas: { commands(): CmdInfo[] } }).__atlas.commands());
  const kinds: string[] = await p.evaluate(() => (window as unknown as { __atlas: { paneKinds: string[] } }).__atlas.paneKinds);
  const descs: Record<string, string> = Object.fromEntries(
    ((await p.request.get("/api/commands", { headers: { "x-atlas": "1" } }).then((r) => r.json())) as { id: string; description?: string }[])
      .map((c) => [c.id, c.description ?? ""]),
  );
  writeFileSync(join(OUT, "inventory.json"), JSON.stringify({ commands: cmds, paneKinds: kinds }, null, 1));

  for (const c of cmds) {
    const why = skipReason(c, descs[c.id] ?? "");
    if (why) { u.skip(`${c.title} (${c.id})`, why); continue; }
    await neutral(u);
    await u.step(`${c.title} (${c.id})`, { budget: c.source === "script" ? 20000 : 1500 }, async () => {
      await u.press("Control+k");
      await u.type(`>${c.title}`);
      await u.click(p.getByTestId("palette-item").filter({ hasText: c.title }).first());
      u.ranCommand(c.id);
      if (c.id === "ui.web") {
        // the URL prompt: open Atlas's own page (always reachable) in a web pane
        await u.type(new URL(p.url()).origin + "/");
        await u.press("Enter");
        await expect(p.locator(".web-pane")).toBeVisible(T);
      } else if (c.source === "ui") {
        await p.waitForTimeout(350);
      } else {
        // server commands answer with a toast: "<title>" on success, "<title> failed" on error
        await p.locator(".toast").filter({ hasText: c.title }).first().waitFor({ timeout: 60_000 });
      }
      const err = await errorToast(p);
      if (err) throw new Error(err);
    });
    await p.locator(".toast").evaluateAll((ts) => ts.forEach((t) => (t as HTMLElement).click())).catch(() => {});
    // toggles are put back so later journeys see the user's setup
    if (c.id === "ui.theme" || c.id === "ui.vim") {
      await neutral(u);
      await u.press("Control+k");
      await u.type(`>${c.title}`);
      await p.getByTestId("palette-item").filter({ hasText: c.title }).first().click();
    }
  }
});

journey("Every setting", "Flip each on/off setting and back; every setting should say what it does", async (u) => {
  const p = u.page;
  await ready(p);
  await u.press("Control+,");
  await expect(p.getByRole("heading", { name: /Settings/i }).first()).toBeVisible(T);
  // every page in turn (Settings is a sidebar of pages): collect rows and switches from all of them
  const nav = p.locator("nav[aria-label='Settings pages'] > button.nav"); // the pages, not "Edit the file"
  const undocumented: string[] = [];
  const ids: string[] = [];
  for (let i = 0; i < await nav.count(); i++) {
    await nav.nth(i).click();
    undocumented.push(...await p.locator("main .row").evaluateAll((rows) =>
      rows.filter((r) => !r.querySelector(".label p")).map((r) => r.querySelector("label")?.getAttribute("for") ?? "?")));
    ids.push(...await p.locator("main button.switch[id]").evaluateAll((bs) => bs.map((b) => b.id)));
  }
  await u.step("Every setting has a description", { why: "the Settings pane is the manual" }, async () => {
    if (undocumented.length) throw new Error(`no description: ${undocumented.join(", ")}`);
  });
  for (const id of ids) {
    await u.step(`Toggle ${id}`, { budget: 1500 }, async () => {
      await p.getByPlaceholder("Search settings…").fill(id); // search spans every page
      const sw = p.locator(`button.switch[id="${id}"]`);
      const before = await sw.getAttribute("aria-checked");
      await u.click(sw);
      await expect(sw).not.toHaveAttribute("aria-checked", before ?? "", T);
      await u.click(sw);
      await expect(sw).toHaveAttribute("aria-checked", before ?? "", T);
      const err = await errorToast(p);
      if (err) throw new Error(err);
    });
  }
});

/** Extension → the pane kind it should open in, and what proves the pane rendered. */
const TYPES: [string, string, string][] = [
  ["md", "editor", ".cm-content"], ["py", "editor", ".cm-content"], ["tex", "editor", ".cm-content"],
  ["toml", "editor", ".cm-content"], ["pdf", "pdf", ".pdf-pane canvas, .pdf-pane .page"], ["png", "image", ".image-pane img"],
  ["svg", "editor", ".cm-content"], ["tsv", "table", ".table-pane tbody tr:not(.spacer)"], ["csv", "table", ".table-pane tbody tr:not(.spacer)"],
  ["base", "base", ".base-pane .base"], ["excalidraw", "excalidraw", ".draw-pane"], ["rnote", "rnote", ".rnote-pane"],
];

journey("Every file type", "Open one file of each kind found in the workspace and see it rendered", async (u) => {
  const p = u.page;
  await ready(p);
  for (const [ext, kind, proof] of TYPES) {
    const hits: string[] = await p.request.get(`/api/search?q=${encodeURIComponent("." + ext)}`, { headers: { "x-atlas": "1" } })
      .then((r) => r.json()).then((j) => (j.files as string[]).filter((f) => f.toLowerCase().endsWith("." + ext)), () => []);
    if (!hits.length) { u.skip(`Open a .${ext} file`, "none in the workspace sample"); continue; }
    const name = hits[0].split("/").pop()!;
    await neutral(u);
    await u.step(`Open a .${ext} file (${name})`, { budget: 2500 }, async () => {
      await u.openFile(name);
      await expect(p.locator(proof).first()).toBeVisible({ timeout: 10_000 });
      // the UI reports its state to the core a moment later: poll, then judge
      await expect.poll(async () => (await p.request.get("/api/ui/state", { headers: { "x-atlas": "1" } }).then((r) => r.json())).active?.kind,
        { timeout: 3000, message: `pane kind for .${ext}` }).toBe(kind);
    });
  }
});

journey("Git", "See what changed, read a diff, look at a commit", async (u) => {
  const p = u.page;
  await ready(p);
  await u.step("Make a change (capture to today's log)", {}, async () => {
    await u.press("Control+Alt+c");
    await u.type("A line for the git journey");
    await u.press("Enter");
    await expect(p.getByTestId("capture-ok")).toBeVisible(T);
  });
  await u.step("Open Git (Ctrl+Shift+G) and see the change", { budget: 1500 }, async () => {
    await u.press("Control+Shift+g");
    await expect(p.locator(".side-pane.git button.name").first()).toBeVisible(T);
  });
  await u.step("Open its diff", { budget: 1500 }, async () => {
    await u.click(p.locator(".side-pane.git button.name").first());
    await expect(p.locator(".diff-pane")).toBeVisible(T);
  });
  await u.step("Open a commit from the history", { budget: 1500 }, async () => {
    await u.click(p.locator(".side-pane.git button.commit").first());
    await expect.poll(async () => (await p.request.get("/api/ui/state", { headers: { "x-atlas": "1" } }).then((r) => r.json())).active?.kind, T).toBe("commit");
  });
});
