// highlight.js: one highlighter for reading-view fences AND live-preview fences, so both agree.
// Fetched on first use, off the start's path: a fence drawn before it arrived is plain, then drawn again (lazy-render.ts).
import { onRendererArrived, rendererArrived } from "./lazy-render";
import { createCodeHighlighter } from "../vendor/obsidian-web/highlight-code.js";

type Hljs = typeof import("highlight.js/lib/common").default;
let hljs: Hljs | null = null;
let lazy: Hljs | null = null;
let loading = false;

/** Fetch highlight.js (once); what drew plain draws again when it lands. */
export function loadHighlight(): void {
  if (loading) return;
  loading = true;
  void import("./highlight-langs").then((m) => {
    hljs = m.hljs;
    lazy = asking(m.hljs);
    rendererArrived();
  }, () => { loading = false; });
}

/** `fn` each time highlight.js or one of its languages arrives (to draw again what was plain). */
export const onHighlightLanguage = onRendererArrived;

// every other language highlight.js knows (~190), loaded the
// first time a fence names it — the page never carries them all; what drew it plain draws again (onHighlightLanguage)
const more = import.meta.glob<{ default: Parameters<Hljs["registerLanguage"]>[1] }>(["../../node_modules/highlight.js/es/languages/*.js", "!**/*.js.js"]);
const asked = new Set<string>();

function want(name: string): void {
  const load = more[`../../node_modules/highlight.js/es/languages/${name}.js`];
  if (!load || asked.has(name)) return;
  asked.add(name);
  void load().then((m) => { hljs!.registerLanguage(name, m.default); rendererArrived(); }, () => {});
}

/** The highlighter, asking for a language it does not know yet. */
const asking = (h: Hljs): Hljs => new Proxy(h, {
  get(target, key, receiver) {
    if (key === "getLanguage") return (n: string) => { const l = target.getLanguage(n); if (!l && n) want(n.trim().toLowerCase()); return l; };
    return Reflect.get(target, key, receiver);
  },
});

export function highlightToHtml(code: string, lang: string): string | null {
  const name = lang.trim().toLowerCase();
  if (!name) return null;
  if (!hljs) { loadHighlight(); return null; }
  if (!hljs.getLanguage(name)) { want(name); return null; }
  try {
    return hljs.highlight(code, { language: name, ignoreIllegals: true }).value;
  } catch {
    return null;
  }
}

/** Range-producing highlighter for live preview (memoised; runs per keystroke). */
export const highlightCode = createCodeHighlighter(() => { if (!lazy) loadHighlight(); return lazy; });
