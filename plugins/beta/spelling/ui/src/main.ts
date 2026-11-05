// Spelling: a wavy line under a word of a note's prose that neither the language's Hunspell dictionary nor the vault
// knows (docs/design/DESIGN-spelling-predictor.md). The dictionaries come from the machine through the helper and are
// loaded here, when a note in that language is first shown; the vault's words are counted once per start, in the
// background. Right-click on a marked word: suggestions, and "Add to this vault's words" (a Markdown note).
import type { EditorView, ViewUpdate, DecorationSet } from "@codemirror/view";
import nspell from "nspell";
import type { PluginApi } from "../../../../../ui/src/lib/plugin-api";
import { frontMatterEnd, guessLanguage, proseRanges, wordsOf, type Word } from "../../../../../ui/src/lib/editor/prose";
import { chooseDictionaries } from "../../../../../ui/src/lib/editor/dictionaries";
import { vaultCounter } from "../../../../../ui/src/lib/editor/vault-count";
import { isWrong } from "./judge";
import { suggestions } from "./suggest";
import { addWord, parseWords, WORDS_NOTE } from "./words";

type Speller = ReturnType<typeof nspell>;
/** word → [uses, notes using it], per language */
type Counts = Map<string, Map<string, [number, number]>>;

export async function register(atlas: PluginApi) {
  const { state: S, view: V, language } = atlas.editor.codemirror;
  const setting = (k: string) => atlas.plugin.settings[k];
  const minUses = () => Number(setting("min_uses") ?? 3);
  const minNotes = () => Number(setting("min_notes") ?? 2);

  // --- what is known -------------------------------------------------------------------------------------------
  const installed: string[] = ((await atlas.helper.call("dictionaries", { folder: setting("folder") }).catch(() => [])) as string[]) ?? [];
  /** language → dictionary names, from the setting (`en=en_GB, es=es_MX+es_AR`) over the preferred installed ones */
  const chosen = chooseDictionaries(installed, setting("dictionaries"));
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

  /** The vault's words, learned at start and kept current as notes are saved (lib/editor/vault-count.ts). */
  type Counted = { lang: string; words: Record<string, number> };
  const apply = (entry: Counted, sign: 1 | -1) => {
    const into = counts.get(entry.lang) ?? counts.set(entry.lang, new Map()).get(entry.lang)!;
    for (const [w, u] of Object.entries(entry.words)) {
      const r = into.get(w) ?? [0, 0];
      r[0] += sign * u; r[1] += sign;
      if (r[1] <= 0) into.delete(w); else into.set(w, r);
    }
  };
  const vault = vaultCounter<Counted>(
    async (paths) => (await atlas.helper.call("count", { paths, langs: langs.length ? langs : [fallback], fallback })) as Record<string, Counted>,
    apply, "spelling");
  const countVault = async () => {
    // what is learned shows as it comes
    await vault.countAll((await atlas.helper.call("notes")) as string[], (done) => { if (done % 200 === 0) redrawAll(); });
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
  const cell = atlas.shell.statusItem({ id: "spelling", text: "", title: "Spelling", run: () => { if (shown) panel(shown); } });
  /** The cell's panel: the note's language to switch, and every word marked in the whole note, with its fixes;
   *  choosing a word selects it in the note. */
  function panel(view: EditorView) {
    const lang = noteLanguage(view), path = atlas.editor.path(view);
    const tree = language.syntaxTree(view.state), front = frontMatterEnd(view.state.doc.sliceString(0, 4000));
    const marked: Word[] = [];
    for (const [a, b] of proseRanges((spec) => tree.iterate(spec), 0, view.state.doc.length, front))
      for (const w of wordsOf(view.state.sliceDoc(a, b), a)) if (!aName(view, w) && wrong(lang, w.word)) marked.push(w);
    const s = speller(lang);
    const uses = (w: string) => counts.get(lang)?.get(w)?.[0] ?? 0;
    const choices = [...new Set([...langs, lang])];
    atlas.pick({
      placeholder: marked.length ? `${marked.length} marked in this note: type to find one` : "Nothing marked in this note", tag: "Spelling", icon: "check",
      items: [
        ...choices.map((l) => ({ value: `lang:${l}`, title: `${NAMES[l] ?? l}${l === lang ? "  ✓" : ""}`, detail: l === lang ? (langProperty(view) ? "set for this note" : "guessed from its words") : `write this note in ${NAMES[l] ?? l}`, section: "Language", icon: "globe" as const })),
        ...marked.map((w) => ({
          value: `at:${w.from}:${w.to}`, title: w.word, section: `Marked (${marked.length})`, icon: "edit" as const,
          detail: `line ${view.state.doc.lineAt(w.from).number}${s ? ` · ${suggestions(w.word, (x) => s.correct(x), (x) => s.suggest(x), uses).slice(0, 3).join(", ") || "no suggestions"}` : ""}`,
        })),
      ],
      onpick: async (value) => {
        if (value.startsWith("lang:")) { await atlas.writeProperty(path, "lang", value.slice(5)); return; }
        const [, a, b] = value.split(":").map(Number);
        view.dispatch({ selection: { anchor: a, head: b }, scrollIntoView: true });
        view.focus();
      },
    });
  }
  function status(view: EditorView, lang: string, marked: number) {
    if (!view.hasFocus && shown && shown !== view && views.has(shown)) return;
    shown = view;
    const loading = spellers.get(lang) === "loading", dicts = chosen.get(lang)?.join(" + ") ?? "no dictionary";
    const learned = [...(counts.get(lang)?.values() ?? [])].filter(([u, n]) => (u >= minUses() && n >= minNotes()) || u >= 8).length;
    cell.set(`${lang.toUpperCase()} ${loading ? "…" : marked ? `· ${marked} misspelled` : "✓"}`,
      `Spelling: ${NAMES[lang] ?? lang} (${dicts}), ${langProperty(view) ? "from the note's lang: property" : "guessed from its words"}. `
      + `${marked} word${marked === 1 ? "" : "s"} marked on screen; ${learned} words learned from the vault, ${accepted.size} added by you. Click for the marked words and the note's language.`);
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
    if (vault.counted && notes.length) void vault.count(notes).then(redrawAll);
  });
  await readAccepted();
  // not awaited: marks wait for the dictionaries, not the other way round
  void countVault().catch((e) => console.warn("spelling: the vault's words were not counted:", e));
}
