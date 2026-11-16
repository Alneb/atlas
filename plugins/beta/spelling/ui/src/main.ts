// Spelling: a wavy line under a word of a note's prose that neither the language's Hunspell dictionary nor the vault
// knows (docs/design/DESIGN-spelling-predictor.md). The dictionaries come from the machine through the helper and are
// loaded here, when a note in that language is first shown; the vault's words are counted once per start, in the
// background. Right-click on a marked word: suggestions, and "Add to this vault's words" (a Markdown note).
import type { EditorView, ViewUpdate, DecorationSet } from "@codemirror/view";
import nspell from "nspell";
import type { PluginApi } from "../../../../../ui/src/lib/plugin-api";
import { frontMatterEnd, guessLanguage, proseRanges, wordsOf, type Word } from "../../../../../ui/src/lib/editor/prose";
import { chooseDictionaries } from "../../../../../ui/src/lib/editor/dictionaries";
import { shownName } from "../../../../../ui/src/lib/paths";
import { langOf, languagesFrom, parseVariants, writeLanguages, writeVariants } from "./langs";
import { vaultCounter } from "../../../../../ui/src/lib/editor/vault-count";
import { isWrong } from "./judge";
import { LETTERS, suggestions } from "../../../../../ui/src/lib/editor/spell-rank";
import type { WordFreq } from "../../../../../ui/src/lib/editor/word-freq";
import { addWord, parseWords, removeWord, WORDS_NOTE } from "./words";
import { drawPanel, drawSettings, type Marked, type PanelModel } from "./panel";

type Speller = ReturnType<typeof nspell>;
/** word → [uses, notes using it], per language */
type Counts = Map<string, Map<string, [number, number]>>;

export async function register(atlas: PluginApi) {
  const { state: S, view: V, language } = atlas.editor.codemirror;
  const setting = (k: string) => atlas.plugin.settings[k];
  const minUses = () => Number(setting("min_uses") ?? 3);
  const minNotes = () => Number(setting("min_notes") ?? 2);

  /** A notice said once on this device (a page per pane or window would each say it again). */
  const tellOnce = (key: string, text: string) => {
    const k = `atlas.spelling.told.${key}`;
    try { if (localStorage.getItem(k)) return; localStorage.setItem(k, "1"); } catch { /* no storage: say it */ }
    atlas.toast("Spelling", text, "info");
  };

  // --- what is known -------------------------------------------------------------------------------------------
  const installed: string[] = ((await atlas.helper.call("dictionaries", { folder: setting("folder") }).catch(() => [])) as string[]) ?? [];
  /** every installed language's dictionaries, the ones turned on and the main one (langs.ts) */
  const { chosen, langs, main: fallback } = languagesFrom(installed, atlas.plugin.settings);
  const NAMES: Record<string, string> = { en: "English", es: "Spanish", fr: "French", de: "German", it: "Italian", pt: "Portuguese", ca: "Catalan", nl: "Dutch", pl: "Polish", ru: "Russian", sv: "Swedish", da: "Danish", nb: "Norwegian", fi: "Finnish", cs: "Czech", el: "Greek", tr: "Turkish", ro: "Romanian", hu: "Hungarian", uk: "Ukrainian", gl: "Galician", eu: "Basque" };
  const nameOf = (l: string) => NAMES[l] ?? l;
  if (!installed.length) tellOnce("no-dictionary", "No Hunspell dictionary here, nor in the vault's .atlas/dictionaries: only the vault's own words are known, so nothing is marked. Open the vault once on a computer that has one (Settings → Spelling keeps it in the vault), or name a folder there.");
  // a machine with the dictionaries in use copies them into the vault, for the server and the phone (none of their own)
  const inUse = [...new Set(langs.flatMap((l) => chosen.get(l) ?? []))];
  if (setting("keep_in_vault") !== false && inUse.length)
    void (atlas.helper.call("keep", { names: inUse, folder: setting("folder") }, { timeout: 120 }) as Promise<string[]>)
      .then((kept) => { if (kept.length) console.info(`spelling: kept ${kept.join(", ")} in the vault (.atlas/dictionaries) for the devices that have none`); })
      .catch((e) => console.warn("spelling: the dictionaries were not kept in the vault:", e));

  /** A language's dictionaries, loaded the first time a note in it is shown: null until they are there. */
  const spellers = new Map<string, Speller[] | "loading">();
  const speller = (lang: string): { correct(w: string): boolean; suggest(w: string): string[] } | null => {
    const have = spellers.get(lang);
    if (have) return have === "loading" ? null : { correct: (w) => have.some((s) => s.correct(w)), suggest: (w) => [...new Set(have.flatMap((s) => s.suggest(w)))] };
    const names = chosen.get(lang);
    if (!names) return null;
    spellers.set(lang, "loading");
    freqOf(lang); // its frequencies, for ranking suggestions, load beside it
    void Promise.all(names.map((name) => atlas.helper.call("dictionary", { name, folder: setting("folder") }, { timeout: 60 }) as Promise<{ aff: string; dic: string }>))
      .then((dicts) => { spellers.set(lang, dicts.map(({ aff, dic }) => nspell(aff, dic))); redrawAll(); })
      .catch((e) => { console.warn(`spelling: ${names.join(", ")} did not load:`, e); spellers.delete(lang); });
    return null;
  };

  /** The language's general frequencies (plugin API v26), for ranking suggestions: undefined until loaded. */
  const freqs = new Map<string, WordFreq | null>();
  const freqOf = (lang: string): WordFreq | undefined => {
    if (!atlas.editor.words) return undefined;
    if (!freqs.has(lang)) { freqs.set(lang, null); void atlas.editor.words(lang).then((w) => freqs.set(lang, w)).catch(() => {}); }
    return freqs.get(lang) ?? undefined;
  };
  /** What suggestions are made from, for a language: its dictionaries, the vault's uses, the language's frequencies. */
  const suggestFor = (lang: string, s: { correct(w: string): boolean; suggest(w: string): string[] }) => {
    const f = freqOf(lang);
    return (word: string) => suggestions(word, { correct: (x) => s.correct(x), dictionary: (x) => s.suggest(x), uses: (x) => counts.get(lang)?.get(x)?.[0] ?? 0, zipf: f?.zipf, letters: LETTERS[lang] });
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
  // the open Settings sections: drawn once, so told when the words or the counts change (they come after the page opens)
  const settingsRedraws = new Set<() => void>();
  function redrawAll() { for (const v of views) v.dispatch({ effects: redraw.of(null) }); for (const r of settingsRedraws) r(); }

  const langProperty = (view: EditorView) => {
    const text = view.state.doc.sliceString(0, 4000);
    return /^---[\s\S]*?^lang:\s*([\w-]+)/m.exec(text.slice(0, frontMatterEnd(text)))?.[1];
  };
  /** The note's lang: property when it names an installed language (even one turned off: it was said for this note),
   *  else guessed among the languages turned on. */
  const noteLanguage = (view: EditorView) => {
    const given = langProperty(view), l = given ? langOf(given) : "";
    return chosen.has(l) ? l : guessLanguage(view.state.doc.sliceString(0, 20000), langs.length ? langs : [fallback], fallback);
  };

  // --- the bottom bar: the note's language and what is marked; a click opens the Spelling panel (panel.ts) ---------
  // It follows what is in front: the focused editor, else the active tab when it is a note's editor, else a prose editor
  // (the mail composer, which is spell-checked) last typed in and still shown inside the active plugin tab. Anything
  // else in front (a code file, a PDF, a terminal, a web page) takes the cell away. Each view's language and marks are
  // kept as they are drawn, so switching tabs updates the cell at once instead of after the next redraw.
  let shown: EditorView | null = null;
  let lastFocused: EditorView | null = null;
  const seen = new WeakMap<EditorView, { lang: string; marked: number }>();
  let front = atlas.context();
  let cell: ReturnType<typeof atlas.shell.statusItem> | null = null;
  let cellSaid = "";
  /** Shows the cell with this text, or takes it away (an empty cell would still be a blank button with a tooltip). */
  const sayCell = (text: string, title = "") => {
    if (text + "\n" + title === cellSaid) return;
    cellSaid = text + "\n" + title;
    if (!text) { cell?.remove(); cell = null; return; }
    if (cell) { cell.set(text, title); return; }
    cell = atlas.shell.statusItem({
      id: "spelling", text, title, panelWidth: 420,
      // before plugin API 27 a click runs this: the settings, where the language and dictionaries are
      run: () => atlas.plugin.openSettings(),
      panel: (host, close) => { if (shown) drawPanel(host, () => panelModel(shown!), actions(shown, close)); },
    });
  };
  const live = (v: EditorView | null): v is EditorView => !!v && views.has(v) && v.dom.isConnected;
  /** A note open in a tab (not a prose editor's made-up name such as the composer's). */
  const inTab = (path: string) => front.open.some((p) => p.path === path) || front.active?.path === path;
  function current(): EditorView | null {
    const list = [...views].filter(live);
    const focused = list.find((v) => v.hasFocus);
    if (focused) return isNote(focused) ? focused : null;
    const a = front.active;
    if (a?.kind === "editor") {
      const mine = list.filter((v) => atlas.editor.path(v) === a.path && isNote(v));
      return mine.find((v) => v === lastFocused) ?? mine.find((v) => v.dom.offsetParent !== null) ?? mine[0] ?? null;
    }
    if (a?.kind === "plugin" && live(lastFocused) && lastFocused.dom.offsetParent !== null && isNote(lastFocused) && !inTab(atlas.editor.path(lastFocused))) return lastFocused;
    return null;
  }
  function refreshCell() {
    const view = current(), at = view && seen.get(view);
    shown = view;
    if (!view || !at) { sayCell(""); return; }
    const { lang, marked } = at;
    const path = atlas.editor.path(view);
    const what = inTab(path) ? `“${shownName(path)}”` : "the text being written";
    const loading = spellers.get(lang) === "loading", dicts = chosen.get(lang)?.join(" + ") ?? "no dictionary";
    sayCell(`${lang.toUpperCase()} ${loading ? "…" : marked ? `· ${marked} misspelled` : "✓"}`,
      `Spelling of ${what}: ${nameOf(lang)} (${dicts}), ${langProperty(view) ? "from its lang: property" : "guessed from its words"}. `
      + `${marked} word${marked === 1 ? "" : "s"} marked on screen; ${learnedIn(lang)} words learned from the vault, ${accepted.size} added by you. Click for the panel: the language, the marked words and their fixes, your words.`);
  }
  atlas.onContext((c) => { front = c; refreshCell(); });
  /** Every word marked in the whole note, not only on screen, with its likeliest fixes. */
  function markedIn(view: EditorView, lang: string): Marked[] {
    const tree = language.syntaxTree(view.state), front = frontMatterEnd(view.state.doc.sliceString(0, 4000));
    const s = speller(lang), suggest = s ? suggestFor(lang, s) : null;
    const out: Marked[] = [];
    for (const [a, b] of proseRanges((spec) => tree.iterate(spec), 0, view.state.doc.length, front))
      for (const w of wordsOf(view.state.sliceDoc(a, b), a))
        if (!aName(view, w) && wrong(lang, w.word)) out.push({ word: w.word, from: w.from, to: w.to, line: view.state.doc.lineAt(w.from).number, fixes: [] });
    // fixes for the first ones only: the rest are reached by scrolling the note anyway
    for (const m of out.slice(0, 60)) m.fixes = suggest ? suggest(m.word).slice(0, 3) : [];
    return out;
  }
  function panelModel(view: EditorView): PanelModel {
    const lang = noteLanguage(view), s = speller(lang);
    const learned = [...(counts.get(lang)?.entries() ?? [])].filter(([, [u, n]]) => (u >= minUses() && n >= minNotes()) || u >= 8);
    const terms = s ? learned.filter(([w]) => !s.correct(w) && !s.correct(w.toLowerCase())).sort((x, y) => y[1][0] - x[1][0]).slice(0, 40).map(([w]) => w) : [];
    return {
      lang,
      choices: [...new Set([...langs, lang])].map((l) => ({ lang: l, name: nameOf(l) })),
      source: langProperty(view) ? "set for this note (lang: property)" : "guessed from its words",
      dictionaries: chosen.get(lang)?.join(" + ") ?? "no dictionary installed",
      loading: spellers.get(lang) === "loading",
      marked: markedIn(view, lang),
      added: [...accepted].sort((a, b) => a.localeCompare(b)),
      learned: { count: learned.length, terms },
    };
  }
  const editWords = async (change: (text: string) => string) => {
    const text = (await atlas.exists(WORDS_NOTE)) ? await atlas.readText(WORDS_NOTE) : "";
    await atlas.writeText(WORDS_NOTE, change(text));
    await readAccepted();
  };
  const learnedIn = (lang: string) => [...(counts.get(lang)?.values() ?? [])].filter(([u, n]) => (u >= minUses() && n >= minNotes()) || u >= 8).length;

  // --- Settings → Spelling: the languages (on/off, the main one, each one's variant), your words (panel.ts) ---------
  // The three language settings are hidden in the generated form (plugin.toml): only this section writes them, with
  // the installed dictionaries as the only choices. Its model is read from ctx.settings(), so it shows what is saved.
  atlas.plugin.registerSettingsSection?.({ id: "words", title: "Languages and words", place: "before",
    hint: "The languages this machine's dictionaries give, which are checked, and the words you added; the form below has the finer settings.",
    mount: (host, ctx) => {
      const now = () => languagesFrom(installed, ctx.settings());
      const usualOf = (l: string) => chooseDictionaries(installed, "").get(l) ?? chosen.get(l) ?? [];
      const again = drawSettings(host, () => {
        const l = now(), variants = parseVariants(ctx.settings().dictionaries);
        return {
          main: l.main,
          langs: l.available.map((lang) => {
            const own = installed.filter((d) => langOf(d) === lang).sort();
            const usual = usualOf(lang).join(" + "), picked = variants.get(lang) ?? "";
            const options = [{ value: "", label: `${usual} (usual)` }, ...own.filter((d) => d !== usual).map((d) => ({ value: d, label: d }))];
            if (picked && !options.some((o) => o.value === picked)) options.push({ value: picked, label: picked.replace(/\+/g, " + ") });
            return { lang, name: nameOf(lang), on: l.langs.includes(lang), variant: picked, variants: options, learned: learnedIn(lang) };
          }),
          added: [...accepted].sort((a, b) => a.localeCompare(b)),
        };
      }, {
        setMain: async (lang) => { await ctx.save({ language: lang }); },
        setOn: async (lang, on) => {
          const l = now(), next = on ? [...l.langs, lang] : l.langs.filter((x) => x !== lang);
          if (!next.length) return;
          await ctx.save({ languages: writeLanguages(next, l), ...(on || lang !== l.main ? {} : { language: null }) });
        },
        setVariant: async (lang, value) => {
          const v = parseVariants(ctx.settings().dictionaries);
          if (value) v.set(lang, value); else v.delete(lang);
          await ctx.save({ dictionaries: writeVariants(v) });
        },
        add: (w) => editWords((t) => addWord(t, w)),
        remove: (w) => editWords((t) => removeWord(t, w)),
      });
      settingsRedraws.add(again);
      return () => { settingsRedraws.delete(again); };
    },
  });
  const actions = (view: EditorView, close: () => void) => ({
    // a mail being written is not a file: its language stays guessed
    setLang: (l: string) => {
      close();
      const path = atlas.editor.path(view);
      void atlas.exists(path).then((is) => is ? atlas.writeProperty(path, "lang", l) : atlas.toast("Spelling", "This text is not a note, so it has no lang: property: its language is guessed from its words.", "info"));
    },
    select: (m: Marked) => { close(); view.dispatch({ selection: { anchor: m.from, head: m.to }, scrollIntoView: true }); view.focus(); },
    // the note may have changed since the panel was drawn: only the same word at the same place is replaced
    fix: (m: Marked, by: string) => { if (view.state.sliceDoc(m.from, m.to) === m.word) view.dispatch({ changes: { from: m.from, to: m.to, insert: by }, userEvent: "input.spelling" }); },
    add: (word: string) => editWords((t) => addWord(t, word)),
    remove: (word: string) => editWords((t) => removeWord(t, word)),
    settings: () => { close(); atlas.plugin.openSettings(); },
  });
  const isNote = (view: EditorView) => /\.(md|markdown)$/i.test(atlas.editor.path(view));

  /** The marked words of the visible prose; the word the caret ends is left alone while it is being typed. */
  function marks(view: EditorView): DecorationSet {
    if (!isNote(view)) { seen.delete(view); refreshCell(); return V.Decoration.none; }
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
    seen.set(view, { lang, marked: out.length });
    refreshCell();
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
      if (u.focusChanged) { if (u.view.hasFocus) lastFocused = u.view; refreshCell(); }
      if (u.docChanged) this.decorations = this.decorations.map(u.changes);
      if (u.docChanged || u.viewportChanged || u.selectionSet) {
        clearTimeout(this.timer);
        this.timer = window.setTimeout(() => this.view.dispatch({ effects: redraw.of(null) }), u.docChanged ? 400 : 120);
      }
    }
    destroy() { clearTimeout(this.timer); views.delete(this.view); if (lastFocused === this.view) lastFocused = null; queueMicrotask(refreshCell); }
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
    const found = s ? suggestFor(p.lang, s)(p.word.word) : [];
    return [
      ...found.map((by) => ({ label: by, run: replace(by), icon: "check", top: true })),
      ...(found.length ? [] : [{ label: "No suggestions", run: () => {}, disabled: true, top: true }]),
      { label: `Add “${p.word.word}” to this vault's words`, icon: "plus", top: true, run: () => editWords((t) => addWord(t, p.word.word)) },
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
