// Go to definition from the pointer, as in VS Code: Ctrl+click on a name asks the file's language server (lsp.ts) and
// opens the answer; holding Ctrl over a code file with a server shows the hand. The right-click menu and F12 do the
// same (`goToDefinition`). A definition inside the vault opens in its tab; one outside it (a library, the language's
// own stubs: Python's `range`) is shown read-only under the name — the core reads those lines (`/api/lsp/peek`), a
// peek like VS Code's. A file no server covers gets no guess: the menu says which setting brings one.
import { EditorState, Text, type Extension } from "@codemirror/state";
import { Decoration, EditorView, lineNumbers } from "@codemirror/view";
import { LanguageDescription } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { LSPPlugin, jumpToDefinition } from "@codemirror/lsp-client";
import { api } from "../api";
import { toast } from "../state.svelte";
import { errText } from "../text";
import { lspRoot } from "./lsp";
import { atlasTheme } from "./theme";

type Loc = { uri?: string; targetUri?: string; range?: { start: { line: number } }; targetSelectionRange?: { start: { line: number } } };

/** F12, Ctrl+click, the menu: the server's answer, opened in its tab or peeked when outside the vault. */
export function goToDefinition(view: EditorView): boolean {
  const p = LSPPlugin.get(view);
  if (!p) return false;
  p.client.sync();
  const position = p.toPosition(view.state.selection.main.head);
  p.client.request<unknown, Loc | Loc[] | null>("textDocument/definition", { textDocument: { uri: p.uri }, position }).then((res) => {
    const loc = Array.isArray(res) ? res[0] : res;
    const uri = loc?.uri ?? loc?.targetUri;
    if (!loc || !uri) return toast("Go to definition", "The language server knows no definition for this name.");
    const root = lspRoot(view);
    if (uri === p.uri || (root && uri.startsWith(root + "/"))) return void jumpToDefinition(view); // the client's own jump
    void showPeek(view, uri, (loc.targetSelectionRange ?? loc.range)?.start.line ?? 0);
  }, (e) => toast("Go to definition", errText(e), "error"));
  return true;
}

let openPeek: (() => void) | null = null;

/** The lines around a definition outside the vault, read-only and highlighted, under the caret; Esc or a click away closes. */
async function showPeek(view: EditorView, uri: string, line: number): Promise<void> {
  let peek;
  try { peek = await api.lspPeek(uri, line); } catch (e) { return toast("Go to definition", errText(e), "error"); }
  openPeek?.();
  const box = document.createElement("div");
  box.className = "def-peek";
  const head = document.createElement("div");
  head.className = "def-peek-head";
  head.textContent = peek.path;
  head.title = `${peek.path}:${peek.line} — outside the vault, shown read-only`;
  box.append(head);
  const at = view.coordsAtPos(view.state.selection.main.head);
  box.style.left = `${Math.max(8, Math.min((at?.left ?? 40) - 20, innerWidth - 640))}px`;
  box.style.top = `${Math.min((at?.bottom ?? 40) + 6, innerHeight - 300)}px`;
  document.body.append(box);
  const desc = LanguageDescription.matchFilename(languages, peek.path.slice(peek.path.lastIndexOf("/") + 1));
  const lang = await desc?.load().catch(() => null);
  const doc = Text.of(peek.lines.length ? peek.lines : [""]);
  const mark = doc.line(Math.max(1, Math.min(doc.lines, peek.line - peek.start + 1)));
  const ed = new EditorView({
    parent: box,
    state: EditorState.create({
      doc,
      extensions: [EditorState.readOnly.of(true), EditorView.editable.of(false), atlasTheme, lang ?? [],
        lineNumbers({ formatNumber: (n) => String(n + peek.start - 1) }),
        EditorView.decorations.of(Decoration.set([Decoration.line({ class: "def-peek-line" }).range(mark.from)]))],
    }),
  });
  ed.dispatch({ selection: { anchor: mark.from }, effects: EditorView.scrollIntoView(mark.from, { y: "start", yMargin: 24 }) });
  const close = () => { ed.destroy(); box.remove(); removeEventListener("mousedown", away, true); removeEventListener("keydown", esc, true); openPeek = null; view.focus(); };
  const away = (e: MouseEvent) => { if (!box.contains(e.target as Node)) close(); };
  const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); } };
  addEventListener("mousedown", away, true);
  addEventListener("keydown", esc, true);
  openPeek = close;
}

const IDENT = /^[\p{L}_][\p{L}\p{N}_]*$/u;

/** The position of a name under the pointer, or null (whitespace, punctuation, past the line's end). */
function nameAt(view: EditorView, e: MouseEvent): number | null {
  const pos = view.posAtCoords({ x: e.clientX, y: e.clientY }, false);
  const w = view.state.wordAt(pos);
  return w && IDENT.test(view.state.sliceDoc(w.from, w.to)) ? pos : null;
}

const linkKey = (e: MouseEvent | KeyboardEvent) => (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey;

export const definitionClicks: Extension = [
  EditorView.domEventHandlers({
    mousedown: (e, view) => {
      if (e.button !== 0 || !linkKey(e) || !LSPPlugin.get(view)) return false; // without a server: Ctrl+click adds a cursor
      const pos = nameAt(view, e);
      if (pos === null) return false;
      e.preventDefault();
      view.dispatch({ selection: { anchor: pos } });
      goToDefinition(view);
      return true;
    },
    mousemove: (e, view) => { view.contentDOM.classList.toggle("cm-goto-def", linkKey(e) && !!LSPPlugin.get(view) && nameAt(view, e) !== null); },
    mouseleave: (_e, view) => { view.contentDOM.classList.remove("cm-goto-def"); },
    keyup: (_e, view) => { view.contentDOM.classList.remove("cm-goto-def"); },
  }),
  EditorView.baseTheme({ ".cm-content.cm-goto-def": { cursor: "pointer" } }),
];
