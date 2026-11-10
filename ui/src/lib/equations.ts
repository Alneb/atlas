// Numbered equations, as LaTeX numbers them: a display is numbered when it carries a label — `\label{eq-gap}` inside
// the `$$…$$`, or a block id after the closing `$$` on its line (`$$ ^eq-gap`, Obsidian's form) — or when it is a
// numbered environment (`equation`, `align`, `gather`, `multline`; not their starred forms). Plain `$$…$$` is not.
// A link to a label with no alias reads "(3)" in its own note (`[[#^eq-gap]]`) and "Note (3)" from another
// (`[[Note#^eq-gap]]`), opens at the equation, and follows when equations are added or moved. A display with its own
// `\tag{…}` keeps it (links read it); `\notag` / `\nonumber` takes none. One number per display (an `align`'s rows
// share it). Used by the reading view (markdown.ts), the editor (note-extensions.ts), hydrate.ts and note-anchor.ts;
// pure but for `equationLabel` / `equationLabelNow`, which read the other note through the reader they are given.
import { fences } from "./fence-walk";

const ID_AFTER_CLOSE = /\$\$[ \t]*\^([A-Za-z0-9-]+)[ \t]*$/;
const LABEL = /\\label\{([^}]+)\}/;
const LABELS = /\\label\{[^}]*\}/g;
const OWN_TAG = /\\tag\*?\{([^}]*)\}/;
const NO_TAG = /\\(?:notag|nonumber)\b/;
const NUMBERED_ENV = /\\begin\{(equation|align|gather|multline|eqnarray)\}/;

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
}

/** Every numbered display of a note, in order. Code fences are skipped (an example is not an equation). */
export function noteEquations(md: string): Equations {
  const lines = md.split("\n"), code = fences();
  const byId = new Map<string, string>(), byTex = new Map<string, string>(), spanOf = new Map<string, [number, number]>();
  let n = 0;
  const next = () => ++n;
  for (let i = 0; i < lines.length; i++) {
    if (code.code(lines[i])) continue;
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
  return { byId, byTex, spanOf };
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

/** The display labelled `id`, as an embed `![[note#^id]]` shows it: alone, with its number written in, or undefined. */
export function equationSection(md: string, id: string): string | undefined {
  const e = noteEquations(md), span = e.spanOf.get(id);
  if (!span) return undefined;
  const display = md.split("\n").slice(span[0] - 1, span[1]).join("\n").replace(/[ \t]*\^[A-Za-z0-9-]+[ \t]*$/, "");
  const n = e.byTex.get(texKey(display));
  return n ? numberedTex(display.split("\n").map((l) => l.replace(/^[ \t>]*/, "")).join("\n"), n) : display;
}

/** A link's equation label: `note#^id` → ["note", "id"]; null for any other link. */
export function equationTarget(target: string): [string, string] | null {
  const m = /^([^#]*)#\^([A-Za-z0-9:_-]+)$/.exec(target.trim());
  return m ? [m[1].trim(), m[2]] : null;
}

/** What a link to an equation reads: "(3)" in its own note, "Note (3)" from another. */
export const linkText = (note: string, n: string): string => (note ? `${note.split("/").pop()} (${n})` : `(${n})`);

// The other notes' equations, by path, and the labels already known, until the vault changes (hydrate.ts).
const cache = new Map<string, Promise<Equations>>();
const known = new Map<string, string | null>();
export const forgetEquations = () => { cache.clear(); known.clear(); };

/** The number of the equation labelled `id` in the note at `path`, null when that label is no equation. */
export async function equationLabel(path: string, id: string, read: (path: string) => Promise<string | null>): Promise<string | null> {
  let eqs = cache.get(path);
  if (!eqs) cache.set(path, (eqs = read(path).then((t) => noteEquations(t ?? ""))));
  return (await eqs).byId.get(id) ?? null;
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
