// The one reading of `[[target#section|alias]]` / `![[embed]]` in plain text: the markdown renderer's
// inline rule (markdown.ts) and the terminal's link provider (terminal-wikilinks.ts) both scan with it.

export interface WikilinkMatch {
  /** index of `[[` (or of the `!` of an embed) */
  start: number;
  /** index just past `]]` */
  end: number;
  /** what the link names, with its `#heading` / `#^block`, trimmed */
  target: string;
  alias?: string;
  embed: boolean;
}

/** The wikilink starting at `pos` of `src`, or null: a non-empty body on one line, with no `[` in it. */
export function wikilinkAt(src: string, pos: number): WikilinkMatch | null {
  const embed = src.charCodeAt(pos) === 0x21;
  const open = embed ? pos + 1 : pos;
  if (src.slice(open, open + 2) !== "[[") return null;
  const close = src.indexOf("]]", open + 2);
  if (close < 0) return null;
  const body = src.slice(open + 2, close);
  if (!body || body.includes("\n") || body.includes("[")) return null;
  const bar = body.indexOf("|");
  const [target, alias] = bar < 0 ? [body, undefined] : [body.slice(0, bar), body.slice(bar + 1)];
  return { start: pos, end: close + 2, target: target.trim(), alias: alias?.trim(), embed };
}

/** Every wikilink of `text`, left to right, not overlapping; an empty target (`[[|x]]`) is skipped. */
export function wikilinksIn(text: string): WikilinkMatch[] {
  const out: WikilinkMatch[] = [];
  for (let i = text.indexOf("[["); i >= 0; ) {
    const m = wikilinkAt(text, i > 0 && text[i - 1] === "!" ? i - 1 : i);
    if (m && m.target) { out.push(m); i = text.indexOf("[[", m.end); }
    else i = text.indexOf("[[", i + 1);
  }
  return out;
}
