// UX audit harness: a journey is a user goal split into named steps. Each step is timed, counts the
// keys and clicks it cost, is screenshotted, and runs a page audit (layout, contrast, labels, errors).
// A failing step does not end the journey — it is recorded (`broken` for a feature Atlas has,
// `missing` for one a user would expect but Atlas lacks), so one run yields the whole gap list.
import { test, type Locator, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const OUT = process.env.ATLAS_UX_OUT ?? join(process.cwd(), "ux-report");

export type Status = "ok" | "slow" | "broken" | "missing" | "present" | "skipped";
export interface Finding { rule: string; target: string; detail: string }
export interface StepResult {
  name: string; why?: string; want: boolean; status: Status; ms: number; budget: number;
  keys: number; clicks: number; error?: string; shot: string; findings: Finding[]; console: string[];
}
export interface JourneyResult {
  name: string; goal: string; steps: StepResult[];
  /** Pane kinds seen open during the journey (from the UI's own state report). */
  kinds: string[];
  /** Command ids this journey ran on purpose (the command tour). */
  commands: string[];
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50);

export class User {
  keys = 0;
  clicks = 0;
  /** Time spent simulating keystrokes: not the app's fault, so steps report the waiting time. */
  private typingMs = 0;
  private console: string[] = [];
  constructor(readonly page: Page, private result: JourneyResult) {
    page.on("console", (m) => { if (m.type() === "error") this.console.push(m.text().slice(0, 200)); });
    page.on("pageerror", (e) => this.console.push(`pageerror: ${String(e.message).slice(0, 200)}`));
    page.on("response", (r) => { if (r.status() >= 500) this.console.push(`HTTP ${r.status()} ${new URL(r.url()).pathname}`); });
  }

  /** Pane kinds open right now, as the UI reports them to the core (`/api/ui/state`). */
  async trackKinds() {
    const st = await this.page.request.get("/api/ui/state", { headers: { "x-atlas": "1" } }).then((r) => r.json()).catch(() => null);
    for (const p of [...(st?.open ?? []), ...(st?.active ? [st.active] : [])]) if (!this.result.kinds.includes(p.kind)) this.result.kinds.push(p.kind);
  }

  /** A step deliberately not run (recorded with its reason so coverage stays honest). */
  skip(name: string, why: string) {
    this.result.steps.push({ name, why, want: false, status: "skipped", ms: 0, budget: 0, keys: 0, clicks: 0, shot: "", findings: [], console: [] });
  }

  ranCommand(id: string) { if (!this.result.commands.includes(id)) this.result.commands.push(id); }

  async press(key: string) { this.keys++; await this.page.keyboard.press(key); }
  async type(text: string) {
    const t = Date.now();
    this.keys += text.length;
    await this.page.keyboard.type(text, { delay: 12 });
    this.typingMs += Date.now() - t;
  }
  async click(l: Locator) { this.clicks++; await l.click(); }
  /** Type into the focused editor as a vim user would: back to insert mode first if needed. */
  async write(text: string) {
    const mode = (await this.page.getByTestId("vim-mode").textContent().catch(() => "")) ?? "";
    if (/NORMAL|VISUAL/.test(mode)) await this.press("A");
    await this.type(text);
  }
  /** Open a file the way a user does: Ctrl+P, type, Enter. */
  async openFile(name: string) {
    await this.press("Control+p");
    await this.type(name);
    await this.page.getByTestId("palette").getByText(name).first().waitFor({ timeout: 4000 });
    await this.press("Enter");
  }

  /**
   * One user-visible step. `budget` (ms) is how long it may take before it counts as slow;
   * `want: true` marks a feature a user would expect that Atlas may not have yet.
   */
  async step(name: string, opts: { budget?: number; want?: boolean; why?: string }, fn: () => Promise<void>) {
    const budget = opts.budget ?? 1000;
    const k0 = this.keys, c0 = this.clicks, typed0 = this.typingMs;
    this.console = [];
    const t0 = Date.now();
    let error: string | undefined;
    try { await fn(); } catch (e) {
      // eslint-disable-next-line no-control-regex -- Playwright colours its messages
      error = String(e instanceof Error ? e.message : e).replace(/\u001b\[[0-9;]*m/g, "").split("\n").find((l) => l.trim()) ?? "failed";
    }
    const ms = Date.now() - t0 - (this.typingMs - typed0); // time spent waiting on Atlas
    await this.page.waitForTimeout(150); // let the frame settle before judging it
    const findings = await this.page.evaluate(audit).catch(() => [] as Finding[]);
    await this.trackKinds();
    const shot = `${slug(this.result.name)}-${String(this.result.steps.length + 1).padStart(2, "0")}-${slug(name)}.png`;
    await this.page.screenshot({ path: join(OUT, "shots", shot) }).catch(() => {});
    const want = !!opts.want;
    const status: Status = error ? (want ? "missing" : "broken") : want ? "present" : ms > budget ? "slow" : "ok";
    this.result.steps.push({ name, why: opts.why, want, status, ms, budget, keys: this.keys - k0, clicks: this.clicks - c0, error, shot, findings, console: this.console });
  }
}

/** Declares a journey; its results land in OUT/results/<journey>.json for the report. */
export function journey(name: string, goal: string, body: (u: User) => Promise<void>) {
  test(name, async ({ page }) => {
    test.setTimeout(900_000); // the command tour runs every workspace script
    mkdirSync(join(OUT, "shots"), { recursive: true });
    mkdirSync(join(OUT, "results"), { recursive: true });
    const result: JourneyResult = { name, goal, steps: [], kinds: [], commands: [] };
    const u = new User(page, result);
    try { await body(u); }
    finally { writeFileSync(join(OUT, "results", `${slug(name)}.json`), JSON.stringify(result, null, 1)); }
  });
}

/** In-page audit (runs in the browser): what a user would trip over on the current screen. */
function audit(): Finding[] {
  const out: { rule: string; target: string; detail: string }[] = [];
  const visible = (el: Element) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1 || r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) return false;
    const s = getComputedStyle(el);
    if (s.visibility === "hidden" || s.display === "none") return false;
    // shown-on-hover controls (opacity 0 on an ancestor) are not on screen yet
    let o = 1;
    for (let e: Element | null = el; e && o > 0.05; e = e.parentElement) o *= Number(getComputedStyle(e).opacity);
    return o > 0.05;
  };
  const where = (el: Element): string => {
    const pane = el.closest(".dv-groupview")?.querySelector(".dv-tab.dv-active-tab")?.textContent?.trim();
    if (el.tagName.toLowerCase() === "svg" && el.parentElement) return `svg in ${where(el.parentElement)}`;
    const cls = (el.getAttribute("class") ?? "").split(/\s+/).filter(Boolean).slice(0, 2).join(".");
    const text = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
    return `${pane ? `[${pane}] ` : ""}${el.tagName.toLowerCase()}${cls ? "." + cls : ""}${text ? ` "${text}"` : ""}`;
  };
  // colour maths (WCAG relative luminance)
  const rgba = (c: string) => {
    const n = (c.match(/[\d.]+/g) ?? ["0", "0", "0", "0"]).map(Number);
    // `color(srgb r g b / a)` (newer engines) carries 0–1 channels; rgb() carries 0–255
    return c.startsWith("color(") ? [n[0] * 255, n[1] * 255, n[2] * 255, n[3] ?? 1] : n;
  };
  const lum = ([r, g, b]: number[]) => {
    const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const bgOf = (el: Element | null): number[] => {
    for (let e = el; e; e = e.parentElement) {
      const c = rgba(getComputedStyle(e).backgroundColor);
      if ((c[3] ?? 1) > 0.5) return c;
    }
    return [255, 255, 255, 1];
  };
  const ratio = (fg: number[], bg: number[]) => { const a = lum(fg), b = lum(bg); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };

  const de = document.documentElement;
  if (de.scrollWidth > innerWidth + 1 || de.scrollHeight > innerHeight + 1) out.push({ rule: "window-scrollbars", target: "page", detail: `${de.scrollWidth}×${de.scrollHeight} in ${innerWidth}×${innerHeight}` });

  for (const el of document.querySelectorAll("button, [role=button], [role=tab], a[href], input, select, textarea")) {
    if (!visible(el) || el.closest(".cm-editor, .xterm")) continue;
    const labels = (el as HTMLInputElement).labels;
    const label = el.getAttribute("aria-label") || el.getAttribute("title") || (el.textContent ?? "").trim() || el.getAttribute("placeholder")
      || (labels && labels.length ? "label" : "");
    if (!label) out.push({ rule: "unlabeled-control", target: where(el), detail: "no text, title or aria-label (no tooltip, invisible to screen readers)" });
    const r = el.getBoundingClientRect();
    if ((r.width < 20 || r.height < 18) && !el.closest("p, li, td, .cm-editor")) out.push({ rule: "small-target", target: where(el), detail: `${Math.round(r.width)}×${Math.round(r.height)} px` });
  }
  for (const el of document.querySelectorAll("select")) {
    // WebKitGTK draws a native <select>'s popup as a light GTK list, ignoring the theme (user report)
    if (visible(el)) out.push({ rule: "native-select", target: where(el), detail: "opens an unthemed native list in the desktop app" });
  }
  let n = 0;
  for (const el of document.querySelectorAll("body *")) {
    if (n > 1500) break;
    const hasText = [...el.childNodes].some((c) => c.nodeType === 3 && (c.textContent ?? "").trim().length > 1);
    const isIcon = el.tagName === "svg" && !el.parentElement?.closest("svg");
    // disabled controls are exempt from contrast rules (WCAG 1.4.3)
    if ((!hasText && !isIcon) || !visible(el) || el.closest(".xterm, .pdf-page, canvas, :disabled, [aria-disabled=true]")) continue;
    n++;
    const s = getComputedStyle(el);
    const fg = rgba(isIcon ? (s.stroke !== "none" && s.stroke ? s.stroke : s.color) : s.color);
    // translucent text/opacity: blend into the background first, then compare
    let a = (fg[3] ?? 1) * Number(s.opacity);
    for (let e = el.parentElement; e && a > 0.05; e = e.parentElement) a *= Number(getComputedStyle(e).opacity);
    const bg = isIcon ? bgOf(el.parentElement ?? el) : bgOf(el); // text sits on its own element's fill (buttons)
    const seen = [0, 1, 2].map((i) => fg[i] * a + bg[i] * (1 - a));
    const r = ratio(seen, bg);
    const min = isIcon ? 2.5 : 3;
    if (r < min) out.push({ rule: isIcon ? "faint-icon" : "low-contrast-text", target: where(el), detail: `contrast ${r.toFixed(2)} (< ${min})` });
    if (hasText && parseFloat(s.fontSize) < 10.5) out.push({ rule: "tiny-text", target: where(el), detail: `${s.fontSize}` });
    if (hasText && el.clientWidth > 2 && s.overflow === "hidden" && s.textOverflow !== "ellipsis" && el.scrollWidth > el.clientWidth + 2 && s.whiteSpace === "nowrap")
      out.push({ rule: "clipped-text", target: where(el), detail: `${el.scrollWidth}px of text in ${el.clientWidth}px, cut without an ellipsis` });
  }
  return out;
}
