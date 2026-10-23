// Key chords: "Ctrl+Alt+K" ⇄ KeyboardEvent, matched on physical `code` so Spanish/other
// layouts (where ` is º, Ctrl+Alt is AltGr…) still hit the same keys.
// A chord named by its character ("Ctrl+Plus", "Ctrl+Minus") matches the typed character instead,
// with or without Shift: + and - sit on different keys in every layout.
export interface Chord { ctrl: boolean; alt: boolean; shift: boolean; meta: boolean; code: string; char?: string }

const CHARS: Record<string, string> = { plus: "+", minus: "-" };

const NAMED: Record<string, string> = {
  "`": "Backquote", "º": "Backquote", esc: "Escape", escape: "Escape", enter: "Enter", tab: "Tab",
  space: "Space", ",": "Comma", ".": "Period", "/": "Slash", ";": "Semicolon", "'": "Quote",
  "[": "BracketLeft", "]": "BracketRight", "-": "Minus", "=": "Equal", "\\": "Backslash",
  up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight",
};

export function parseChord(spec: string): Chord | null {
  const parts = spec.split("+").map((p) => p.trim()).filter(Boolean);
  // "Ctrl++" style: a trailing empty part means the key itself was "+"
  if (spec.endsWith("++")) parts.push("=");
  const c: Chord = { ctrl: false, alt: false, shift: false, meta: false, code: "" };
  for (const p of parts) {
    const l = p.toLowerCase();
    if (l === "ctrl" || l === "control" || l === "mod") c.ctrl = true;
    else if (l === "alt" || l === "option") c.alt = true;
    else if (l === "shift") c.shift = true;
    else if (l === "meta" || l === "cmd" || l === "super") c.meta = true;
    else if (/^[a-z]$/.test(l)) c.code = `Key${l.toUpperCase()}`;
    else if (/^[0-9]$/.test(l)) c.code = `Digit${l}`;
    else if (/^f\d{1,2}$/.test(l)) c.code = l.toUpperCase();
    else if (CHARS[l]) c.char = CHARS[l];
    else if (NAMED[l]) c.code = NAMED[l];
    else return null;
  }
  return c.code || c.char ? c : null;
}

// The desktop app's WebKitGTK can leave `metaKey` false while Super is down (Wayland reports it as
// the Super modifier, not Meta), so a Super key seen going down counts too, until it goes up or the
// window loses the keyboard (a desktop shortcut taking Super+… away blurs the window).
let superHeld = false;
const SUPER_KEY = /^(Meta|OS|Super|Hyper)(Left|Right)?$/;
if (typeof window !== "undefined") {
  const track = (down: boolean) => (e: KeyboardEvent) => { if (SUPER_KEY.test(e.key) || SUPER_KEY.test(e.code)) superHeld = down; };
  window.addEventListener("keydown", track(true), true);
  window.addEventListener("keyup", track(false), true);
  window.addEventListener("blur", () => { superHeld = false; });
}

/** Is Super (= Meta, Cmd) down for this key press? Use this, never `e.metaKey` alone. */
export function superOf(e: KeyboardEvent | MouseEvent): boolean {
  return e.metaKey || superHeld || e.getModifierState?.("Super") || e.getModifierState?.("OS") || false;
}

export function matches(c: Chord, e: KeyboardEvent): boolean {
  const meta = superOf(e);
  if (c.char) return e.key === c.char && e.ctrlKey === c.ctrl && e.altKey === c.alt && meta === c.meta;
  return e.code === c.code && e.ctrlKey === c.ctrl && e.altKey === c.alt && e.shiftKey === c.shift && meta === c.meta;
}

/** Pretty label, e.g. "Ctrl Alt K". */
export function chordLabel(spec: string): string[] {
  return spec.split("+").map((p) => p.trim()).filter(Boolean).map((p) => (p.length === 1 ? p.toUpperCase() : p[0].toUpperCase() + p.slice(1)));
}

const CODE_NAME: Record<string, string> = {
  Backquote: "`", Escape: "Esc", Enter: "Enter", Tab: "Tab", Space: "Space", Comma: ",", Period: ".", Slash: "/",
  Semicolon: ";", Quote: "'", BracketLeft: "[", BracketRight: "]", Minus: "-", Equal: "=", Backslash: "\\",
  ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right",
};

/** The chord a key press spells, in the same "Ctrl+Alt+K" form parseChord reads; null for a bare modifier. */
export function chordFromEvent(e: KeyboardEvent): string | null {
  const c = e.code;
  const key = /^Key[A-Z]$/.test(c) ? c.slice(3) : /^Digit\d$/.test(c) ? c.slice(5) : /^F\d{1,2}$/.test(c) ? c : CODE_NAME[c];
  if (!key) return null;
  const mods = [e.ctrlKey && "Ctrl", e.altKey && "Alt", e.shiftKey && "Shift", superOf(e) && "Meta"].filter(Boolean);
  return [...mods, key].join("+");
}

/** Same chord? (spelling-insensitive: "ctrl+k" = "Ctrl+K") */
export function sameChord(a: string, b: string): boolean {
  const x = parseChord(a), y = parseChord(b);
  return !!x && !!y && x.code === y.code && x.char === y.char && x.ctrl === y.ctrl && x.alt === y.alt && x.shift === y.shift && x.meta === y.meta;
}
