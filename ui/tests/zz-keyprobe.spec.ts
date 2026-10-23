// A probe, not a regression test: presses the shortcuts people expect from VS Code / Obsidian and
// writes what each one did to KEYPROBE_OUT. Runs only when that variable is set.
import { test, type Page } from "@playwright/test";
import { shownName } from "../src/lib/paths";
import { writeFileSync } from "node:fs";

const OUT = process.env.KEYPROBE_OUT;
const H = { "x-atlas": "1" };
const MD = "# Probe\n\nalpha beta gamma\nalpha beta gamma\n\n- item one\n- [ ] task two\n\nlast line\n";
const PY = "import os\n\n\ndef energy(t):\n    value = t * 2\n    value = value + 1\n    return value\n";

const EDITOR_KEYS = [
  "Control+s", "Control+f", "Control+h", "Control+z", "Control+y", "Control+Shift+z", "Control+a", "Control+d", "Control+/",
  "Alt+ArrowUp", "Alt+ArrowDown", "Shift+Alt+ArrowDown", "Control+Shift+k", "Control+Enter", "Control+Shift+Enter", "Control+l", "Control+g",
  "Control+]", "Control+[", "Control+Space", "Control+.", "F2", "F12", "Shift+F12", "Shift+Alt+f", "Control+Shift+[", "Control+Shift+]",
  "Tab", "Shift+Tab", "Control+Alt+ArrowDown", "Control+Shift+l", "Control+b", "Control+i", "Control+k", "Control+e", "Control+Shift+\\", "F3", "Control+u",
];
const APP_KEYS = [
  "Control+p", "Control+Shift+p", "F1", "Control+k", "Control+n", "Control+t", "Control+o", "Control+w", "Control+Shift+t", "Control+Tab", "Control+PageDown", "Control+PageUp",
  "Control+1", "Control+2", "Control+\\", "Control+b", "Control+j", "Control+`", "Control+,", "Control+Shift+e", "Control+Shift+f", "Control+Shift+g", "Control+Shift+o",
  "Control+Shift+m", "Control+g", "Control+=", "Control+-", "Control+0", "Alt+ArrowLeft", "Alt+ArrowRight", "Control+Shift+v", "Control+e", "Control+Shift+d", "Control+Shift+x", "Control+Shift+n", "F11",
];

interface Sig { doc: string; sel: string; focus: string; tabs: string; overlays: string; side: string }
const sig = (page: Page): Promise<Sig> => page.evaluate(() => {
  const ed = (window as unknown as { __atlas: { editor(): { text: string; vim: string; ranges: { from: number; to: number }[] } | null } }).__atlas.editor();
  const a = document.activeElement as HTMLElement | null;
  const vis = (s: string) => [...document.querySelectorAll<HTMLElement>(s)].filter((e) => e.offsetParent !== null || e.getClientRects().length).length;
  return {
    doc: ed ? ed.text : "?",
    sel: ed ? `${ed.vim}:` + ed.ranges.map((r) => `${r.from}-${r.to}`).join(",") : "?",
    focus: a ? `${a.tagName}.${String(a.className).split(" ").slice(0, 2).join(".")}${a.getAttribute("name") ? `[${a.getAttribute("name")}]` : ""}` : "",
    tabs: [...document.querySelectorAll(".dv-tab")].map((t) => (t.classList.contains("dv-active-tab") ? "*" : "") + (t.textContent ?? "").trim()).join("|"),
    overlays: ["[data-testid=palette]", ".cm-search", ".cm-tooltip", ".cm-panel", ".cm-lsp-rename-panel", ".cm-gotoLine", ".folded, .cm-foldPlaceholder"].map((s) => `${s}:${vis(s)}`).join(" "),
    side: `${document.querySelector("[data-testid=sidebar]")?.className ?? ""} groups:${document.querySelectorAll(".dv-groupview").length} zoom:${getComputedStyle(document.documentElement).getPropertyValue("--ui-scale")}/${getComputedStyle(document.documentElement).fontSize}`,
  };
});

function effect(a: Sig, b: Sig): string {
  const out: string[] = [];
  if (a.doc !== b.doc) out.push(`text ${JSON.stringify(diff(a.doc, b.doc))}`);
  if (a.sel !== b.sel) out.push(`selection ${a.sel}→${b.sel}`);
  if (a.focus !== b.focus) out.push(`focus→${b.focus}`);
  if (a.tabs !== b.tabs) out.push(`tabs→${b.tabs}`);
  if (a.overlays !== b.overlays) out.push(`overlays→${b.overlays.split(" ").filter((x, i) => x !== a.overlays.split(" ")[i]).join(" ")}`);
  if (a.side !== b.side) out.push(`shell→${b.side}`);
  return out.join("; ") || "NOTHING";
}
function diff(a: string, b: string): string {
  let i = 0; while (i < a.length && a[i] === b[i]) i++;
  let j = 0; while (j < a.length - i && j < b.length - i && a[a.length - 1 - j] === b[b.length - 1 - j]) j++;
  return `-${a.slice(i, a.length - j)} +${b.slice(i, b.length - j)}`.slice(0, 70);
}

async function setup(page: Page, file: string, vim: "normal" | "insert" | "off"): Promise<void> {
  await page.request.put("/api/file", { headers: H, data: { path: file, text: file.endsWith(".md") ? MD : PY } });
  await page.evaluate(() => { try { sessionStorage.clear(); } catch { /* first load */ } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  if (vim === "off") {
    await page.keyboard.press("Control+k");
    await page.keyboard.type("Toggle vim mode");
    await page.getByTestId("palette").getByText("Toggle vim mode").first().waitFor();
    await page.keyboard.press("Enter");
  }
  await page.keyboard.press("Control+p");
  await page.keyboard.type(file.split("/").pop()!);
  await page.getByTestId("palette").getByText(shownName(file)).first().waitFor();
  await page.keyboard.press("Enter");
  const word = file.endsWith(".md") ? "beta" : "value";
  await page.locator(".cm-line", { hasText: word }).first().getByText(word).first().dblclick();
  if (vim !== "off") { await page.keyboard.press("Escape"); if (vim === "insert") await page.keyboard.press("i"); }
  await page.waitForTimeout(file.endsWith(".py") ? 900 : 250);
}

test("probe: what the expected shortcuts do", async ({ page }) => {
  test.skip(!OUT, "set KEYPROBE_OUT to run the probe");
  test.setTimeout(30 * 60_000);
  const lines: string[] = [];
  const runs: [string, string, "normal" | "insert" | "off", string[]][] = [
    ["note, vim off", "notes/probe-a.md", "off", EDITOR_KEYS],
    ["note, vim INSERT", "notes/probe-b.md", "insert", EDITOR_KEYS],
    ["note, vim NORMAL", "notes/probe-c.md", "normal", EDITOR_KEYS],
    ["code, vim off", "scripts/probe_a.py", "off", EDITOR_KEYS],
    ["code, vim NORMAL", "scripts/probe_b.py", "normal", EDITOR_KEYS],
    ["app keys (note, vim NORMAL)", "notes/probe-d.md", "normal", APP_KEYS],
  ];
  for (const [name, file, vim, keys] of runs) {
    lines.push(`\n## ${name}`);
    for (const key of keys) {
      await setup(page, file, vim);
      const before = await sig(page);
      if (key === keys[0]) lines.push(`(start: focus ${before.focus}, sel ${before.sel}, doc ${before.doc.length} chars)`);
      await page.keyboard.press(key);
      await page.waitForTimeout(350);
      lines.push(`${key.padEnd(24)} ${effect(before, await sig(page))}`);
    }
    writeFileSync(OUT!, lines.join("\n") + "\n");
  }
});
