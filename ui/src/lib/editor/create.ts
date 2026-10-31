// Atlas's CodeMirror 6 editor: the base every file gets (vim, history, search, selection, keys, the change / focus /
// selection callbacks, where it was left), plus a note's (note-extensions.ts: the live preview…) or a code file's
// (code-extensions.ts: its language, its server…). Links clicked: link-clicks.ts. Wiring follows obsidian-web's
// editor.js; the textarea-adapter glue is deliberately not ported.
import { diff } from "../frontmatter-edit";
import { installImagePeek } from "../image-peek";
import { basename } from "../paths";
import type { Problems } from "../state.svelte";
import { SELECTION_TEXT_MAX } from "../context.svelte";
import { ansiColors } from "./ansi";
import "./md-format"; // registers the note keys' formatter (registry.noteFormat)
import { settings, onSettings } from "../settings.svelte";
import { EditorState, Compartment, Prec, Transaction, type Extension, type ChangeSet, type Text } from "@codemirror/state";
import { EditorView, keymap, drawSelection, dropCursor, rectangularSelection, highlightActiveLine, highlightSpecialChars } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { indentOnInput, LanguageDescription } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { searchKeymap, highlightSelectionMatches, search } from "@codemirror/search";
import { findPanel } from "./find-panel";
import { acceptCompletion, clearSnippet, closeCompletion, completionStatus } from "@codemirror/autocomplete";
import { vim, getCM } from "@replit/codemirror-vim";
import { bodyStart, redecorate } from "./live/live-preview.js";
import { onHighlightLanguage } from "../highlight";
import { onPropertySpec } from "../property-spec.svelte";
import { lspFor, lspKeys } from "./lsp";
import { mathPreview } from "./math-preview";
import { editorMenu } from "./menu";
import { pluginCompletions, pluginHooks } from "./plugin-hooks";
import { atlasTheme } from "./theme";
import { defineEx, exHooks, modeLabel, stashVisual, restoreVisual, desktopKeys, type VimModeLabel } from "./vim-glue";
import { tabKey, untouchedTaskList } from "./tab-keys";
import { placeOf, keepPlace, topIn, type Place } from "./places";
import { noteExtensions, mdOptions } from "./note-extensions";
import { codeExtensions, codeOptions, countProblems, openReplace } from "./code-extensions";
import { setDiagnosticsEffect } from "@codemirror/lint";
import { texCite } from "./completion-sources";
import { linkClicks } from "./link-clicks";
import { blameExtension } from "./blame";
import type { Blame } from "../gen/Blame";

export { codeTools } from "./code-extensions";
export { headingRepeats } from "./note-extensions";

export type { VimModeLabel } from "./vim-glue";

export interface EditorOptions {
  parent: HTMLElement;
  doc: string;
  path: string;
  vim: boolean;
  /** 1-based line to place the caret on; default = start of body (after frontmatter). */
  line?: number;
  caretEnd?: boolean;
  /** The text changed (read it from `view` when needed: building a big note's text on every key is not free).
   *  `typed`: by the user (an input, a paste, an undo, the properties panel…), not set by the program (a load, a reload
   *  from disk); `keys`: only characters typed or deleted, which may be read a moment later (anything else, a panel's
   *  edit, is read back by what made it at once). */
  /** `edit`: the text before, the changes, the text after (to carry derived data over an edit). */
  onChange?: (typed: boolean, keys: boolean, edit: { before: Text; changes: ChangeSet; after: Text }) => void;
  onVimMode?: (mode: VimModeLabel) => void;
  onSave?: () => void;
  onQuit?: () => void;
  onFocus?: () => void;
  /** Diagnostic counts changed (code files only). */
  onProblems?: (p: Problems) => void;
  /** Main selection moved: 1-based inclusive lines and the selected text (empty for a caret). */
  onSelection?: (s: { from_line: number; to_line: number; text: string }) => void;
  /** Ctrl/Cmd+click on a wikilink, or click on a rendered internal link; `beside`: a middle click (a new tab). */
  onOpenLink?: (target: string, opts?: { beside?: boolean }) => void;
}

export interface AtlasEditor {
  view: EditorView;
  setVim(on: boolean): void;
  /** Make the document this text (a reload from disk), changing only what differs. */
  setDoc(text: string, opts?: { keepUndo?: boolean }): void;
  gotoLine(line: number): void;
  vimMode(): VimModeLabel;
  /** Error / warning counts, or null for a note (no language server). */
  problems(): Problems | null;
  /** Git blame beside the lines (null: away); `open` opens a commit. */
  setBlame(b: Blame | null, open: (hash: string, subject: string) => void): void;
  destroy(): void;
}

export const isMarkdown = (path: string) => /\.(md|markdown)$/i.test(path);

installImagePeek(); // Ctrl over a picture: shown large (lib/image-peek.ts); once, for every editor and view

export function createEditor(o: EditorOptions): AtlasEditor {
  defineEx();
  let keepTimer: ReturnType<typeof setTimeout> | undefined;
  let keep = () => {}; // set once the view exists: remembers the place it is left at
  const vimSlot = new Compartment();
  const lang = new Compartment();
  const codeOpts = new Compartment();
  const lspSlot = new Compartment();
  const blameSlot = new Compartment();
  const md = isMarkdown(o.path);
  const viewRef: { view: EditorView | null } = { view: null };
  // null until a checker (the language server) has reported on the file: "No problems" only once something looked
  let lastProblems: Problems | null = null;
  const mdx = md ? noteExtensions(o.path, viewRef, o.onOpenLink) : null;

  const extensions: Extension[] = [
    // Escape leaves snippet fields AND still reaches vim. A completion still *pending* (sources
    // queried, no popup yet — every keystroke in a note) is dropped too: otherwise closeCompletion
    // eats the key and vim stays in insert. An open popup keeps Escape (closes only the popup).
    // An open completion list takes Enter first: before list continuation (a new "- [ ]" line) and
    // vim, which both bound it ahead of the list — the suggestion showed but Enter never took it.
    Prec.highest(keymap.of([{ key: "Enter", run: (v) => completionStatus(v.state) === "active" && acceptCompletion(v) }])),
    Prec.highest(keymap.of([{ key: "Escape", run: (v) => {
      clearSnippet(v);
      if (completionStatus(v.state) === "pending" || untouchedTaskList(v)) closeCompletion(v);
      return false;
    } }, { key: "Mod-Shift-v", run: (v) => { stashVisual(v); return false; } },
    // VS Code / Obsidian: Ctrl+H is find & replace (vim would take it as "left")
    { key: "Mod-h", preventDefault: true, run: openReplace }])),
    Prec.highest(EditorView.domEventHandlers({ paste: (_e, v) => { restoreVisual(v); return false; } })),
    desktopKeys, // before vim (first wins): see its comment
    md ? [] : lspKeys,
    // Live-preview's arrow keymap must precede vim (both Prec.highest; first wins) — see editor.js.
    mdx ? mdx.head : [],
    vimSlot.of(o.vim ? vim({ status: false }) : []),
    keymap.of([
      { key: "Mod-s", preventDefault: true, run: () => { o.onSave?.(); return true; } },
    ]),
    atlasTheme,
    ansiColors(), // before highlightSpecialChars: a hidden ESC [ … m is not drawn as a special character
    history(),
    drawSelection(),
    dropCursor(),
    // several cursors (Ctrl+D, Ctrl+Shift+L, Alt+click, a rectangle): off unless a state allows it
    EditorState.allowMultipleSelections.of(true),
    rectangularSelection(),
    highlightSpecialChars(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    indentOnInput(),
    search({ top: true }),
    findPanel(),
    // Tab is the editor's (without a binding the key walked out of it): see tabKey
    keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, tabKey(md)]),
    md ? [mdx!.body, codeOpts.of(mdOptions(settings.config))] : codeExtensions(lang, codeOpts, lspSlot, settings.config, o.doc),
    blameSlot.of([]),
    // \cite{ in LaTeX: the Library next to texlab's own completions
    /\.tex$/i.test(o.path) ? [texCite, mathPreview(() => settings.config?.editor.math_preview ?? true, true)] : [],
    EditorView.updateListener.of((u) => {
      if (u.docChanged) {
        const user = u.transactions.filter((t) => t.docChanged && t.annotation(Transaction.userEvent) !== undefined);
        o.onChange?.(user.length > 0, user.length > 0 && user.every((t) => t.isUserEvent("input.type") || t.isUserEvent("delete")),
          { before: u.startState.doc, changes: u.changes, after: u.state.doc });
      }
      if (u.focusChanged && u.view.hasFocus) o.onFocus?.();
      if (u.selectionSet) keep(); // the place it is left at (places.ts)
      if (!md && o.onProblems && u.transactions.some((t) => t.effects.some((e) => e.is(setDiagnosticsEffect)))) {
        const p = countProblems(u.state);
        if (p.errors !== lastProblems?.errors || p.warnings !== lastProblems?.warnings) { lastProblems = p; o.onProblems(p); }
      }
      if (o.onSelection && (u.selectionSet || (u.focusChanged && u.view.hasFocus))) {
        const { from, to } = u.state.selection.main, d = u.state.doc;
        o.onSelection({ from_line: d.lineAt(from).number, to_line: d.lineAt(to).number, text: d.sliceString(from, Math.min(to, from + SELECTION_TEXT_MAX)) });
      }
    }),
    editorMenu({ path: o.path, markdown: md, onOpenLink: o.onOpenLink }),
    pluginHooks(o.path, md),
    // in code files the plugins' completions join the language's own (notes list theirs above)
    md ? [] : EditorState.languageData.of(() => [{ autocomplete: pluginCompletions(o.path, false) }]),
    linkClicks(o.onOpenLink),
  ];

  const docText = EditorState.create({ doc: o.doc }).doc;
  let anchor = md ? bodyStart(docText) : 0;
  const left = o.line === undefined && !o.caretEnd ? placeOf(o.path) : null; // where it was left last time
  if (o.line !== undefined) anchor = docText.line(Math.max(1, Math.min(o.line, docText.lines))).from;
  else if (o.caretEnd) anchor = Math.max(0, docText.length - (o.vim ? 1 : 0));
  else if (left) anchor = Math.min(left.head, docText.length);

  const view = new EditorView({
    state: EditorState.create({ doc: o.doc, extensions, selection: { anchor } }),
    parent: o.parent,
  });
  viewRef.view = view;
  let destroyed = false;
  // the place is read while the view is on screen (a closing tab is detached before it is destroyed), written later
  let last: Place | null = null;
  // the caret now (a tab closed at once keeps it); the top line in the view's measure phase, as reading the scroll
  // position inside an update forces a layout on every key
  const readKey = {};
  const read = () => {
    if (!view.dom.isConnected) return;
    last = { head: view.state.selection.main.head, top: last?.top ?? view.viewport.from };
    view.requestMeasure({ key: readKey, read: (v) => { if (v.dom.isConnected && last) last = { ...last, top: topIn(v) }; } });
  };
  keep = () => { read(); clearTimeout(keepTimer); keepTimer = setTimeout(() => { if (!destroyed && last) keepPlace(o.path, last); }, 500); };
  if (left) {
    // after the first layout, and again once rendered blocks have their heights
    const top = Math.min(left.top, view.state.doc.length);
    const scroll = () => { if (!destroyed) view.dispatch({ effects: EditorView.scrollIntoView(top, { y: "start" }) }); };
    requestAnimationFrame(scroll);
    setTimeout(scroll, 400);
  }
  view.scrollDOM.addEventListener("scroll", keep, { passive: true });
  // Code languages load lazily (language-data splits one chunk per language).
  const desc = md ? null : LanguageDescription.matchFilename(languages, basename(o.path));
  desc?.load().then((support) => { if (!destroyed) view.dispatch({ effects: lang.reconfigure(support) }); },
    (err) => console.warn("[atlas] language load failed", o.path, err));
  if (!md) void lspFor(o.path).then((x) => { if (x && !destroyed) view.dispatch({ effects: lspSlot.reconfigure(x) }); },
    (err) => console.warn("[atlas] language server", o.path, err));
  exHooks.set(view, { save: o.onSave, quit: o.onQuit });
  // a setting can change what the live preview draws (the properties' mode, the inline title): redraw
  const offSettings = onSettings((cfg) => view.dispatch({ effects: [codeOpts.reconfigure(md ? mdOptions(cfg) : codeOptions(cfg)), ...(md ? [redecorate.of(null)] : [])] }));
  const offSpec = md ? onPropertySpec(() => view.dispatch({ effects: redecorate.of(null) })) : () => {};
  const offLang = md ? onHighlightLanguage(() => view.dispatch({ effects: redecorate.of(null) })) : () => {}; // a fence's language arrived

  let vimOn = o.vim;
  let mode: VimModeLabel = o.vim ? "NORMAL" : "";
  let modeHandler: ((e: { mode?: string; subMode?: string }) => void) | null = null;
  const wireVim = () => {
    const cm = getCM(view);
    if (!cm || modeHandler) return;
    modeHandler = (e) => { mode = modeLabel(e); o.onVimMode?.(mode); };
    cm.on("vim-mode-change", modeHandler);
  };
  const unwireVim = () => {
    const cm = getCM(view);
    if (cm && modeHandler) cm.off("vim-mode-change", modeHandler);
    modeHandler = null;
  };
  if (vimOn) wireVim();
  o.onVimMode?.(mode);

  return {
    view,
    setVim(on) {
      if (on === vimOn) return;
      if (!on) unwireVim();
      view.dispatch({ effects: vimSlot.reconfigure(on ? vim({ status: false }) : []) });
      vimOn = on;
      if (on) wireVim();
      mode = on ? "NORMAL" : "";
      o.onVimMode?.(mode);
    },
    setDoc(text, opts) {
      text = text.replace(/\r\n?/g, "\n"); // as the editor holds it: a CRLF file reloaded unchanged is no change
      const change = diff(view.state.doc.toString(), text);
      if (!change) return;
      // only what differs: the caret, the folds, the scroll position and the problems' marks stay where they were.
      // What another program wrote is not a step of this editor's undo (`keepUndo`: what the person chose to bring in).
      view.dispatch({ changes: change, annotations: opts?.keepUndo ? [] : [Transaction.addToHistory.of(false)] });
    },
    gotoLine(line) {
      const doc = view.state.doc;
      const l = doc.line(Math.max(1, Math.min(line, doc.lines)));
      view.dispatch({ selection: { anchor: l.from }, effects: EditorView.scrollIntoView(l.from, { y: "center" }) });
      view.focus();
    },
    vimMode: () => mode,
    setBlame: (b, open) => view.dispatch({ effects: blameSlot.reconfigure(b ? blameExtension(b, open) : []) }),
    problems: () => (md || !lastProblems ? null : countProblems(view.state)),
    destroy() {
      read();
      if (last) keepPlace(o.path, last);
      clearTimeout(keepTimer);
      destroyed = true;
      offSettings();
      offSpec();
      offLang();
      unwireVim();
      exHooks.delete(view);
      view.destroy();
    },
  };
}
