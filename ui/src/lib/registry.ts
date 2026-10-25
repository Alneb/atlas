// Live handles that panes expose to the shell (keyed by dockview panel id).
import type { Head, SectionMove } from "./section-move";
export interface EditorHandle {
  path: string;
  gotoLine(line: number): void;
  focus(): void;
  /** Put a block of text on lines of its own after the caret's paragraph ("Embed in note…"). */
  insertBlock(text: string): void;
  /** Save now if dirty (a search's replace, which works on the files on disk). */
  flush(): Promise<void>;
  /** The tab goes away (closed, the window closing or reloading, another workspace): a note is saved; a code
   *  file that saves only by Ctrl+S keeps its unsaved text in its recovery copy instead. */
  park(): Promise<void>;
  headings(): Head[];
  /** Move a section (the Outline's drag) as one undoable edit. */
  moveSection(move: SectionMove): void;
  vimMode(): string;
  /** The text and the selections as they are now (automation: tests, the UX audit). */
  snapshot(): { text: string; ranges: { from: number; to: number }[] };
  /** The diagnostics list (CodeMirror's lint panel: click → line); false when the file has none. */
  showProblems(): boolean;
}

export const editors = new Map<string, EditorHandle>();

/** Bold / italic / link on the note that has the keys. Set by lib/editor/md-format.ts when the
 *  editor's code loads, so the commands (lib/actions.ts) run it at once, without importing CodeMirror. */
export type MdFormat = "bold" | "italic" | "link" | "task" | "cycle" | "heading" | "bullet" | "number" | "quote" | "code" | "table" | "taskDialog";
export const noteFormat: { run: ((kind: MdFormat) => void) | null } = { run: null };

/** Live terminals (keyed by panel id): enough for "send the selection" to type into one. */
export interface TerminalHandle {
  preset: string;
  /** a plugin's AI agent (`<plugin>/<id>`) when the tab runs one */
  agent?: string;
  /** when the user was last in it (ms): "send the selection" goes to the agent tab used last */
  usedAt: number;
  ready(): boolean;
  /** Typed as a paste (bracketed when the program asked for it), not executed. */
  paste(text: string): void;
  /** Typed and entered: the command runs (as if the user had typed it and pressed Enter). */
  run(command: string): void;
  focus(): void;
  /** The last `n` lines up to the cursor, as text (hover previews). */
  lines(n: number): string[];
}
export const terminals = new Map<string, TerminalHandle>();

/** The editor the user was last in (set by the editor itself: it registers only after its file
 *  loads, i.e. after dockview's "active panel" event already fired). */
let lastEditor: string | null = null;
export const noteEditorActive = (id: string): void => { lastEditor = id; };
export const lastEditorId = (): string | null => (lastEditor && editors.has(lastEditor) ? lastEditor : null);

/** Every capture box on screen registers here so Super+C can reach one from anywhere. A set, not one slot:
 *  a second box (the Today view beside the Home page, a page re-drawn) that went away used to clear the
 *  slot while the first was still there, and Super+C then did nothing. */
const captureBoxes = new Set<HTMLElement>();
export const capture = {
  add(box: HTMLElement): () => void { captureBoxes.add(box); return () => captureBoxes.delete(box); },
  /** Focuses the most recent box that is on screen (not in a hidden tab or an inert preview); false: none. */
  focus(): boolean {
    const shown = [...captureBoxes].filter((b) => b.isConnected && b.getClientRects().length > 0 && !b.closest("[inert]"));
    const box = shown.at(-1);
    box?.focus();
    return !!box;
  },
};

/** Ctrl+Shift+H asked for the replace row: the Search pane takes it on mount, or on the
 *  "atlas-search-replace" event when it is already open. */
/** `q`: a text to search for at once (the code bar hands over the editor's selection). */
export const searchRequest: { replace: boolean; q?: string } = { replace: false };

/** A pane's own focus target (its search box…), by panel id: `open()` calls it right as it
 *  activates the pane, so keys typed after a shortcut land there and not in the old focus. */
export const paneFocus = new Map<string, () => void>();
/** An open explorer tab asked for again: it goes to `path` and selects `select` (Show in the explorer, a breadcrumb). */
export const explorerGo = new Map<string, (path: string, select?: string) => void>();
/** Open PDF panes by panel id: jump to a page (a search hit in a PDF that is already open). */
/** An open PDF's "show this place": its page, and a link's words or annotation / mark id (lib/pdf-place.ts). */
export const pdfPages = new Map<string, (page: number, at?: { quote?: string; annotation?: string }) => void>();
/** An open drawing's "show this page" (an embed's `#Page 2`), by panel id — as pdfPages. */
export const drawingPages = new Map<string, (page: string) => void>();
/** An open plugin pane's "go to this anchor" (a later `[[x.epub#Chapter 3]]` to its file), by panel id. */
export const pluginAnchors = new Map<string, (anchor: string) => void>();
/** Panes other than the editor that save when they go away (a plugin editor's save hook, Plugin.svelte), by panel id. */
export const paneParks = new Map<string, () => Promise<void>>();
/** The pane `id`'s "you are going away": an editor parks, a plugin pane saves what is unsaved; none: nothing to do. */
export const parkOf = (id: string): (() => Promise<void>) | undefined => {
  const ed = editors.get(id);
  return ed ? () => ed.park() : paneParks.get(id);
};
/** Every open pane's park (the window closing or reloading, another workspace). */
export const parkAll = (): Promise<void>[] => [...editors.values()].map((e) => e.park()).concat([...paneParks.values()].map((f) => f()));
/** Per open drawing pane: writes `<drawing>.svg` beside it on demand → that path ("Drawing: export as SVG"). */
export const drawingExports = new Map<string, () => Promise<string>>();

/** The file the user just asked to open (palette, tree, link): its editor takes the focus when it
 *  loads, even if something else holds it meanwhile. Other late loads leave the focus alone. */
export const openIntent = { path: "", t: 0 };
