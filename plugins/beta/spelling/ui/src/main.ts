// Spelling: a wavy line under a word of a note's prose that neither the language's Hunspell dictionary nor the vault
// knows (docs/design/DESIGN-spelling-predictor.md). The dictionaries come from the machine through the helper and are
// loaded here, when a note in that language is first shown; the vault's words are counted once per start, in the
// background. Right-click on a marked word: suggestions, and "Add to this vault's words" (a Markdown note).
import type { EditorView, ViewUpdate, DecorationSet } from "@codemirror/view";
import nspell from "nspell";
import type { PluginApi } from "../../../../../ui/src/lib/plugin-api";
import { frontMatterEnd, guessLanguage, proseRanges, wordsOf, type Word } from "../../../../../ui/src/lib/editor/prose";
import { isWrong } from "./judge";
import { suggestions } from "./suggest";
import { addWord, parseWords, WORDS_NOTE } from "./words";

type Speller = ReturnType<typeof nspell>;
/** word → [uses, notes using it], per language */
type Counts = Map<string, Map<string, [number, number]>>;

/** The dictionaries a language uses when the setting names none: of each group, the first installed. English takes
 *  both the American and the British one, so either spelling (centered, centred) is right. */
const PREFERRED: Record<string, string[][]> = { en: [["en_US", "en_CA"], ["en_GB", "en_AU"]], es: [["es_ES", "es_MX", "es_AR"]], fr: [["fr_FR", "fr_CA"]], de: [["de_DE"]] };

export async function register(atlas: PluginApi) {
  const { state: S, view: V, language } = atlas.editor.codemirror;
  const setting = (k: string) => atlas.plugin.settings[k];
  const minUses = () => Number(setting("min_uses") ?? 3);
  const minNotes = () => Number(setting("min_notes") ?? 2);

  // --- what is known -------------------------------------------------------------------------------------------
  const installed: string[] = ((await atlas.helper.call("dictionaries", { folder: setting("folder") }).catch(() => [])) as string[]) ?? [];
  /** language → dictionary names, from the setting (`en=en_GB, es=es_MX+es_AR`) over the preferred installed ones */
  const chosen = new Map<string, string[]>();
  for (const [lang, groups] of Object.entries(PREFERRED)) {
    const names = groups.map((g) => g.find((x) => installed.includes(x))).filter((x): x is string => !!x);
    if (names.length) chosen.set(lang, names);
  }
  for (const part of String(setting("dictionaries") ?? "").split(/[,\s]+/)) {
    const m = /^([a-z]{2,3})=([\w+-]+)$/.exec(part.trim());
    const names = m?.[2].split("+").filter((n) => installed.includes(n)) ?? [];
    if (m && names.length) chosen.set(m[1], names);
  }
  const langs = [...chosen.keys()];
  const fallback = String(setting("language") || langs[0] || "en");
  if (!installed.length) atlas.toast("Spelling", "No Hunspell dictionary on this machine: only the vault's own words are known, so nothing is marked. Settings → Spelling names a folder.", "info");

  /** A language's dictionaries, loaded the first time a note in it is shown: null until they are there. */
  const spellers = new Map<string, Speller[] | "loading">();
  const speller = (lang: string): { correct(w: string): boolean; suggest(w: string): string[] } | null => {
    const have = spellers.get(lang);
    if (have) return have === "loading" ? null : { correct: (w) => have.some((s) => s.correct(w)), suggest: (w) => [...new Set(have.flatMap((s) => s.suggest(w)))] };
    const names = chosen.get(lang);
    if (!names) return null;
    spellers.set(lang, "loading");
    void Promise.all(names.map((name) => atlas.helper.call("dictionary", { name, folder: setting("folder") }, { timeout: 60 }) as Promise<{ aff: string; dic: string }>))
      .then((dicts) => { spellers.set(lang, dicts.map(({ aff, dic }) => nspell(aff, dic))); redrawAll(); })
      .catch((e) => { console.warn(`spelling: ${names.join(", ")} did not load:`, e); spellers.delete(lang); });
    return null;
  };

  const counts: Counts = new Map();
  let accepted = new Set<string>();
  const readAccepted = async () => {
    accepted = (await atlas.exists(WORDS_NOTE)) ? parseWords(await atlas.readText(WORDS_NOTE)) : new Set();
    redrawAll();
  };

  /** The vault's words, counted by the helper a chunk at a time: once per start (a note saved again would count its
   *  own typos twice), so a word typed now is judged by what the vault said when Atlas started. */
  /** Each note's counted words (path → its language and word → uses), so a saved note's old counts come out and its
   *  new ones go in: the vault is learned at start and kept current as notes change. */
  const perNote = new Map<string, { lang: string; words: Record<string, number> }>();
  type Counted = Record<string, { lang: string; words: Record<string, number> }>;
  const apply = (entry: { lang: string; words: Record<string, number> }, sign: 1 | -1) => {
    const into = counts.get(entry.lang) ?? counts.set(entry.lang, new Map()).get(entry.lang)!;
    for (const [w, u] of Object.entries(entry.words)) {
      const r = into.get(w) ?? [0, 0];
      r[0] += sign * u; r[1] += sign;
      if (r[1] <= 0) into.delete(w); else into.set(w, r);
    }
  };
  const take = (part: Counted, asked: string[]) => {
    for (const path of asked) {
      const old = perNote.get(path);
      if (old) apply(old, -1);
      const now = part[path];
      if (now) { perNote.set(path, now); apply(now, 1); } else perNote.delete(path);
    }
  };
  // a chunk over the helper's time limit (long notes) is split in two and tried again; one note that still fails is
  // left out, never the rest of the vault
  const count = async (paths: string[]): Promise<void> => {
    try { take((await atlas.helper.call("count", { paths, langs: langs.length ? langs : [fallback], fallback })) as Counted, paths); }
    catch (e) {
      if (paths.length === 1) { console.warn(`spelling: ${paths[0]} was not counted:`, e); return; }
      const half = Math.ceil(paths.length / 2);
      await count(paths.slice(0, half));
      await count(paths.slice(half));
    }
  };
  let counted = false;
  const countVault = async () => {
    const notes = (await atlas.helper.call("notes")) as string[];
    for (let i = 0; i < notes.length; i += 20) {
      await count(notes.slice(i, i + 20));
      if (i % 200 === 0) redrawAll(); // what is learned shows as it comes
    }
    counted = true;
    redrawAll();
  };

  // --- judging a word ------------------------------------------------------------------------------------------
  const vaultKnows = (lang: string, w: string) => {
    const t = counts.get(lang);
    const r = t?.get(w) ?? t?.get(w.toLowerCase());
    // often enough in enough notes, or so often in one that it is meant (a note's own term: plaquette, irrep)
    return !!r && ((r[0] >= minUses() && r[1] >= minNotes()) || r[0] >= 8);
  };
  /** The open note's own words, counted as it is drawn: a term it uses 8 times is meant, before the vault is counted. */
  let noteUses = new Map<string, number>();
  /** Is this word wrong? null while the language's dictionary is not there (nothing is marked then). */
  const wrong = (lang: string, w: string): boolean | null => {
    const own = (x: string) => accepted.has(x) || accepted.has(x.toLowerCase()) || vaultKnows(lang, x) || (noteUses.get(x) ?? 0) >= 8;
    if (!isWrong(w, own)) return false;
    const s = speller(lang);
    if (!s) return null;
    if (!isWrong(w, (x) => own(x) || s.correct(x))) return false;
    // right in another installed language (a Spanish word in an English note): not a misspelling. Their dictionaries
    // load in the background the first time one is needed; until then the word stays marked
    const others = langs.filter((l) => l !== lang).map(speller);
    return !others.some((o) => o && !isWrong(w, o.correct));
  };

  // --- the editor ----------------------------------------------------------------------------------------------
  const miss = V.Decoration.mark({ class: "cm-spell-miss" });
  const views = new Set<EditorView>();
  const redraw = S.StateEffect.define<null>();
  function redrawAll() { for (const v of views) v.dispatch({ effects: redraw.of(null) }); }

  const langProperty = (view: EditorView) => {
    const text = view.state.doc.sliceString(0, 4000);
    return /^---[\s\S]*?^lang:\s*([\w-]+)/m.exec(text.slice(0, frontMatterEnd(text)))?.[1];
  };
  const noteLanguage = (view: EditorView) =>
    guessLanguage(view.state.doc.sliceString(0, 20000), langs.length ? langs : [fallback], fallback, langProperty(view));

  // --- the bottom bar: the note's language and what is marked; a click sets the language ------------------------
  const NAMES: Record<string, string> = { en: "English", es: "Spanish", fr: "French", de: "German" };
  let shown: EditorView | null = null;
  const cell = atlas.shell.statusItem({ id: "spelling", text: "", title: "Spelling", run: async () => {
    const view = shown;
    if (!view) return;
    const lang = await atlas.input("This note's language", { value: noteLanguage(view), hint: `${langs.join(", ") || "en"}: written as the note's lang: property`, ok: "Set" });
    if (lang?.trim()) await atlas.writeProperty(atlas.editor.path(view), "lang", lang.trim());
  } });
  function status(view: EditorView, lang: string, marked: number) {
    if (!view.hasFocus && shown && shown !== view && views.has(shown)) return;
    shown = view;
    const loading = spellers.get(lang) === "loading", dicts = chosen.get(lang)?.join(" + ") ?? "no dictionary";
    const learned = [...(counts.get(lang)?.values() ?? [])].filter(([u, n]) => (u >= minUses() && n >= minNotes()) || u >= 8).length;
    cell.set(`${lang.toUpperCase()} ${loading ? "…" : marked ? `· ${marked} misspelled` : "✓"}`,
      `Spelling: ${NAMES[lang] ?? lang} (${dicts}), ${langProperty(view) ? "from the note's lang: property" : "guessed from its words"}. `
      + `${marked} word${marked === 1 ? "" : "s"} marked on screen; ${learned} words learned from the vault, ${accepted.size} added by you. Click to set this note's language.`);
  }
  const isNote = (view: EditorView) => /\.(md|markdown)$/i.test(atlas.editor.path(view));

  /** The marked words of the visible prose; the word the caret ends is left alone while it is being typed. */
  function marks(view: EditorView): DecorationSet {
    if (!isNote(view)) { if (shown === view || !shown) cell.set(""); return V.Decoration.none; }
    const lang = noteLanguage(view);
    noteUses = new Map();
    for (const { word } of wordsOf(view.state.doc.sliceString(0, 200000))) noteUses.set(word, (noteUses.get(word) ?? 0) + 1);
    const tree = language.syntaxTree(view.state);
    const caret = view.state.selection.main.head;
    const front = frontMatterEnd(view.state.doc.sliceString(0, 4000));
    const out: ReturnType<typeof miss.range>[] = [];
    for (const { from, to } of view.visibleRanges) {
      for (const [a, b] of proseRanges((spec) => tree.iterate(spec), from, to, front)) {
        for (const w of wordsOf(view.state.sliceDoc(a, b), a)) {
          if (w.to === caret || aName(view, w)) continue;
          if (wrong(lang, w.word)) out.push(miss.range(w.from, w.to));
        }
      }
    }
    status(view, lang, out.length);
    return V.Decoration.set(out, true);
  }

  /** A capitalised word is taken as a name (Hubbard, Lanczos) and not checked: names are most of the capitalised words a
   *  dictionary lacks; the price is a typo at a sentence's start going unmarked. */
  function aName(_view: EditorView, w: Word): boolean {
    return /^\p{Lu}/u.test(w.word);
  }

  let pointed: { view: EditorView; word: Word; lang: string } | null = null;
  const plugin = V.ViewPlugin.fromClass(class {
    decorations: DecorationSet;
    timer = 0;
    constructor(readonly view: EditorView) { views.add(view); this.decorations = marks(view); }
    update(u: ViewUpdate) {
      if (u.transactions.some((t) => t.effects.some((e) => e.is(redraw)))) { this.decorations = marks(u.view); return; }
      if (u.docChanged) this.decorations = this.decorations.map(u.changes);
      if (u.docChanged || u.viewportChanged || u.selectionSet) {
        clearTimeout(this.timer);
        this.timer = window.setTimeout(() => this.view.dispatch({ effects: redraw.of(null) }), u.docChanged ? 400 : 120);
      }
    }
    destroy() { clearTimeout(this.timer); views.delete(this.view); }
  }, {
    decorations: (p) => p.decorations,
    eventHandlers: {
      // the word under a right-click, kept for the menu (which is not told where the click was); on the press,
      // which comes before the menu whichever handler opens it
      mousedown(e: MouseEvent, view: EditorView) { if (e.button === 2) point(e, view); },
      contextmenu(e: MouseEvent, view: EditorView) { point(e, view); },
    },
  });
  function point(e: MouseEvent, view: EditorView) {
    pointed = null;
    const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
    if (pos === null) return;
    const line = view.state.doc.lineAt(pos);
    const word = wordsOf(line.text, line.from).find((w) => w.from <= pos && pos <= w.to);
    const lang = noteLanguage(view);
    if (word && isNote(view) && !aName(view, word) && wrong(lang, word.word)) pointed = { view, word, lang };
  }
  atlas.editor.extension([
    plugin,
    V.EditorView.baseTheme({ ".cm-spell-miss": { textDecoration: "underline wavy var(--red)", textDecorationThickness: "1px", textUnderlineOffset: "3px", textDecorationSkipInk: "none" } }),
  ]);

  atlas.shell.menu("editor", () => {
    const p = pointed;
    if (!p) return [];
    const s = speller(p.lang);
    const replace = (by: string) => () => p.view.dispatch({ changes: { from: p.word.from, to: p.word.to, insert: by }, userEvent: "input.spelling" });
    const uses = (w: string) => counts.get(p.lang)?.get(w)?.[0] ?? 0;
    const found = s ? suggestions(p.word.word, (w) => s.correct(w), (w) => s.suggest(w), uses) : [];
    return [
      ...found.map((by) => ({ label: by, run: replace(by), icon: "check", top: true })),
      ...(found.length ? [] : [{ label: "No suggestions", run: () => {}, disabled: true, top: true }]),
      { label: `Add “${p.word.word}” to this vault's words`, icon: "plus", top: true, run: async () => {
        const text = (await atlas.exists(WORDS_NOTE)) ? await atlas.readText(WORDS_NOTE) : "";
        await atlas.writeText(WORDS_NOTE, addWord(text, p.word.word));
        await readAccepted();
      } },
    ];
  });

  atlas.onFilesChanged((paths) => {
    if (!paths.length || paths.includes(WORDS_NOTE)) void readAccepted();
    // a saved note: its counts replaced (after the first count, which reads every note anyway)
    const notes = paths.filter((p) => /\.md$/i.test(p) && !p.startsWith(".atlas/"));
    if (counted && notes.length) void count(notes).then(redrawAll);
  });
  await readAccepted();
  // not awaited: marks wait for the dictionaries, not the other way round
  void countVault().catch((e) => console.warn("spelling: the vault's words were not counted:", e));
}
