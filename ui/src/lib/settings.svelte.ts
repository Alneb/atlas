// Workspace settings (.atlas/config.toml via /api/config): loaded at start, reloaded when the
// file changes on disk, applied live (CSS variables, theme, editors, terminals).
import { errText } from "./text";
import { einkOn, inPhoneApp, setEinkRefresh } from "./eink";
import { api } from "./api";
import type { PropertiesView, WorkspaceConfig } from "./types";
import { app, paintTheme, toast } from "./state.svelte";
import { applyVscodeTheme, themeBase, type VscodeTheme } from "./vscode-theme";

export const settings = $state({
  config: null as WorkspaceConfig | null,
  /** Every setting's default (marks what you changed, powers Reset). */
  defaults: null as WorkspaceConfig | null,
  schema: null as Record<string, unknown> | null,
  path: ".atlas/config.toml",
  /** Detected choices per dotted setting path (fonts, snippet files, themes). */
  suggestions: {} as Record<string, { value: string; label: string }[]>,
});

type Listener = (c: WorkspaceConfig) => void;
const listeners = new Set<Listener>();
/** Called with the config now and on every change; returns an unsubscribe. */
export function onSettings(f: Listener): () => void {
  listeners.add(f);
  if (settings.config) f(settings.config);
  return () => listeners.delete(f);
}

const media = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: light)") : null;
media?.addEventListener("change", () => settings.config && apply(settings.config));
// the system's reduced motion counts as ui.motion = "instant" (a shortened animation that repeats forever would spin flat out)
const still = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
still?.addEventListener("change", () => settings.config && apply(settings.config));

let vscodeLoaded: string | null = null;
let vscode: VscodeTheme | null = null;

/** Fetches ui.vscode_theme when it changes; a broken theme falls back with a toast. */
async function syncVscodeTheme(path: string, force = false): Promise<void> {
  if (path === vscodeLoaded && !force) return;
  vscodeLoaded = path;
  vscode = null;
  if (path.trim()) {
    try { vscode = await api.vscodeTheme(); }
    catch (err) { toast("VS Code theme not applied", errText(err), "error"); }
  }
  if (settings.config) apply(settings.config);
}

let snippetSource = "";

function apply(c: WorkspaceConfig): void {
  const root = document.documentElement;
  const src = `${c.latex.snippets_file}\u0000${c.latex.variables_file}`;
  if (src !== snippetSource) { snippetSource = src; void import("./editor/latex-suite").then((m) => m.reloadSnippets()); }
  void syncVscodeTheme(c.ui.vscode_theme);
  // the theme setting decides dark or light ("system": the desktop's); a VS Code theme dresses the
  // side it was made for and leaves the other to Atlas's own palette
  const eink = einkOn(c.ui.eink);
  root.classList.toggle("eink", eink); // tokens.css / base.css: black on white, no motion
  setEinkRefresh(c.ui.eink_refresh); // eink.ts: when the whole screen is refreshed
  // the phone app follows the phone (the vault's theme is the desktop's: one vault, several screens)
  const theme = eink ? "light" : c.ui.theme === "system" || inPhoneApp() ? (media?.matches ? "light" : "dark") : c.ui.theme;
  applyVscodeTheme(vscode && themeBase(vscode) === theme ? vscode : null);
  paintTheme(theme);
  app.vimEnabled = c.vim;
  const px = (n: number) => `${n}px`;
  const font = (name: string, fallback: string) => (name.trim() ? `"${name.trim()}", ${fallback}` : fallback);
  root.style.setProperty("--ui-scale-set", String(c.ui.font_size / 14)); // base.css turns it into --ui-scale (larger on a phone)
  root.dataset.motion = eink || still?.matches ? "instant" : c.ui.motion; // base.css: "instant" turns transitions and fades off
  root.style.setProperty("--code-font", font(c.editor.code_font, "var(--font-mono)"));
  root.style.setProperty("--code-size", px(c.editor.code_font_size));
  root.style.setProperty("--prose-font", font(c.editor.prose_font, "var(--font-ui)"));
  root.style.setProperty("--prose-size", px(c.editor.prose_font_size));
  root.style.setProperty("--prose-line-height", String(c.editor.prose_line_height || 1.68));
  if (c.ui.ui_font.trim()) root.style.setProperty("--font-ui", font(c.ui.ui_font, "ui-sans-serif, system-ui, sans-serif"));
  else root.style.removeProperty("--font-ui");
  applyAccent(root, c.ui.accent.trim());
  root.style.setProperty("--prose-width", c.editor.prose_width ? `${c.editor.prose_width}ch` : "none");
  for (const f of listeners) f(c);
}

// The accent family derives from one colour; a VS Code theme's accent stays when none is set.
const ACCENT_VARS = ["--accent", "--accent-strong", "--accent-soft", "--accent-sel", "--link", "--tag-bg", "--tag-color"];
let accentSet = "";
function applyAccent(root: HTMLElement, hex: string): void {
  const ok = /^#[0-9a-f]{6}$/i.test(hex);
  if (!ok) {
    // only undo our own override: the same variables may come from a VS Code theme
    if (accentSet) { for (const v of ACCENT_VARS) root.style.removeProperty(v); accentSet = ""; void syncVscodeTheme(vscodeLoaded ?? "", true); }
    return;
  }
  accentSet = hex;
  const mix = (pct: number) => `color-mix(in srgb, ${hex} ${pct}%, transparent)`;
  root.style.setProperty("--accent", hex);
  root.style.setProperty("--accent-strong", `color-mix(in srgb, ${hex} 80%, var(--heading))`);
  root.style.setProperty("--accent-soft", mix(12));
  root.style.setProperty("--accent-sel", mix(26));
  root.style.setProperty("--link", hex);
  root.style.setProperty("--tag-bg", mix(13));
  root.style.setProperty("--tag-color", `color-mix(in srgb, ${hex} 80%, var(--heading))`);
}

// The last settings seen, per vault (a server keeps several under /v/<name>): with no connection the page
// still opens in its own look (e-ink, theme, fonts) instead of the bare defaults.
const cacheKey = () => `atlas.config:${location.pathname.match(/^\/v\/[^/]+/)?.[0] ?? ""}`;

export async function loadSettings(): Promise<void> {
  let d: Awaited<ReturnType<typeof api.config>>;
  try {
    d = await api.config();
    try { localStorage.setItem(cacheKey(), JSON.stringify(d)); } catch { /* full or blocked: only the offline look is lost */ }
  } catch (err) {
    let kept: typeof d | null = null;
    try { kept = JSON.parse(localStorage.getItem(cacheKey()) ?? "null"); } catch { /* none */ }
    if (!kept?.config) throw err;
    if (!settings.config) { settings.config = kept.config; apply(kept.config); } // looks right; writes still need the server
    throw err;
  }
  settings.schema = d.schema;
  settings.defaults = d.defaults;
  settings.path = d.path;
  settings.config = d.config;
  apply(d.config);
}

/** Mutate a copy, write it (only changed keys reach the file), apply on success. */
// Writes run one after another, each on the result of the previous: two quick toggles used to
// both start from the same old config, so "on, off" saved "off" twice (found by the UX audit).
let queue: Promise<void> = Promise.resolve();
export function updateSettings(mut: (c: WorkspaceConfig) => void): Promise<void> {
  const run = queue.then(async () => {
    if (!settings.config) return;
    const next = structuredClone($state.snapshot(settings.config)) as WorkspaceConfig;
    mut(next);
    await api.putConfig(next);
    settings.config = next;
    apply(next);
  });
  queue = run.catch(() => {}); // one failed write must not block the next
  return run;
}

/** Settings writes from buttons/keys: failures become a toast instead of an unhandled rejection. */
function change(label: string, mut: (c: WorkspaceConfig) => void): void {
  updateSettings(mut).catch((err) => toast(`${label}: not saved`, errText(err), "error"));
}
export const toggleTheme = () => change("Theme", (c) => { c.ui.theme = app.theme === "dark" ? "light" : "dark"; });
export const toggleVim = () => change("Vim mode", (c) => { c.vim = !c.vim; });
export const setTerminalPosition = (p: "bottom" | "right") => change("Terminal position", (c) => { c.terminal.position = p; });
export const setPropertiesView = (v: PropertiesView) => change("Properties", (c) => { c.editor.properties = v; });

// Zoom: the four text sizes move together, each inside its own range (config.rs); reset = the defaults.
const SIZES: { get: (c: WorkspaceConfig) => number; set: (c: WorkspaceConfig, n: number) => void; min: number; max: number }[] = [
  { get: (c) => c.ui.font_size, set: (c, n) => { c.ui.font_size = n; }, min: 10, max: 22 },
  { get: (c) => c.editor.code_font_size, set: (c, n) => { c.editor.code_font_size = n; }, min: 9, max: 28 },
  { get: (c) => c.editor.prose_font_size, set: (c, n) => { c.editor.prose_font_size = n; }, min: 10, max: 28 },
  { get: (c) => c.terminal.font_size, set: (c, n) => { c.terminal.font_size = n; }, min: 9, max: 24 },
];
/** `step` px larger or smaller; 0 = back to the default sizes. */
export const zoom = (step: -1 | 0 | 1) => change("Zoom", (c) => {
  const d = settings.defaults;
  for (const s of SIZES) s.set(c, step === 0 && d ? s.get(d) : Math.min(s.max, Math.max(s.min, s.get(c) + step)));
});

/** Detected choices (fonts, snippet files, themes) — slow to compute, fetched by Settings only. */
export async function loadSuggestions(): Promise<void> {
  settings.suggestions = await api.configSuggestions();
}
