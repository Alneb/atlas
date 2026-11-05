// Spelling: a wavy line under a word of a note's prose that neither the language's Hunspell dictionary nor the vault
// knows (docs/design/DESIGN-spelling-predictor.md). The dictionaries come from the machine through the helper and are
// loaded here, when a note in that language is first shown; the vault's words are counted once per start, in the
// background. Right-click on a marked word: suggestions, and "Add to this vault's words" (a Markdown note).
import type { EditorView, ViewUpdate, DecorationSet } from "@codemirror/view";
import nspell from "nspell";
import type { PluginApi } from "../../../../../ui/src/lib/plugin-api";
import { frontMatterEnd, guessLanguage, proseRanges, wordsOf, type Word } from "../../../../../ui/src/lib/editor/prose";
import { suggestions } from "./suggest";
import { addWord, parseWords, WORDS_NOTE } from "./words";

type Speller = ReturnType<typeof nspell>;
/** word → [uses, notes using it], per language */
type Counts = Map<string, Map<string, [number, number]>>;

/** The dictionary a language uses when the setting names none: the most common variant installed. */
const PREFERRED: Record<string, string[]> = { en: ["en_US", "en_GB", "en_CA", "en_AU"], es: ["es_ES", "es_MX", "es_AR"], fr: ["fr_FR", "fr_CA"], de: ["de_DE"] };

export async function register(atlas: PluginApi) {
  const { state: S, view: V, language } = atlas.editor.codemirror;
  const setting = (k: string) => atlas.plugin.settings[k];
  const minUses = () => Number(setting("min_uses") ?? 3);
  const minNotes = () => Number(setting("min_notes") ?? 2);

  // --- what is known -------------------------------------------------------------------------------------------
  const installed: string[] = ((await atlas.helper.call("dictionaries", { folder: setting("folder") }).catch(() => [])) as string[]) ?? [];
  /** language → dictionary name, from the setting (`en=en_GB, es=es_MX`) over the preferred installed ones */
  const chosen = new Map<string, string>();
  for (const [lang, names] of Object.entries(PREFERRED)) { const n = names.find((x) => installed.includes(x)); if (n) chosen.set(lang, n); }
  for (const part of String(setting("dictionaries") ?? "").split(/[,\s]+/)) {
    const m = /^([a-z]{2,3})=([\w-]+)$/.exec(part.trim());
    if (m && installed.includes(m[2])) chosen.set(m[1], m[2]);
  }
  const langs = [...chosen.keys()];
  const fallback = String(setting("language") || langs[0] || "en");
  if (!installed.length) atlas.toast("Spelling", "No Hunspell dictionary on this machine: only the vault's own words are known, so nothing is marked. Settings → Spelling names a folder.", "info");

  const spellers = new Map<string, Speller | "loading">();
  const speller = (lang: string): Speller | null => {
    const have = spellers.get(lang);
    if (have) return have === "loading" ? null : have;
    const name = chosen.get(lang);
    if (!name) return null;
    spellers.set(lang, "loading");
    void (atlas.helper.call("dictionary", { name, folder: setting("folder") }, { timeout: 60 }) as Promise<{ aff: string; dic: string }>)
      .then(({ aff, dic }) => { spellers.set(lang, nspell(aff, dic)); redrawAll(); })
      .catch((e) => { console.warn(`spelling: ${name} did not load:`, e); spellers.delete(lang); });
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
  const countVault = async () => {
    const notes = (await atlas.helper.call("notes")) as string[];
    for (let i = 0; i < notes.length; i += 120) {
      const part = (await atlas.helper.call("count", { paths: notes.slice(i, i + 120), langs: langs.length ? langs : [fallback], fallback })) as Record<string, Record<string, [number, number]>>;
      for (const [lang, table] of Object.entries(part)) {
        const into = counts.get(lang) ?? counts.set(lang, new Map()).get(lang)!;
        for (const [w, [u, n]] of Object.entries(table)) { const r = into.get(w); if (r) { r[0] += u; r[1] += n; } else into.set(w, [u, n]); }
      }
    }
    redrawAll();
  };

  // --- judging a word ------------------------------------------------------------------------------------------
  const vaultKnows = (lang: string, w: string) => {
    const t = counts.get(lang);
    const r = t?.get(w) ?? t?.get(w.toLowerCase());
    return !!r && r[0] >= minUses() && r[1] >= minNotes();
  };
  /** Is this word wrong? null while the language's dictionary is not there (nothing is marked then). */
  const wrong = (lang: string, w: string): boolean | null => {
    if (w.length < 2 || /\p{Lu}/u.test(w.slice(1))) return false; // acronyms, CamelCase, names like McDonald
    if (accepted.has(w) || accepted.has(w.toLowerCase()) || vaultKnows(lang, w)) return false;
    const s = speller(lang);
    if (!s) return null;
    return !(s.correct(w) || (/^\p{Lu}/u.test(w) && s.correct(w.toLowerCase())));
  };

  // --- the editor ----------------------------------------------------------------------------------------------
  const miss = V.Decoration.mark({ class: "cm-spell-miss" });
  const views = new Set<EditorView>();
  const redraw = S.StateEffect.define<null>();
  function redrawAll() { for (const v of views) v.dispatch({ effects: redraw.of(null) }); }

  const noteLanguage = (view: EditorView) => {
    const text = view.state.doc.sliceString(0, 20000);
    return guessLanguage(text, langs.length ? langs : [fallback], fallback, /^---[\s\S]*?^lang:\s*([\w-]+)/m.exec(text.slice(0, frontMatterEnd(text)))?.[1]);
  };
  const isNote = (view: EditorView) => /\.(md|markdown)$/i.test(atlas.editor.path(view));

  /** The marked words of the visible prose; the word the caret ends is left alone while it is being typed. */
  function marks(view: EditorView): DecorationSet {
    if (!isNote(view)) return V.Decoration.none;
    const lang = noteLanguage(view);
    const tree = language.syntaxTree(view.state);
    const caret = view.state.selection.main.head;
    const front = frontMatterEnd(view.state.doc.sliceString(0, 4000));
    const out: ReturnType<typeof miss.range>[] = [];
    for (const { from, to } of view.visibleRanges) {
      for (const [a, b] of proseRanges((spec) => tree.iterate(spec), from, to, front)) {
        for (const w of wordsOf(view.state.sliceDoc(a, b), a)) {
          if (w.to === caret) continue;
          if (wrong(lang, w.word)) out.push(miss.range(w.from, w.to));
        }
      }
    }
    return V.Decoration.set(out, true);
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
    if (word && isNote(view) && wrong(lang, word.word)) pointed = { view, word, lang };
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
      ...found.map((by) => ({ label: by, run: replace(by), icon: "check" })),
      ...(found.length ? [] : [{ label: "No suggestions", run: () => {}, disabled: true }]),
      { label: `Add “${p.word.word}” to this vault's words`, icon: "plus", run: async () => {
        const text = (await atlas.exists(WORDS_NOTE)) ? await atlas.readText(WORDS_NOTE) : "";
        await atlas.writeText(WORDS_NOTE, addWord(text, p.word.word));
        await readAccepted();
      } },
    ];
  });

  atlas.onFilesChanged((paths) => { if (!paths.length || paths.includes(WORDS_NOTE)) void readAccepted(); });
  await readAccepted();
  // not awaited: marks wait for the dictionaries, not the other way round
  void countVault().catch((e) => console.warn("spelling: the vault's words were not counted:", e));
}
