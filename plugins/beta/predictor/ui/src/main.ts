// Predictor: the likely rest of the word being typed, and the next word when the vault is sure of it, shown faint
// after the caret (docs/design/DESIGN-spelling-predictor.md). Learned from the vault's notes when Atlas starts, per
// language. Tab or → at the end of a line takes it all, Ctrl+→ one word; anything else typed goes on as if it were not
// there. Only in a note's prose, right after typing: never in math, code, links or a .tex file (Snippets own math).
import type { EditorView, ViewUpdate, DecorationSet } from "@codemirror/view";
import type { Transaction } from "@codemirror/state";
import type { PluginApi } from "../../../../../ui/src/lib/plugin-api";
import { frontMatterEnd, guessLanguage, proseRanges, wordsOf } from "../../../../../ui/src/lib/editor/prose";
import { addSentences, emptyModel, predict, unpackSentences, type Guess, type Lexicon, type Model } from "./model";
import { vaultCounter } from "../../../../../ui/src/lib/editor/vault-count";

const LANGS = ["en", "es", "fr", "de"];

export async function register(atlas: PluginApi) {
  const { state: S, view: V, language } = atlas.editor.codemirror;
  const setting = (k: string) => atlas.plugin.settings[k];
  const opts = () => ({ min: Number(setting("min_count") ?? 3), nextWord: setting("next_word") !== false });
  const fallback = () => String(setting("language") || "en");

  const models = new Map<string, Model>();
  /** The vault learned at start and kept current as notes are saved (lib/editor/vault-count.ts): each note's sentences
   *  are kept as plain words, so its old counts can leave when it changes. */
  type Counted = { lang: string; text: string };
  const vault = vaultCounter<Counted>(
    async (paths) => (await atlas.helper.call("count", { paths, langs: LANGS, fallback: fallback() })) as Record<string, Counted>,
    (e, sign) => addSentences(models.get(e.lang) ?? models.set(e.lang, emptyModel()).get(e.lang)!, unpackSentences(e.text), sign),
    "predictor");
  const learn = async () => vault.countAll((await atlas.helper.call("notes")) as string[]);
  atlas.onFilesChanged((paths) => {
    const notes = paths.filter((p) => /\.md$/i.test(p) && !p.startsWith(".atlas/"));
    if (vault.counted && notes.length) void vault.count(notes);
  });

  /** A language's dictionary words, loaded the first time a note in it asks: undefined until there (or when none). */
  const lexicons = new Map<string, Lexicon | "loading">();
  const lexicon = (lang: string): Lexicon | undefined => {
    if (setting("dictionary") === false) return undefined;
    const have = lexicons.get(lang);
    if (have) return have === "loading" ? undefined : have;
    lexicons.set(lang, "loading");
    void (atlas.helper.call("lexicon", { lang }, { timeout: 60 }) as Promise<string>)
      .then((text) => lexicons.set(lang, text ? text.split("\n").sort() : []))
      .catch((e) => { console.warn(`predictor: the ${lang} dictionary did not load:`, e); lexicons.set(lang, []); });
    return undefined;
  };

  // --- the ghost -----------------------------------------------------------------------------------------------
  const show = S.StateEffect.define<{ at: number; guess: Guess } | null>();
  class Ghost extends V.WidgetType {
    constructor(readonly text: string) { super(); }
    eq(o: Ghost) { return o.text === this.text; }
    toDOM() { const s = document.createElement("span"); s.className = "cm-predict-ghost"; s.textContent = this.text; s.setAttribute("aria-hidden", "true"); return s; }
    ignoreEvent() { return true; }
  }
  /** The ghost on screen: where it stands and what it says; any change but typing takes it away. */
  const ghost = S.StateField.define<{ at: number; guess: Guess } | null>({
    create: () => null,
    update(value, tr: Transaction) {
      for (const e of tr.effects) if (e.is(show)) return e.value;
      if (value && tr.docChanged) return typedThrough(value, tr);
      return tr.selection ? null : value;
    },
    provide: (f) => V.EditorView.decorations.from(f, (g): DecorationSet => g ? V.Decoration.set([V.Decoration.widget({ widget: new Ghost(g.guess.ghost), side: 1 }).range(g.at)]) : V.Decoration.none),
  });

  /** Typing the ghost's own next letters keeps the rest on screen (no flicker); anything else takes it away. */
  function typedThrough(g: { at: number; guess: Guess }, tr: Transaction): { at: number; guess: Guess } | null {
    let typed: string | null = null;
    tr.changes.iterChanges((from, to, _f, _t, ins) => { typed = typed === null && from === g.at && to === from ? ins.toString() : "\u0000"; });
    const t = typed as string | null;
    if (!t || t === "\u0000" || !g.guess.ghost.startsWith(t) || t.length >= g.guess.ghost.length) return null;
    const rest = g.guess.ghost.slice(t.length);
    return { at: g.at + t.length, guess: { ghost: rest, firstWord: g.guess.firstWord > t.length ? g.guess.firstWord - t.length : (/^\s*\S+/.exec(rest)?.[0].length ?? rest.length) } };
  }

  const isNote = (view: EditorView) => /\.(md|markdown)$/i.test(atlas.editor.path(view));
  /** Is the caret in prose: a note, text (not math or code), not in a link or the front matter. */
  function inProse(view: EditorView, at: number): boolean {
    if (!isNote(view) || atlas.editor.place(view, at).kind !== "text") return false;
    const line = view.state.doc.lineAt(at);
    const front = frontMatterEnd(view.state.doc.sliceString(0, 4000));
    const tree = language.syntaxTree(view.state);
    return proseRanges((spec) => tree.iterate(spec), line.from, line.to, front).some(([a, b]) => a <= at && at <= b && (at > a || a === line.from));
  }
  function guessAt(view: EditorView): { at: number; guess: Guess } | null {
    const sel = view.state.selection.main;
    if (!sel.empty) return null;
    const at = sel.head, line = view.state.doc.lineAt(at);
    if (/^[\p{L}\p{N}]/u.test(view.state.sliceDoc(at, at + 1)) || !inProse(view, at)) return null; // inside a word
    const text = view.state.doc.sliceString(0, 20000);
    const lang = guessLanguage(text, LANGS, fallback(), /^---[\s\S]*?^lang:\s*([\w-]+)/m.exec(text.slice(0, frontMatterEnd(text)))?.[1]);
    const m = models.get(lang) ?? emptyModel();
    const guess = predict(m, view.state.sliceDoc(Math.max(line.from, at - 300), at), wordsOf, { ...opts(), lexicon: lexicon(lang) });
    return guess ? { at, guess } : null;
  }

  const typer = V.ViewPlugin.fromClass(class {
    timer = 0;
    constructor(readonly view: EditorView) {}
    update(u: ViewUpdate) {
      // another part's redraw (effects only) leaves a pending guess alone; a change of text or caret replaces it
      if (!u.docChanged && !u.selectionSet) return;
      clearTimeout(this.timer);
      // only right after typing: never after a paste, an undo, a snippet or a move
      if (!u.transactions.some((t) => t.isUserEvent("input.type"))) return;
      this.timer = window.setTimeout(() => { const g = guessAt(this.view); if (g) this.view.dispatch({ effects: show.of(g) }); }, Number(setting("delay") ?? 60));
    }
    destroy() { clearTimeout(this.timer); }
  });

  /** Puts in the ghost, all of it or its first word; false when there is none (the key does its own job). */
  const accept = (whole: boolean) => (view: EditorView): boolean => {
    const g = view.state.field(ghost, false);
    if (!g || view.state.selection.main.head !== g.at) return false;
    const text = whole ? g.guess.ghost : g.guess.ghost.slice(0, g.guess.firstWord);
    view.dispatch({ changes: { from: g.at, insert: text }, selection: { anchor: g.at + text.length }, userEvent: "input.complete" });
    return true;
  };
  const atLineEnd = (view: EditorView) => view.state.selection.main.head === view.state.doc.lineAt(view.state.selection.main.head).to;

  atlas.editor.extension([
    ghost,
    typer,
    // above the editor's own Tab (which types a tab), beside Snippets': each acts only on its own thing (a ghost on
    // screen here; it shows only right after typing prose, where Snippets have no stop or bracket to walk)
    S.Prec.high(V.keymap.of([
      { key: "Tab", run: accept(true) },
      { key: "ArrowRight", run: (v) => atLineEnd(v) && accept(true)(v) },
      { key: "Ctrl-ArrowRight", run: accept(false) },
    ])),
    V.EditorView.baseTheme({ ".cm-predict-ghost": { color: "var(--text-faint, var(--text-muted))", opacity: "0.75", pointerEvents: "none" } }),
  ]);

  void learn().catch((e) => console.warn("predictor: the vault was not learned:", e));
}
