// Bibliographic titles carry a little markup (Zotero/Crossref: <i>, <sub>, <sup>, $\infty$).
// Render exactly that: everything else is escaped.
import { escapeHtml } from "./text";
import { katexNow, PENDING } from "./math";

const esc = escapeHtml;
const ALLOWED = /&lt;(\/?)(i|b|em|strong|sub|sup|sc)&gt;/g;

export function richTitle(s: string): string {
  return s
    .split(/(\$[^$]+\$)/g)
    .map((part) => {
      if (/^\$[^$]+\$$/.test(part)) {
        const katex = katexNow();
        if (!katex) return PENDING(part.slice(1, -1), false);
        try { return katex.renderToString(part.slice(1, -1), { throwOnError: true, output: "html" }); }
        catch { return esc(part); }
      }
      return esc(part).replace(ALLOWED, (_m, slash: string, tag: string) => (tag === "sc" ? `<${slash}span${slash ? "" : ' style="font-variant:small-caps"'}>` : `<${slash}${tag}>`));
    })
    .join("");
}
