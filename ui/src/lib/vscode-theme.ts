// Dress Atlas in a VS Code color theme: `colors` → Atlas CSS tokens, `tokenColors` → --syn-*.
// Every token lists VS Code keys in fallback order, so themes that omit a key degrade gracefully.
type Rule = { scope?: string | string[]; settings?: { foreground?: string; fontStyle?: string } };
export type VscodeTheme = { name?: string; type?: string; colors?: Record<string, string>; tokenColors?: Rule[] };

const UI: Record<string, string[]> = {
  "--bg-app": ["activityBar.background", "titleBar.activeBackground", "sideBar.background"],
  "--bg": ["editor.background"],
  "--bg-alt": ["sideBar.background", "editorGroupHeader.tabsBackground", "panel.background"],
  "--bg-elev": ["input.background", "dropdown.background", "editorWidget.background"],
  "--bg-hover": ["list.hoverBackground"],
  "--bg-active": ["list.activeSelectionBackground"],
  "--text": ["editor.foreground", "foreground"],
  "--heading": ["editor.foreground", "foreground"],
  "--text-muted": ["descriptionForeground", "tab.inactiveForeground"],
  "--text-faint": ["editorLineNumber.foreground"],
  "--accent": ["focusBorder", "tab.activeBorder", "button.background"],
  "--accent-strong": ["editorLineNumber.activeForeground", "textLink.foreground", "focusBorder"],
  "--accent-soft": ["list.hoverBackground"],
  "--accent-sel": ["editor.selectionBackground"],
  "--border": ["editorGroup.border", "panel.border", "sideBar.border"],
  "--border-strong": ["input.border", "contrastBorder", "editorGroup.border"],
  "--link": ["textLink.foreground"],
  "--code-bg": ["textCodeBlock.background", "sideBar.background"],
  "--term-bg": ["terminal.background", "panel.background"],
  "--term-black": ["terminal.ansiBlack"],
  "--scrollbar": ["scrollbarSlider.background"],
  "--scrollbar-hover": ["scrollbarSlider.hoverBackground", "scrollbarSlider.activeBackground"],
  "--red": ["terminal.ansiRed", "errorForeground"],
  "--green": ["terminal.ansiGreen"],
  "--yellow": ["terminal.ansiYellow"],
  "--purple": ["terminal.ansiMagenta"],
  "--cyan": ["terminal.ansiCyan"],
  // the terminal's 16 colours, one to one
  ...Object.fromEntries(["Black", "Red", "Green", "Yellow", "Blue", "Magenta", "Cyan", "White"].flatMap((c) => [
    [`--ansi-${c.toLowerCase()}`, [`terminal.ansi${c}`]],
    [`--ansi-bright-${c.toLowerCase()}`, [`terminal.ansiBright${c}`]],
  ])),
};

// Atlas syntax role → the TextMate scope a VS Code theme colours for it.
const SYN: Record<string, string> = {
  keyword: "keyword.control", string: "string.quoted", number: "constant.numeric", comment: "comment",
  function: "entity.name.function", type: "entity.name.type", property: "variable.other.property",
  variable: "variable.other.readwrite", operator: "keyword.operator", meta: "entity.other.attribute-name",
  tag: "entity.name.tag", punctuation: "punctuation", constant: "constant.language.boolean",
};

/** VS Code semantics: a rule selector matches when it is a dot-prefix of the scope; longest wins. */
function ruleFor(rules: Rule[], scope: string): Rule["settings"] | undefined {
  let best: Rule["settings"]; let bestLen = -1;
  for (const r of rules) {
    const sels = typeof r.scope === "string" ? r.scope.split(",") : r.scope ?? [];
    for (const raw of sels) {
      const s = raw.trim();
      if ((scope === s || scope.startsWith(s + ".")) && s.length > bestLen && r.settings?.foreground) { best = r.settings; bestLen = s.length; }
    }
  }
  return best;
}

// --- contrast: imported themes often use near-background greys for line numbers etc., which made
// icons and labels that Atlas draws with those tokens invisible. Mix toward --text until readable.
type RGB = [number, number, number];
function hex(c: string | undefined, under: RGB = [0, 0, 0]): RGB | null {
  const m = /^#([0-9a-f]{3,8})$/i.exec((c ?? "").trim());
  if (!m) return null;
  let h = m[1];
  if (h.length <= 4) h = [...h].map((x) => x + x).join("");
  const n = [0, 2, 4, 6].map((i) => parseInt(h.slice(i, i + 2) || "ff", 16));
  const a = n[3] / 255; // alpha blends over what is underneath
  return [0, 1, 2].map((i) => n[i] * a + under[i] * (1 - a)) as RGB;
}
const lum = ([r, g, b]: RGB) => {
  const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrast = (a: RGB, b: RGB) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const toHex = (c: RGB) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
/** `fg` mixed toward `toward` in 5 % steps until its contrast on `bg` reaches `min`. */
export function readable(fg: string, bg: string, toward: string, min: number): string {
  const B = hex(bg), T = hex(toward, B ?? [0, 0, 0]), F = hex(fg, B ?? [0, 0, 0]);
  if (!B || !T || !F) return fg;
  for (let k = 0; k <= 20; k++) {
    const mix = F.map((v, i) => v + (T[i] - v) * (k / 20)) as RGB;
    if (contrast(mix, B) >= min) return k === 0 ? fg : toHex(mix);
  }
  return toward;
}
const MIN_CONTRAST: Record<string, number> = { "--text": 7, "--heading": 7, "--text-muted": 4.5, "--text-faint": 3.8, "--scrollbar": 2.2, "--scrollbar-hover": 3.5 };

let applied: string[] = [];

/** Whether a theme is a dark or a light one (its `type`; VS Code's default is dark). */
export const themeBase = (t: VscodeTheme): "dark" | "light" => (/light/i.test(t.type ?? "") ? "light" : "dark");

/** Applies (or with null, removes) the theme's colours. */
export function applyVscodeTheme(t: VscodeTheme | null): void {
  const root = document.documentElement.style;
  for (const k of applied) root.removeProperty(k);
  applied = [];
  if (!t) return;
  const set = (k: string, v: string | undefined) => { if (v) { root.setProperty(k, v); applied.push(k); } };
  const c = t.colors ?? {};
  const bg = c["editor.background"] ?? "#000000", text = c["editor.foreground"] ?? c["foreground"] ?? "#ffffff";
  for (const [token, keys] of Object.entries(UI)) {
    const raw = keys.map((k) => c[k]).find(Boolean);
    const min = MIN_CONTRAST[token];
    set(token, raw && min ? readable(raw, bg, text, min) : raw);
  }
  // text ON the accent (primary buttons): the theme's button text if it reads, else dark or light
  const accent = hex(UI["--accent"].map((k) => c[k]).find(Boolean), hex(bg) ?? [0, 0, 0]);
  if (accent) {
    const own = hex(c["button.foreground"], accent);
    const best = contrast([10, 12, 16], accent) >= contrast([255, 255, 255], accent) ? "#0a0c10" : "#ffffff";
    set("--accent-fg", own && contrast(own, accent) >= 4.5 ? c["button.foreground"] : best);
  }
  for (const [role, scope] of Object.entries(SYN)) {
    const s = ruleFor(t.tokenColors ?? [], scope);
    set(`--syn-${role}`, s?.foreground);
    const fs = s?.fontStyle ?? "";
    set(`--syn-${role}-weight`, fs.includes("bold") ? "700" : undefined);
    set(`--syn-${role}-style`, fs.includes("italic") ? "italic" : undefined);
  }
}
