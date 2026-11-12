// Numbered equations, as LaTeX numbers them: a display is numbered when it carries a label — `\label{eq-gap}` inside
// the `$$…$$`, or a block id after the closing `$$` on its line (`$$ ^eq-gap`, Obsidian's form) — or when it is a
// numbered environment (`equation`, `align`, `gather`, `multline`; not their starred forms). Plain `$$…$$` is not.
// A link to a label with no alias reads "(3)" in its own note (`[[#^eq-gap]]`) and "Note (3)" from another
// (`[[Note#^eq-gap]]`), opens at the equation, and follows when equations are added or moved. A display with its own
// `\tag{…}` keeps it (links read it); `\notag` / `\nonumber` takes none. One number per display (an `align`'s rows
// share it). Used by the reading view (markdown.ts), the editor (note-extensions.ts), hydrate.ts and note-anchor.ts;
// pure but for `equationLabel` / `equationLabelNow`, which read the other note through the reader they are given.
// Figures the same way: an embed line ending in a block id (`![[gap.png|The gap closes]] ^fig-gap`, Obsidian's form)
// is "Figure 2", numbered in note order; a link reads "Figure 2" / "Note, Figure 2"; the reading view captions it.
import { fences } from "./fence-walk";

const ID_AFTER_CLOSE = /\$\$[ \t]*\^([A-Za-z0-9-]+)[ \t]*$/;
const LABEL = /\\label\{([^}]+)\}/;
const LABELS = /\\label\{[^}]*\}/g;
const OWN_TAG = /\\tag\*?\{([^}]*)\}/;
const NO_TAG = /\\(?:notag|nonumber)\b/;
const NUMBERED_ENV = /\\begin\{(equation|align|gather|multline|eqnarray)\}/;
/** A figure's line: an embed (`![[…]]` or `![…](…)`), anything after it, and its block id last. */
export const FIGURE_LINE = /^[\s>]*(!\[\[[^\]]+\]\]|!\[[^\]]*\]\([^)]*\))(.*?)[ \t]+\^([A-Za-z0-9-]+)[ \t]*$/;

/** The label a numbered display takes: its own `\tag`, none for `\notag`, else the next number (`next` counts them). */
export function labelOf(source: string, next: () => number): string | null {
  const own = OWN_TAG.exec(source);
  if (own) return own[1];
  return NO_TAG.test(source) ? null : String(next());
}

export interface Equations {
  /** label → its number ("3", or a `\tag`'s text) */
  byId: Map<string, string>;
  /** a display's TeX (`texKey`) → the number to draw on it (those without their own `\tag`) */
  byTex: Map<string, string>;
  /** label → the 1-based lines its display spans, first and last (a link opens the note there; an embed shows it) */
  spanOf: Map<string, [number, number]>;
  /** a figure's label → its number */
  figures: Map<string, string>;
}

/** What a link to the label reads in its own note: "(3)" for an equation, "Figure 2" for a figure. */
export function refOf(e: Equations | undefined, id: string): string | undefined {
  const eq = e?.byId.get(id);
  if (eq) return `(${eq})`;
  const fig = e?.figures.get(id);
  return fig ? `Figure ${fig}` : undefined;
}

/** A figure's caption: the embed's alias that is no size or placement (`|600`, `|center`), or its alt text. */
export function figureCaption(embed: string): string {
  const wiki = /^!\[\[[^|\]]*((?:\|[^\]]*)?)\]\]$/.exec(embed);
  if (wiki) return wiki[1].split("|").map((p) => p.trim()).filter((p) => p && !/^\d+(x\d+)?$/.test(p) && p !== "center").join(" ");
  return /^!\[([^\]]*)\]/.exec(embed)?.[1].trim() ?? "";
}

/** Every numbered display of a note, in order. Code fences are skipped (an example is not an equation). */
export function noteEquations(md: string): Equations {
  const lines = md.split("\n"), code = fences();
  const byId = new Map<string, string>(), byTex = new Map<string, string>(), spanOf = new Map<string, [number, number]>();
  const figures = new Map<string, string>();
  let n = 0;
  const next = () => ++n;
  for (let i = 0; i < lines.length; i++) {
    if (code.code(lines[i])) continue;
    const fig = FIGURE_LINE.exec(lines[i]);
    if (fig) { figures.set(fig[3], String(figures.size + 1)); spanOf.set(fig[3], [i + 1, i + 1]); continue; }
    const open = /^[\s>]*\$\$/.exec(lines[i]);
    if (!open) continue;
    // the closing `$$`: later on the opener's line, else the first line holding one
    let close = lines[i].indexOf("$$", open[0].length) >= 0 ? i : -1;
    for (let k = i + 1; close < 0 && k < lines.length; k++) if (lines[k].includes("$$")) close = k;
    if (close < 0) break;
    const source = lines.slice(i, close + 1).join("\n");
    const id = LABEL.exec(source)?.[1] ?? ID_AFTER_CLOSE.exec(lines[close])?.[1];
    if (id || NUMBERED_ENV.test(source)) {
      const label = labelOf(source, next);
      if (label !== null) {
        if (id) { byId.set(id, label); spanOf.set(id, [i + 1, close + 1]); }
        if (!OWN_TAG.test(source)) byTex.set(texKey(source), label);
      }
    }
    i = close;
  }
  return { byId, byTex, spanOf, figures };
}

/** A display's TeX as a lookup key: without its `$$`, a block id after them, container prefixes (`> `) and outer
 *  blanks; the reader's token content and the editor's `$$…$$` source give the same key. */
export const texKey = (display: string): string =>
  display
    .replace(/[ \t]*\^[A-Za-z0-9-]+[ \t]*$/, "")
    .split("\n").map((l) => l.replace(/^[ \t>]*/, "")).join("\n")
    .replace(/^\s*\$\$|\$\$\s*$/g, "").trim();

/** TeX as KaTeX should draw it: labels out (they are Atlas's), and with a number, a numbered environment made its
 *  unnumbered twin (KaTeX would count from 1 in each display) and `\tag{n}` added — before the closing `$$` when the
 *  text has them. */
export function numberedTex(tex: string, n?: string): string {
  let t = tex.replace(LABELS, "");
  if (!n) return t;
  t = t.replace(/\\(begin|end)\{(equation|align|gather|multline|eqnarray)\}/g, (_m, be: string, env: string) =>
    env === "equation" || env === "multline" ? "" : `\\${be}{${env === "align" || env === "eqnarray" ? "aligned" : "gathered"}}`);
  const at = t.lastIndexOf("$$");
  return at > 0 ? `${t.slice(0, at)}\\tag{${n}}${t.slice(at)}` : `${t.trimEnd()}\\tag{${n}}`;
}

/** The display labelled `id`, as an embed `![[note#^id]]` shows it: alone, with its number written in, or undefined.
 *  A figure: its picture and its caption. */
export function equationSection(md: string, id: string): string | undefined {
  const e = noteEquations(md), span = e.spanOf.get(id);
  if (!span) return undefined;
  const fig = e.figures.get(id), line = md.split("\n")[span[0] - 1];
  const f = fig ? FIGURE_LINE.exec(line) : null;
  if (f) {
    const caption = figureCaption(f[1]).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
    return `${f[1]}\n\n<p class="figure-caption"><b>Figure ${fig}.</b>${caption ? ` ${caption}` : ""}</p>`;
  }
  const display = md.split("\n").slice(span[0] - 1, span[1]).join("\n").replace(/[ \t]*\^[A-Za-z0-9-]+[ \t]*$/, "");
  const n = e.byTex.get(texKey(display));
  return n ? numberedTex(display.split("\n").map((l) => l.replace(/^[ \t>]*/, "")).join("\n"), n) : display;
}

/** A link's equation label: `note#^id` → ["note", "id"]; null for any other link. */
export function equationTarget(target: string): [string, string] | null {
  const m = /^([^#]*)#\^([A-Za-z0-9:_-]+)$/.exec(target.trim());
  return m ? [m[1].trim(), m[2]] : null;
}

/** What a link to an equation or figure reads, from what it reads in its own note (`refOf`): "(3)" there, "Note (3)"
 *  from another; "Figure 2" there, "Note, Figure 2" from another. */
export const linkText = (note: string, ref: string): string =>
  !note ? ref : `${note.split("/").pop()}${ref.startsWith("(") ? " " : ", "}${ref}`;

// The other notes' equations, by path, and the labels already known, until the vault changes (hydrate.ts).
const cache = new Map<string, Promise<Equations>>();
const known = new Map<string, string | null>();
export const forgetEquations = () => { cache.clear(); known.clear(); };

/** What a link to `id` in the note at `path` reads there ("(3)", "Figure 2"), null when that label is neither. */
export async function equationLabel(path: string, id: string, read: (path: string) => Promise<string | null>): Promise<string | null> {
  let eqs = cache.get(path);
  if (!eqs) cache.set(path, (eqs = read(path).then((t) => noteEquations(t ?? ""))));
  return refOf(await eqs, id) ?? null;
}

/** The number if already known, else null while it is read; `arrived` runs when it turns out to be one (the editor
 *  draws again: it asks on every keystroke and must never wait). */
export function equationLabelNow(path: string, id: string, read: (path: string) => Promise<string | null>, arrived: () => void): string | null {
  const key = `${path}#${id}`;
  if (!known.has(key)) {
    known.set(key, null);
    void equationLabel(path, id, read).then((l) => { known.set(key, l); if (l) arrived(); });
  }
  return known.get(key) ?? null;
}
