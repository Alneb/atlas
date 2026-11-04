// The format: what a snippet file says, the builders it writes it with, and how each entry becomes what the engine runs.
// A place is part of every snippet's type, so one that fires nowhere cannot be written.
export type Trigger = string | RegExp;
/** What is known at the place, for `when` and a computed body. */
export interface At { before: string; after: string; path: string; selection: string }
export type Body = string | ((m: RegExpExecArray | null, at: At) => string | Promise<string>);

export type Where =
  | { kind: "text" }
  /** `form`: only in inline or display math; `inTextArg`: also inside `\text{}` and the like. */
  | { kind: "math"; form?: "inline" | "display"; inTextArg?: boolean }
  /** `lang`: a file's extension or a fence's word (`py`, `python`); none: every code. */
  | { kind: "code"; lang?: string[] };

export interface Options {
  /** Fires as the trigger is typed; otherwise on Tab. Default: yes in math, no elsewhere. */
  auto?: boolean;
  /** Only where the trigger starts a word. */
  word?: boolean;
  /** Read a string trigger as a regular expression. */
  regex?: boolean;
  /** Higher goes first; same priority: file order. */
  priority?: number;
  /** Shown in the list and in Settings. */
  name?: string;
  note?: string;
  when?: (at: At) => boolean;
  /** Globs of the files it fires in. */
  file?: string | string[];
  form?: "inline" | "display";
  inTextArg?: boolean;
  /** Typed → what must come out, checked in Settings. */
  test?: Record<string, string>;
  /** The stops count from `$0` first, as in LaTeX Suite's format; else `$1, $2…` and `$0` last. */
  legacyStops?: boolean;
}

export type Entry =
  | { type: "snippet"; triggers: Trigger[]; body: Body; where: Where[]; visual: boolean; options: Options }
  /** Bare names get their backslash, and a letter after a command gets a space. */
  | { type: "commands"; names: string[]; digit: "space" | "subscript" | "none" }
  | { type: "words"; words: string[] }
  | { type: "vars"; vars: Record<string, string> };

const list = (t: Trigger | Trigger[]): Trigger[] => (Array.isArray(t) ? t : [t]);
const snippet = (t: Trigger | Trigger[], body: Body, where: Where[], options: Options = {}, visual = false): Entry => ({ type: "snippet", triggers: list(t), body, where, visual, options });

export const builders = {
  /** In math. */
  math: (t: Trigger | Trigger[], body: Body, o: Options = {}) => snippet(t, body, [{ kind: "math", form: o.form, inTextArg: o.inTextArg }], o),
  /** In running text. */
  text: (t: Trigger | Trigger[], body: Body, o: Options = {}) => snippet(t, body, [{ kind: "text" }], o),
  /** In code: `lang` the file's extension or the fence's word, a list of them, or "*". */
  code: (lang: string | string[], t: Trigger | Trigger[], body: Body, o: Options = {}) => {
    const langs = (Array.isArray(lang) ? lang : [lang]).map((l) => l.toLowerCase());
    return snippet(t, body, [{ kind: "code", lang: langs.includes("*") ? undefined : langs }], o);
  },
  /** On a selection: typing the trigger puts it in `${VISUAL}`, or gives it to a function as `at.selection`. */
  visual: (t: Trigger | Trigger[], body: Body, o: Options = {}) => snippet(t, body, [{ kind: "math", form: o.form, inTextArg: o.inTextArg }], o, true),
  /** Any places at once. */
  anywhere: (where: Where[], t: Trigger | Trigger[], body: Body, o: Options = {}) => snippet(t, body, where, o),
  commands: (names: string[], o: { digit?: "space" | "subscript" | "none" } = {}): Entry => ({ type: "commands", names, digit: o.digit ?? "none" }),
  words: (words: string[]): Entry => ({ type: "words", words }),
  /** `${NAME}` in a trigger stands for this text. */
  vars: (vars: Record<string, string>): Entry => ({ type: "vars", vars }),
};
export type Builders = typeof builders;

/** One trigger as the engine runs it. */
export interface Compiled {
  plain: string | null; regex: RegExp | null; body: Body; auto: boolean; word: boolean; priority: number; visual: boolean;
  text: boolean; code: boolean; langs: string[] | null; math: boolean; display: boolean; inline: boolean; inTextArg: boolean;
  legacyStops: boolean; when?: (at: At) => boolean; files: RegExp[] | null;
  name?: string; note?: string; test?: Record<string, string>;
  /** The file it came from, shown in Settings. */
  source: string;
  /** The trigger as written, to show. */
  shown: string;
}

const expandVars = (t: string, vars: Record<string, string>) => Object.entries(vars).reduce((s, [k, v]) => s.split(k.startsWith("${") ? k : `\${${k}}`).join(v), t);

/** `*` one path part, `**` any. */
function globToRegExp(g: string): RegExp {
  const src = g.replace(/[.+^$()|[\]{}\\]/g, "\\$&").replace(/\*\*\/?/g, "\u0000").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]").replace(/\u0000/g, ".*");
  return new RegExp(`^${src}$`);
}

/** The compiled form of one trigger; a problem is thrown, for the loader to report against this entry. */
function compileOne(t: Trigger, e: Extract<Entry, { type: "snippet" }>, vars: Record<string, string>, source: string): Compiled {
  const o = e.options, wantsRegex = o.regex || t instanceof RegExp;
  let regex: RegExp | null = null, plain: string | null = null;
  if (wantsRegex) {
    const src = t instanceof RegExp ? t.source : expandVars(t, vars);
    regex = new RegExp(`(?:${src})$`, t instanceof RegExp ? t.flags.replace(/[gy]/g, "") : "");
  } else {
    plain = expandVars(String(t), vars);
    if (!plain) throw new Error("an empty trigger");
  }
  const math = e.where.find((w) => w.kind === "math") as Extract<Where, { kind: "math" }> | undefined;
  const code = e.where.find((w) => w.kind === "code") as Extract<Where, { kind: "code" }> | undefined;
  return {
    plain, regex, body: e.body, priority: o.priority ?? 0, word: !!o.word, visual: e.visual || (typeof e.body === "string" && e.body.includes("${VISUAL}")),
    auto: o.auto ?? !!math, text: e.where.some((w) => w.kind === "text"), code: !!code, langs: code?.lang ?? null, math: !!math,
    display: !!math && math.form !== "inline", inline: !!math && math.form !== "display", inTextArg: !!math?.inTextArg,
    legacyStops: !!o.legacyStops, when: o.when, files: o.file ? (Array.isArray(o.file) ? o.file : [o.file]).map(globToRegExp) : null,
    name: o.name, note: o.note, test: o.test, source, shown: String(t),
  };
}

export interface Loaded { snippets: Compiled[]; known: string[]; words: string[]; problems: Problem[] }
export interface Problem { source: string; what: string }

const alternatives = (names: string[]) => [...new Set(names)].sort((a, b) => b.length - a.length).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");

/** The one spacing rule, as triggers: a bare name gets its backslash; a letter after a command gets a space; a digit
 *  after it a space or a subscript. A longer command being typed is the engine's to protect (`\sinh`, `\simeq`). */
function compileCommands(e: Extract<Entry, { type: "commands" }>, source: string): Compiled[] {
  const names = alternatives(e.names);
  if (!names) return [];
  const rule = (regex: RegExp, body: string, shown: string, name: string): Compiled => ({
    plain: null, regex, body, auto: true, word: false, priority: 0, visual: false, text: false, code: false, langs: null, math: true, display: true, inline: true,
    inTextArg: false, legacyStops: false, files: null, name, source, shown,
  });
  const out = [
    rule(new RegExp(`(^|[^\\\\])(${names})$`), "[[0]]\\[[1]]", `${e.names.length} commands, bare`, "A command's backslash"),
    rule(new RegExp(`\\\\(${names})([A-Za-z])$`), "\\[[0]] [[1]]", `${e.names.length} commands + letter`, "A space after a command"),
  ];
  if (e.digit === "space") out.push(rule(new RegExp(`\\\\(${names})(\\d)$`), "\\[[0]] [[1]]", `${e.names.length} commands + digit`, "A space before a number"));
  if (e.digit === "subscript") out.push(rule(new RegExp(`\\\\(${names})(\\d)$`), "\\[[0]]_{[[1]]}", `${e.names.length} commands + digit`, "A digit as a subscript"));
  return out;
}

/** Everything a set of files said, in order; an entry that fails is a problem and costs only itself. */
/** `pack`: a ready set (packs.ts) — a trigger the vault's own files already have is theirs, the pack's is left out. */
export function compileAll(files: { source: string; entries: Entry[]; pack?: boolean }[]): Loaded {
  const vars: Record<string, string> = {};
  for (const f of files) for (const e of f.entries) if (e?.type === "vars") Object.assign(vars, e.vars);
  const out: Compiled[] = [], known: string[] = [], words: string[] = [], problems: Problem[] = [];
  const commands: { name: string; source: string }[] = [];
  // the triggers the vault's own files define, by where they apply: a pack's same trigger there is left out
  const own = new Set<string>();
  const placeKey = (c: Compiled) => `${c.shown}\u0000${c.math}${c.text}${c.code}${c.visual}`;
  let inPack = false;
  const keep = (c: Compiled) => { if (!inPack) { own.add(placeKey(c)); return true; } return !own.has(placeKey(c)); };
  for (const f of files) {
    inPack = !!f.pack;
    for (const e of f.entries) {
      if (!e || typeof e !== "object" || !("type" in e)) { problems.push({ source: f.source, what: `not an entry: ${JSON.stringify(e)?.slice(0, 60)}` }); continue; }
      if (e.type === "vars") continue;
      if (e.type === "words") { words.push(...e.words.map((w) => w.toLowerCase())); continue; }
      if (e.type === "commands") { out.push(...compileCommands(e, f.source).filter(keep)); known.push(...e.names); commands.push(...e.names.map((n) => ({ name: n, source: f.source }))); continue; }
      for (const t of e.triggers) {
        try { const c = compileOne(t, e, vars, f.source); if (keep(c)) out.push(c); }
        catch (err) { problems.push({ source: f.source, what: `${String(t)}: ${String((err as Error).message ?? err)}` }); }
      }
    }
  }
  for (const v of Object.values(vars)) known.push(...String(v).split("|").filter((w) => /^[A-Za-z]{2,}$/.test(w)));
  // stable: higher priority first, then file order
  const snippets = out.map((s, i) => [s, i] as const).sort((a, b) => b[0].priority - a[0].priority || a[1] - b[1]).map(([s]) => s);
  snippets.push(...abbreviations(snippets, new Set(known)), ...commandShortcuts(commands, snippets, new Set(known)));
  for (const s of snippets) if (s.plain && /^[A-Za-z]{2,}$/.test(s.plain)) known.push(s.plain);
  return { snippets, known: [...new Set(known)], words, problems };
}

/** A math word trigger (`mfrak`) also fires on each shorter start (three letters or more) that no other math word
 *  trigger shares and no command or trigger already is (`mfr`, `mfra`): the engine holds such a start back while the
 *  keys still spell the full one, so typing it out whole gives the same. Text triggers get none (words collide). */
/** A command of a `commands` entry (`alpha`) also typed by its unshared starts (`alp`, `alph`: as `abbreviations`) and
 *  with two neighbouring letters swapped after the first (`alpah`, `lambda` as `lmabda`), when nothing else is so
 *  spelled: each gives the command, its backslash included. */
export function commandShortcuts(commands: { name: string; source: string }[], snippets: Compiled[], known: Set<string>): Compiled[] {
  const names = commands.map((c) => c.name).filter((n) => /^[A-Za-z]+$/.test(n));
  const taken = new Set([...known, ...snippets.flatMap((s) => (s.plain ? [s.plain] : []))]);
  const startsOther = (start: string, own: string) => names.some((o) => o !== own && o.startsWith(start)) || snippets.some((s) => s.math && !!s.plain && s.plain !== start && s.plain.startsWith(start));
  const make = (plain: string, name: string, source: string): Compiled => ({
    plain, regex: null, body: `\\${name}`, auto: true, word: false, priority: -1, visual: false, text: false, code: false, langs: null, math: true,
    display: true, inline: true, inTextArg: false, legacyStops: false, files: null, name: `\\${name}`, source, shown: plain,
  });
  const out: Compiled[] = [], made = new Set<string>();
  const add = (plain: string, name: string, source: string) => { if (!taken.has(plain) && !made.has(plain)) { made.add(plain); out.push(make(plain, name, source)); } };
  for (const { name, source } of commands) {
    if (!/^[A-Za-z]{4,}$/.test(name)) continue;
    for (let n = name.length - 1; n >= 3; n--) {
      const start = name.slice(0, n);
      if (taken.has(start) || startsOther(start, name)) break;
      add(start, name, source);
    }
    for (let i = 1; i + 1 < name.length; i++) {
      if (name[i] === name[i + 1]) continue;
      const typo = name.slice(0, i) + name[i + 1] + name[i] + name.slice(i + 2);
      if (!startsOther(typo, name) && !names.includes(typo)) add(typo, name, source);
    }
  }
  return out;
}

export function abbreviations(snippets: Compiled[], known: Set<string>): Compiled[] {
  const word = (s: Compiled) => s.math && !s.text && s.auto && !s.regex && !!s.plain && /^[A-Za-z]{4,}$/.test(s.plain);
  const words = snippets.filter(word);
  const taken = new Set([...known, ...snippets.flatMap((s) => (s.plain ? [s.plain] : []))]);
  const out: Compiled[] = [];
  for (const s of words) {
    for (let n = s.plain!.length - 1; n >= 3; n--) {
      const start = s.plain!.slice(0, n);
      if (taken.has(start) || words.some((o) => o !== s && o.plain!.startsWith(start))) break; // shorter ones share it too
      out.push({ ...s, plain: start, shown: start, priority: s.priority - 1 });
    }
  }
  return out;
}

// --- LaTeX Suite's format ---------------------------------------------------------------------------------------

export type RawLegacy = { trigger?: string | RegExp; replacement?: string | ((m: unknown) => unknown); options?: string; priority?: number; description?: string };

/** A file of that format is JavaScript: an array, maybe `export default`-ed or inside a fence. Evaluated as it always was. */
export function evalLegacy(src: string): unknown {
  let s = src;
  if (/^\s*(#|---)/.test(s)) s = /```(?:js|javascript|json)?\s*([\s\S]*?)```/.exec(s)?.[1] ?? s;
  s = s.replace(/^\s*import\b[^\n;]*;?\s*$/gm, "").trim();
  // only a wrapper at the very start: one further in is the snippets' own code
  s = s.replace(/^(?:export\s+default\s+|(?:export\s+)?(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*)/, "");
  s = s.replace(/;?\s*export\s+default\s+[A-Za-z_$][\w$]*\s*;?\s*$/, "").trim().replace(/;\s*$/, "");
  return new Function(`return (${s});`)();
}

/** One entry of that format, in this one. */
export function fromLegacy(r: RawLegacy): Entry | null {
  if (!r || r.trigger == null || r.replacement == null) return null;
  const o = String(r.options ?? ""), where: Where[] = [];
  if (o.includes("t")) where.push({ kind: "text" });
  if (o.includes("c")) where.push({ kind: "code" });
  if (o.includes("m") || o.includes("M") || o.includes("n") || !where.length) where.push({ kind: "math", form: o.includes("M") ? "display" : o.includes("n") ? "inline" : undefined });
  return snippet(r.trigger, r.replacement as Body, where, { auto: o.includes("A"), word: o.includes("w"), regex: o.includes("r"), priority: r.priority, name: r.description, legacyStops: true });
}

/** Both of that format's files, as entries. A file that does not read is a problem and costs only itself. */
export function readLegacy(d: { sources: string[]; variables: string }): { source: string; entries: Entry[]; problems: Problem[] } {
  const entries: Entry[] = [], problems: Problem[] = [], source = "the old snippet file";
  if (d.variables.trim()) {
    try { entries.push(builders.vars(evalLegacy(d.variables) as Record<string, string>)); }
    catch (e) { problems.push({ source: "the old variables file", what: String(e) }); }
  }
  for (const src of d.sources) {
    try {
      const arr = evalLegacy(src);
      if (Array.isArray(arr)) for (const r of arr) { const e = fromLegacy(r as RawLegacy); if (e) entries.push(e); }
    } catch (e) { problems.push({ source, what: `could not be read: ${String(e)}` }); }
  }
  return { source, entries, problems };
}
