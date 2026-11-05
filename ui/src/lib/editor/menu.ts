// The editor's own right-click menu: the clipboard, then what the place offers (a link under the
// pointer, the note keys, the language server). Shift+right-click keeps the browser's menu
// (spelling suggestions live there). One list builder, so a new entry is one line.
import { chooseVault } from "../vaults";
import { selectAll } from "@codemirror/commands";
import { EditorView } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import { LSPPlugin, findReferences, formatDocument, jumpToImplementation, jumpToTypeDefinition, renameSymbol, showSignatureHelp } from "@codemirror/lsp-client";
import type { MenuItem } from "../../components/ContextMenu.svelte";
import { atPointer, popMenu, pressedByHand } from "../menu";
import { keysOf } from "../keymap.svelte";
import { toast } from "../state.svelte";
import { formatNote } from "./md-format";
import { pluginRows } from "../plugin-menus";
import { editRawProperties, frontmatterClose } from "./live/live-preview.js";
import { goToDefinition } from "./definition";

export interface EditorMenuOptions { path: string; markdown: boolean; onOpenLink?: (target: string) => void }

/** The wikilink target under the pointer, in source or rendered form. */
function linkAt(el: HTMLElement): string | null {
  const rendered = el.closest<HTMLElement>("a.internal-link");
  if (rendered) return rendered.dataset.href ?? null;
  const src = el.closest<HTMLElement>(".cm-hmd-internal-link");
  return src ? (src.dataset.target ?? src.textContent ?? "").replace(/^\[\[|\]\]$/g, "").split("|")[0] : null;
}

const selected = (view: EditorView): string => view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to);
const copy = (text: string) => navigator.clipboard.writeText(text).catch(() => toast("Clipboard", "Could not copy — the browser refused."));

async function paste(view: EditorView): Promise<void> {
  try { view.dispatch(view.state.replaceSelection(await navigator.clipboard.readText()), { userEvent: "input.paste", scrollIntoView: true }); }
  catch { toast("Clipboard", "This window may not read the clipboard — paste with Ctrl+V."); }
}

/** A code file's own rows, first in its menu: what its language server knows about the name under the pointer. */
function codeItems(view: EditorView): MenuItem[] {
  if (!LSPPlugin.get(view)) return [{ label: "Go to definition", icon: "arrow-right", detail: "no language server for this kind of file (Settings → Code)", disabled: true, run: () => {} }];
  return [
    { label: "Go to definition", icon: "arrow-right", hint: "Ctrl+click · F12", run: () => { goToDefinition(view); } },
    { label: "Go to type definition", icon: "file-code", run: () => { jumpToTypeDefinition(view); } },
    { label: "Go to implementation", icon: "code", hint: "Ctrl+F12", run: () => { jumpToImplementation(view); } },
    { label: "Find references", icon: "search", hint: "Shift+F12", run: () => { findReferences(view); } },
    { label: "Show parameters", icon: "list", hint: "Ctrl+Shift+Space", run: () => { showSignatureHelp(view); } },
    { label: "Rename symbol…", icon: "edit", hint: "F2", run: () => { renameSymbol(view); } },
    { label: "Format document", icon: "text", hint: "Shift+Alt+F", run: () => { formatDocument(view); } },
  ];
}

function items(view: EditorView, target: HTMLElement, o: EditorMenuOptions): MenuItem[] {
  const some = !view.state.selection.main.empty, link = linkAt(target);
  const list: MenuItem[] = [];
  if (link && o.onOpenLink) list.push({ label: "Open link", icon: "link", run: () => o.onOpenLink!(link) }, "sep");
  if (!o.markdown) list.push(...codeItems(view), "sep");
  list.push(
    { label: "Cut", icon: "scissors", hint: "Ctrl+X", disabled: !some, run: () => { void copy(selected(view)); view.dispatch(view.state.replaceSelection(""), { userEvent: "delete.cut" }); } },
    { label: "Copy", icon: "copy", hint: "Ctrl+C", disabled: !some, run: () => void copy(selected(view)) },
    { label: "Paste", icon: "clipboard", hint: "Ctrl+V", run: () => void paste(view) },
    { label: "Select all", icon: "select-all", hint: "Ctrl+A", run: () => { selectAll(view); } },
  );
  if (o.markdown) list.push("sep",
    { label: "Bold", icon: "bold", hint: keysOf("note.bold"), run: () => formatNote(view, "bold") },
    { label: "Italic", icon: "italic", hint: keysOf("note.italic"), run: () => formatNote(view, "italic") },
    { label: "Link", icon: "link", hint: keysOf("note.link"), run: () => formatNote(view, "link") },
    { label: "To-do", icon: "check", hint: keysOf("note.task"), run: () => formatNote(view, "task") },
    { label: "Task…", icon: "calendar", run: () => formatNote(view, "taskDialog") },
    { label: "Insert template…", icon: "file-text", run: () => formatNote(view, "insertTemplate") },
    ...(frontmatterClose(view.state.doc) ? [{ label: "Edit properties as text", icon: "code" as const, hint: "Alt+click", run: () => { editRawProperties(view); } }] : []),
  );
  if (o.markdown) list.push("sep", { label: "Edit live on the vault's mirror…", icon: "link", run: () => void chooseVault({ linkMirror: true }) });
  const plugins = pluginRows("editor", { path: o.path, selection: selected(view) });
  return [...plugins.top, ...list, ...plugins.end];
}

export function editorMenu(o: EditorMenuOptions): Extension {
  return EditorView.domEventHandlers({
    contextmenu: (e, view) => {
      if (e.shiftKey || e.defaultPrevented) return false; // the browser's menu, or a widget's own
      if (pressedByHand()) return false; // a long press selects (the phone's own)
      const target = e.target as HTMLElement;
      // a rendered block (a table, a terminal, a picture) keeps its own menu or the browser's
      if (target.closest('[contenteditable="false"]') && !linkAt(target)) return false;
      e.preventDefault();
      // a right-click outside the selection moves the caret there, as everywhere
      const pos = view.posAtCoords({ x: e.clientX, y: e.clientY }), sel = view.state.selection.main;
      if (pos !== null && (pos < sel.from || pos > sel.to)) view.dispatch({ selection: { anchor: pos } });
      popMenu(atPointer(e, items(view, target, o)), () => view.focus());
      return true;
    },
  });
}
