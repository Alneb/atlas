// Workspace settings (.atlas/config.toml via /api/config): loaded at start, reloaded when the
// file changes on disk, applied live (CSS variables, theme, editors, terminals).
import { errText } from "./text";
import { load, save } from "./prefs";
import { einkOn, inPhoneApp, setEinkRefresh } from "./eink";
import { api } from "./api";
import type { PropertiesView, WorkspaceConfig } from "./types";
import { app, paintTheme, toast } from "./state.svelte";

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
// ui.contrast = "system": the desktop's "more contrast"
const more = typeof matchMedia === "function" ? matchMedia("(prefers-contrast: more)") : null;
more?.addEventListener("change", () => settings.config && apply(settings.config));

function apply(c: WorkspaceConfig): void {
  const root = document.documentElement;
  // the theme setting decides dark or light ("system": the desktop's); the palette, its colours on either side
  const eink = einkOn(c.ui.eink);
  root.classList.toggle("eink", eink); // tokens.css / base.css: black on white, no motion
  setEinkRefresh(c.ui.eink_refresh); // eink.ts: when the whole screen is refreshed
  // the phone app follows the phone (the vault's theme is the desktop's: one vault, several screens)
  const theme = eink ? "light" : c.ui.theme === "system" || inPhoneApp() ? (media?.matches ? "light" : "dark") : c.ui.theme;
  paintTheme(theme);
  root.dataset.palette = (theme === "dark" && c.ui.palette_dark) || c.ui.palette; // palettes.css: the night's own, if set
  const high = !eink && (c.ui.contrast === "high" || (c.ui.contrast === "system" && !!more?.matches));
  if (high) root.dataset.contrast = "high"; // contrast.css
  else delete root.dataset.contrast;
  root.dataset.shape = c.ui.shape; // shape-paper.css
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
  applyAccent(root, high ? phosphorAccent(root, c.ui.accent.trim(), theme === "light") : c.ui.accent.trim());
  root.style.setProperty("--prose-width", c.editor.prose_width ? `${c.editor.prose_width}ch` : "none");
  for (const f of listeners) f(c);
}

// The accent family derives from one colour; the palette's accent stays when none is set. A chosen accent also tints
// what is selected or in front (rows, the open tab: --bg-active), so it shows beyond links and a 2 px bar, and the
// text on it is black or white, whichever reads (a yellow accent had white text on it).
const ACCENT_VARS = ["--accent", "--accent-strong", "--accent-soft", "--accent-sel", "--link", "--tag-bg", "--tag-color", "--bg-active", "--accent-fg"];
/** WCAG relative luminance of `#rrggbb`. */
const luminance = (hex: string): number => {
  const lin = (i: number) => { const c = parseInt(hex.slice(i, i + 2), 16) / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(1) + 0.7152 * lin(3) + 0.0722 * lin(5);
};
/** Black or white on `hex`, whichever reads (threshold where both contrasts meet). */
const onColour = (hex: string): string => (luminance(hex) > 0.179 ? "#0b0d12" : "#ffffff");
const toHex = (r: number, g: number, b: number) => "#" + [r, g, b].map((x) => Math.round(Math.max(0, Math.min(1, x)) * 255).toString(16).padStart(2, "0")).join("");
/** `#rrggbb` from hue (degrees), saturation and lightness (0–1). */
const hsl = (h: number, s: number, l: number): string => {
  const k = (n: number) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return toHex(f(0), f(8), f(4));
};
/** The hue and saturation of a CSS colour as the browser resolves it (any syntax a palette uses). */
const hueOf = (css: string): { h: number; s: number } | null => {
  const m = css.match(/rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/) ?? css.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return null;
  const [r, g, b] = m.slice(1, 4).map((x) => (css.startsWith("#") ? parseInt(x, 16) : Number(x)) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d === 0) return { h: 0, s: 0 };
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: d / (1 - Math.abs(max + min - 1)) };
};
/** High contrast's accent: the chosen one, else the scheme's, at full saturation and as bright (by night) or deep
 *  (by day) as it must be to stand at 8:1 on black or 7:1 on white — the hue kept, so each scheme stays itself.
 *  A grey accent (graphite) stays grey: pure white or black. */
function phosphorAccent(root: HTMLElement, chosen: string, light: boolean): string {
  let base = chosen;
  if (!/^#[0-9a-f]{6}$/i.test(base)) {
    for (const v of ACCENT_VARS) root.style.removeProperty(v); // read the palette's own, not the last inline one
    accentSet = "";
    base = getComputedStyle(root).getPropertyValue("--accent").trim();
  }
  const hs = hueOf(base);
  if (!hs) return chosen;
  const s = hs.s < 0.12 ? 0 : 1;
  for (let i = 0; i <= 50; i++) {
    const l = light ? 0.5 - i * 0.01 : 0.5 + i * 0.01;
    const hex = hsl(hs.h, s, l), y = luminance(hex);
    if (light ? 1.05 / (y + 0.05) >= 7 : (y + 0.05) / 0.05 >= 8) return hex;
  }
  return light ? "#000000" : "#ffffff";
}
let accentSet = "";
function applyAccent(root: HTMLElement, hex: string): void {
  const ok = /^#[0-9a-f]{6}$/i.test(hex);
  if (!ok) {
    if (accentSet) { for (const v of ACCENT_VARS) root.style.removeProperty(v); accentSet = ""; }
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
  root.style.setProperty("--bg-active", `color-mix(in srgb, ${hex} 16%, var(--bg))`);
  root.style.setProperty("--accent-fg", onColour(hex));
}

// The last settings seen, per vault (a server keeps several under /v/<name>): with no connection the page
// still opens in its own look (e-ink, theme, fonts) instead of the bare defaults.
const cacheKey = () => `atlas.config:${location.pathname.match(/^\/v\/[^/]+/)?.[0] ?? ""}`;

export async function loadSettings(): Promise<void> {
  let d: Awaited<ReturnType<typeof api.config>>;
  try {
    d = await api.config();
    save(cacheKey(), d); // full or blocked: only the offline look is lost
  } catch (err) {
    const kept = load<typeof d | null>(cacheKey(), null);
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
export function change(label: string, mut: (c: WorkspaceConfig) => void): void {
  updateSettings(mut).catch((err) => toast(`${label}: not saved`, errText(err), "error"));
}
export const toggleTheme = () => change("Theme", (c) => { c.ui.theme = app.theme === "dark" ? "light" : "dark"; });
export const toggleVim = () => change("Vim mode", (c) => { c.vim = !c.vim; });
export const setTerminalPosition = (p: "bottom" | "right") => change("Terminal position", (c) => { c.terminal.position = p; });
export const setPropertiesView = (v: PropertiesView) => change("Properties", (c) => { c.editor.properties = v; });

/** Detected choices (fonts, snippet files, themes) — slow to compute, fetched by Settings only. */
export async function loadSuggestions(): Promise<void> {
  settings.suggestions = await api.configSuggestions();
}
