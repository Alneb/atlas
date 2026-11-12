// A note (Obsidian/Atlas Markdown) → pandoc Markdown, the same for every format: a paper linked as [[citekey]] is a
// pandoc citation [@citekey] (each writer renders it its own way: biblatex, Typst's #cite, citeproc), other wikilinks
// their alias or name, a picture with an italic line under it a captioned figure, an embedded note its text (three
// deep), callouts quotes with a bold title, ==marks== highlights; comments, block ids and query blocks go. Pure: the
// vault comes in as its file list and a reader, so the tests run on a fake one.

/** What the translation reads of the vault. */
export interface VaultView {
  /** Every file, vault-relative, "/"-separated. */
  files: string[];
  read(path: string): Promise<string>;
}

/** A fenced block the writer handles itself: `tikz` (LaTeX), `typst` (Typst). */
export interface Fence { lang: "tikz" | "typst"; source: string; }

export interface Translated {
  /** title, subtitle, author, date: the note's properties, else its first heading (then taken out), else its name. */
  meta: Record<string, string>;
  markdown: string;
  cited: string[];
  warnings: string[];
  /** The tikz/typst fences, in order; the markdown holds `<!--fence:N-->` for each, replaced by the road. */
  fences: Fence[];
}

import { expandAlign } from "../../../../ui/src/lib/math-align";
import { equationTarget, linkText, noteEquations, numberedTex, refOf, type Equations } from "../../../../ui/src/lib/equations";

const IMAGE = /\.(png|jpe?g|gif|svg|webp|pdf|eps)$/i;
// fenced blocks Atlas or Obsidian draw from a query: nothing to print
const QUERY_FENCES = new Set(["view", "base", "tasks", "dataview", "dataviewjs", "query"]);

export const dirname = (p: string) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");
const basename = (p: string) => p.slice(p.lastIndexOf("/") + 1);
const stem = (p: string) => basename(p).replace(/\.[^.]*$/, "");

/** `a/b/../c` → `a/c`; null when it climbs out of the vault. */
function normalize(p: string): string | null {
  const out: string[] = [];
  for (const part of p.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") { if (!out.length) return null; out.pop(); } else out.push(part);
  }
  return out.join("/");
}

/** `to` as seen from the folder `from` (both vault-relative): `../../figs/plot.png`. */
export function relative(from: string, to: string): string {
  const a = from.split("/").filter(Boolean), b = to.split("/").filter(Boolean);
  let i = 0;
  while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++;
  return [...Array(a.length - i).fill(".."), ...b.slice(i)].join("/");
}

/** The frontmatter's single-line `key: value` pairs (quotes off, keys lower-case) and the body. */
export function splitFrontmatter(text: string): [Record<string, string>, string] {
  const m = /^---\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/.exec(text);
  if (!m) return [{}, text];
  const props: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w-]*):\s*(.+?)\s*$/.exec(line);
    if (kv) props[kv[1].toLowerCase()] = kv[2].replace(/^["']|["']$/g, "");
  }
  return [props, text.slice(m[0].length)];
}

/** The citation keys of a .bib. */
export const bibKeys = (bib: string) => new Set([...bib.matchAll(/@\w+\s*\{\s*([^,\s]+)\s*,/g)].map((m) => m[1]));

/** The text as [isCode, chunk, lang]: fenced blocks are code; a query fence is dropped. */
function segments(md: string): [boolean, string, string][] {
  const out: [boolean, string, string][] = [];
  let buf: string[] = [], fence: string | null = null, lang = "";
  for (const line of md.split(/(?<=\n)/)) {
    const m = /^\s*(`{3,}|~{3,})\s*([\w-]*)/.exec(line);
    const t = line.trim();
    if (fence === null && m) {
      out.push([false, buf.join(""), ""]);
      buf = [line]; fence = m[1]; lang = m[2].toLowerCase();
    } else if (fence !== null && t.startsWith(fence) && t.replaceAll(fence[0], "") === "") {
      buf.push(line);
      if (!QUERY_FENCES.has(lang)) out.push([true, buf.join(""), lang]);
      buf = []; fence = null;
    } else buf.push(line);
  }
  out.push([fence !== null, buf.join(""), fence !== null ? lang : ""]);
  return out;
}

/** Display math as every writer takes it: on lines of its own, a `$$align` block (and a whole `\begin{align}` in `$$`)
 *  as pandoc's `aligned`, valid inside display math everywhere. Atlas's macros stay as written: each road carries their
 *  definitions (helper.ts). */
export const mathPortable = (text: string) => text.replace(/\$\$([\s\S]+?)\$\$/g, (_, tex: string) =>
  `$$\n${expandAlign(tex.trim()).replace(/^\\begin\{align\*?\}([\s\S]*)\\end\{align\*?\}$/, "\\begin{aligned}$1\\end{aligned}")}\n$$`);

// --- numbered equations (ui/src/lib/equations.ts says which): the document is numbered once, as LaTeX numbers it, so
// an embedded note's equations continue the host's (an \input). Each label is first made its note's (`note::id`), a
// numbered environment without one gets a blank label, links become placeholders; then `numberEquations` writes
// `\tag{n}` into each display and the numbers into the links (the Typst and Word roads turn the tag into text, helper.ts).
const AUTO = "\u0002";
/** In `numberEquations`' output: after a display's `\tag{n}`, "this one is equation n's target"; around a number, "a
 *  link to equation n". Each road writes them its own way (helper.ts `equationMarks`). */
export const ANCHOR = "\u0005", REF = "\u0006";

/** A note's displays with their labels made its own: `$$ … $$ ^id` → `\label{note::id}`, `\label{id}` likewise. */
export function qualifyLabels(text: string, note: string): string {
  return text
    .replace(/\$\$[ \t]*\^([A-Za-z0-9-]+)[ \t]*$/gm, (_, id: string) => `\\label{${id}}$$`)
    .replace(/\$\$([\s\S]+?)\$\$/g, (whole, tex: string) => {
      if (/\\label\{/.test(tex)) return `$$${tex.replace(/\\label\{([^}]*)\}/g, (_m, id: string) => `\\label{${note}::${id}}`)}$$`;
      return /\\begin\{(equation|align|gather|multline|eqnarray)\}/.test(tex) ? `$$${tex}\\label{${AUTO}}$$` : whole;
    });
}

/** The whole document numbered: each labelled display gets the next number (its own `\tag` kept, none for `\notag`),
 *  its labels go, and a link to it reads "(n)"; a link to a note not in the document reads "Note (n)" by that note's
 *  own numbers. A link to a figure reads "Figure n" by its note's numbering ("Note, Figure n" from another note). */
export async function numberEquations(md: string, read: (note: string) => Promise<string>): Promise<string> {
  const byLabel = new Map<string, string>();
  const anchored = new Set<string>();
  let n = 0;
  md = md.replace(/\$\$([\s\S]+?)\$\$/g, (whole, tex: string) => {
    const labels = [...tex.matchAll(/\\label\{([^}]*)\}/g)].map((m) => m[1]);
    if (!labels.length) return whole;
    const own = /\\tag\*?\{([^}]*)\}/.exec(tex)?.[1];
    const num = own ?? (/\\(?:notag|nonumber)\b/.test(tex) ? null : String(++n));
    for (const l of labels) if (num && l !== AUTO) byLabel.set(l, num);
    let bare = num && !own ? numberedTex(tex.trimEnd(), num) : numberedTex(tex).trimEnd(); // labels out, an env its twin
    // the first display with this number is the one links go to (each road makes it a label: `equationMarks`)
    if (num && !anchored.has(num)) { anchored.add(num); bare = bare.replace(/\\tag\*?\{[^}]*\}/, (t) => t + ANCHOR); }
    return `$$${bare}\n$$`;
  });
  const elsewhere = new Map<string, Promise<Equations | undefined>>();
  const refs = [...new Set([...md.matchAll(/\u0001([^\u0001]*)\u0001/g)].map((m) => m[1]))];
  const text = new Map<string, string>();
  for (const r of refs) {
    // `=note::id`: a link inside that note (`[[#^id]]`), which reads without the note's name
    const own = r.startsWith("="), key = own ? r.slice(1) : r;
    const [note, id] = [key.slice(0, key.lastIndexOf("::")), key.slice(key.lastIndexOf("::") + 2)];
    const here = byLabel.get(key);
    if (here) { text.set(r, `${REF}${here}${REF}`); continue; }
    // another note's equation, or a figure (numbered in its own note): what a link to it reads there
    if (!elsewhere.has(note)) elsewhere.set(note, read(note).then((t) => noteEquations(t), () => undefined));
    const there = refOf(await elsewhere.get(note)!, id);
    const name = basename(note).replace(/\.md$/i, "");
    text.set(r, there ? linkText(own ? "" : name, there) : name);
  }
  return md.replace(/\u0001([^\u0001]*)\u0001/g, (_, r: string) => text.get(r) ?? "");
}

/** `fn` applied to the text between inline code spans. */
const outsideInlineCode = (text: string, fn: (s: string) => string) =>
  text.split(/(`+[^`\n]*?`+)/).map((p, i) => (i % 2 ? p : fn(p))).join("");

class Translator {
  cited: string[] = [];
  warnings: string[] = [];
  fences: Fence[] = [];
  private byName = new Map<string, string[]>();
  private fileSet: Set<string>;

  constructor(private vault: VaultView, private outDir: string, private keys: Set<string>) {
    this.fileSet = new Set(vault.files);
    for (const f of vault.files) {
      if (f.split("/").some((part) => part.startsWith("."))) continue;
      const k = basename(f).toLowerCase();
      this.byName.set(k, [...(this.byName.get(k) ?? []), f]);
    }
  }

  /** What a note names, the Obsidian way: beside the note, from the vault's top, else the shortest path of that name. */
  find(name: string, near: string, ext = ""): string | null {
    name = name.trim();
    const candidates = [name, ...(ext && !name.toLowerCase().endsWith(ext) ? [name + ext] : [])];
    for (const c of candidates) for (const base of [near, ""]) {
      const p = normalize(base ? `${base}/${c}` : c);
      if (p !== null && this.fileSet.has(p)) return p;
    }
    for (const c of candidates) {
      const hits = this.byName.get(basename(c).toLowerCase());
      if (hits?.length) return [...hits].sort((a, b) => a.split("/").length - b.split("/").length)[0];
    }
    return null;
  }

  figure(target: string, opts: string, caption: string, near: string): string {
    const img = this.find(target, near);
    if (!img) { this.warnings.push(`picture not found: ${target}`); return `*(${target})*`; }
    const vector = img.replace(/\.[^.]*$/, ".pdf"); // a plot's vector twin beside its .png prints sharper
    const src = !/\.pdf$/i.test(img) && this.fileSet.has(vector) ? vector : img;
    const px = opts.split("|").map((o) => /^\s*(\d+)(?:x\d+)?\s*$/.exec(o)).find(Boolean);
    const width = px ? `{width=${Math.min(100, Math.round(Number(px[1]) / 7))}%}` : ""; // Obsidian's pixels on a ~700 px page
    caption = caption.trim().replace(/^(\*\*)?(Figure|Fig\.)\s*\d+[.:]?(\*\*)?\s*/, ""); // the writer numbers them
    return `![${caption}](<${relative(this.outDir, src)}>)${width}`;
  }

  async transclude(target: string, near: string, depth: number): Promise<string> {
    const [name, section = ""] = target.split(/#(.*)/s);
    const note = this.find(name, near, ".md");
    if (!note || !note.toLowerCase().endsWith(".md")) { this.warnings.push(`embed left out: ${target}`); return `*(${target})*`; }
    if (depth >= 3) return `*(${name})*`;
    let [, body] = splitFrontmatter(await this.vault.read(note));
    if (section && !section.startsWith("^")) {
      const take: string[] = [];
      let level = 0;
      for (const line of body.split("\n")) {
        const h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
        if (h && level && h[1].length <= level) break;
        if (h && !level && h[2].trim().toLowerCase() === section.trim().toLowerCase()) { level = h[1].length; continue; }
        if (level) take.push(line);
      }
      body = take.join("\n");
    }
    return this.body(body, dirname(note), depth + 1, note);
  }

  link(target: string, alias: string | undefined, near: string, note: string): string {
    const eq = equationTarget(target);
    if (eq && !alias) { // a numbered equation: its number once the document is numbered (`numberEquations`)
      const path = eq[0] ? this.find(eq[0], near, ".md") : note;
      if (path) return `\u0001${eq[0] ? "" : "="}${path}::${eq[1]}\u0001`;
    }
    const name = target.split("#")[0].trim();
    const key = basename(name).replace(/\.md$/i, "");
    if (this.keys.has(key)) { // citing is linking: a link to a paper is its citation
      if (!this.cited.includes(key)) this.cited.push(key);
      return `[@${key}]`;
    }
    if (alias) return alias;
    return name ? basename(name).replace(/\.md$/i, "") : target.split("#").slice(1).join("#").replace(/^\^/, "");
  }

  async prose(text: string, near: string, depth: number, note: string): Promise<string> {
    text = text.replace(/%%[\s\S]*?%%/g, ""); // Obsidian comments
    // an embed followed by its italic caption paragraph → one captioned figure
    text = text.replace(/!\[\[([^\]|#]+)((?:\\?\|[^\]]*)?)\]\]\n\n\*([^*\n][^\n]*?)\*\n/g,
      (_, t: string, o: string, c: string) => `${this.figure(t, o.replace(/^\\?\|/, ""), c, near)}\n`);
    // note embeds are async: collected first, put back after
    const embeds: Promise<string>[] = [];
    const inline = (t: string) => {
      t = mathPortable(qualifyLabels(t, note));
      t = t.replace(/!\[\[([^\]|]+)((?:\\?\|[^\]]*)?)\]\]/g, (_, target: string, o: string) => {
        target = target.trim();
        const opts = (o ?? "").replace(/^\\?\|/, "");
        if (IMAGE.test(target.split("#")[0])) return this.figure(target.split("#")[0], opts, "", near);
        embeds.push(this.transclude(target, near, depth));
        return `\n\n\u0000${embeds.length - 1}\u0000\n\n`;
      });
      t = t.replace(/\[\[([^\]|]+?)(?:\\?\|([^\]]+))?\]\]/g, (_, target: string, alias?: string) => this.link(target.replace(/\\$/, ""), alias, near, note));
      return t.replace(/[ \t]\^[A-Za-z0-9-]+[ \t]*$/gm, ""); // block ids
    };
    text = outsideInlineCode(text, inline);
    const done = await Promise.all(embeds);
    text = text.replace(/\u0000(\d+)\u0000/g, (_, i: string) => done[Number(i)]);
    // a callout's first line → a titled quote
    text = text.replace(/^((?:>\s*)+)\[!(\w+)\][+-]?[ \t]*(.*)$/gm,
      (_, q: string, kind: string, title: string) => `${q}**${title.trim() || kind[0].toUpperCase() + kind.slice(1)}**\n${q.trimEnd()}`);
    // pandoc needs a blank line between a paragraph and the list under it, and before a heading (Obsidian does not)
    return text.replace(/^([^\n\s>|-][^\n]*)\n(\s*(?:[-*+]|\d+[.)]) )/gm, "$1\n\n$2").replace(/^([^\n]*\S[^\n]*)\n(#{1,6}[ \t])/gm, "$1\n\n$2");
  }

  async body(md: string, near: string, depth = 0, note = ""): Promise<string> {
    const parts: string[] = [];
    for (const [code, chunk, lang] of segments(md)) {
      if (code && (lang === "tikz" || lang === "typst")) {
        const source = chunk.replace(/^[^\n]*\n/, "").replace(/\n?\s*(`{3,}|~{3,})\s*$/, "");
        this.fences.push({ lang, source });
        parts.push(`\n<!--fence:${this.fences.length - 1}-->\n`);
      } else parts.push(code ? chunk : await this.prose(chunk, near, depth, note));
    }
    return parts.join("");
  }
}

/** The note at `note` as pandoc Markdown for a document written in the folder `outDir`, citing the `keys` it links. */
export async function translate(vault: VaultView, note: string, outDir: string, keys: Set<string>): Promise<Translated> {
  const [props, whole] = splitFrontmatter(await vault.read(note));
  let body = whole;
  const meta: Record<string, string> = {};
  for (const k of ["title", "subtitle", "author", "date"]) if (props[k]) meta[k] = props[k];
  const h1 = /^# (.+?)\s*#*\s*$/m.exec(body);
  if (!meta.title) {
    meta.title = h1 ? h1[1] : stem(note);
    if (h1) body = body.slice(0, h1.index) + body.slice(h1.index + h1[0].length);
  }
  const t = new Translator(vault, outDir, keys);
  const markdown = await numberEquations(await t.body(body, dirname(note), 0, note), (n) => vault.read(n));
  return { meta, markdown, cited: t.cited, warnings: t.warnings, fences: t.fences };
}
