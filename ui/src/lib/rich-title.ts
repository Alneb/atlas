// Bibliographic titles carry a little markup (Zotero/Crossref: <i>, <sub>, <sup>, $\infty$).
// Render exactly that: everything else is escaped.
import { escapeHtml } from "./text";
import katex from "katex";

const esc = escapeHtml;
const ALLOWED = /&lt;(\/?)(i|b|em|strong|sub|sup|sc)&gt;/g;

export function richTitle(s: string): string {
  return s
    .split(/(\$[^$]+\$)/g)
    .map((part) => {
      if (/^\$[^$]+\$$/.test(part)) {
        try { return katex.renderToString(part.slice(1, -1), { throwOnError: true, output: "html" }); }
        catch { return esc(part); }
      }
      return esc(part).replace(ALLOWED, (_m, slash: string, tag: string) => (tag === "sc" ? `<${slash}span${slash ? "" : ' style="font-variant:small-caps"'}>` : `<${slash}${tag}>`));
    })
    .join("");
}
