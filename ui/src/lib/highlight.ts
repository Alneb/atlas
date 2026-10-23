// highlight.js: one highlighter for reading-view fences AND live-preview fences, so both agree.
import hljs from "highlight.js/lib/common";
import latex from "highlight.js/lib/languages/latex";
import julia from "highlight.js/lib/languages/julia";
import fortran from "highlight.js/lib/languages/fortran";
import nix from "highlight.js/lib/languages/nix";
import dockerfile from "highlight.js/lib/languages/dockerfile";
import haskell from "highlight.js/lib/languages/haskell";
import matlab from "highlight.js/lib/languages/matlab";
import cmake from "highlight.js/lib/languages/cmake";
import { createCodeHighlighter } from "../vendor/obsidian-web/highlight-code.js";

hljs.registerLanguage("latex", latex);
hljs.registerLanguage("julia", julia);
hljs.registerLanguage("fortran", fortran);
hljs.registerLanguage("nix", nix);
hljs.registerLanguage("dockerfile", dockerfile);
hljs.registerLanguage("haskell", haskell);
hljs.registerLanguage("matlab", matlab);
hljs.registerLanguage("cmake", cmake);
hljs.registerAliases(["tex"], { languageName: "latex" });
hljs.registerAliases(["toml"], { languageName: "ini" });
hljs.registerAliases(["zsh", "sh"], { languageName: "bash" });

export { hljs };

// every other language highlight.js knows (~190), loaded the
// first time a fence names it — the page never carries them all; what drew it plain draws again (onHighlightLanguage)
const more = import.meta.glob<{ default: Parameters<typeof hljs.registerLanguage>[1] }>(["../../node_modules/highlight.js/es/languages/*.js", "!**/*.js.js"]);
const asked = new Set<string>();
const waiting = new Set<() => void>();

/** `fn` each time a language arrives (to draw again what was plain). */
export function onHighlightLanguage(fn: () => void): () => void {
  waiting.add(fn);
  return () => waiting.delete(fn);
}

function want(name: string): void {
  const load = more[`../../node_modules/highlight.js/es/languages/${name}.js`];
  if (!load || asked.has(name)) return;
  asked.add(name);
  void load().then((m) => { hljs.registerLanguage(name, m.default); for (const f of waiting) f(); }, () => {});
}

/** The highlighter, asking for a language it does not know yet. */
const lazy = new Proxy(hljs, {
  get(target, key, receiver) {
    if (key === "getLanguage") return (n: string) => { const l = target.getLanguage(n); if (!l && n) want(n.trim().toLowerCase()); return l; };
    return Reflect.get(target, key, receiver);
  },
});

export function highlightToHtml(code: string, lang: string): string | null {
  const name = lang.trim().toLowerCase();
  if (!name) return null;
  if (!hljs.getLanguage(name)) { want(name); return null; }
  try {
    return hljs.highlight(code, { language: name, ignoreIllegals: true }).value;
  } catch {
    return null;
  }
}

/** Range-producing highlighter for live preview (memoised; runs per keystroke). */
export const highlightCode = createCodeHighlighter(() => lazy);
