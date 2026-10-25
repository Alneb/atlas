// The editor's own right-click menu: the clipboard, then what the place offers (a link under the
// pointer, the note keys, the language server). Shift+right-click keeps the browser's menu
// (spelling suggestions live there). One list builder, so a new entry is one line.
import { chooseVault } from "../vaults";
import { mount, unmount } from "svelte";
import { selectAll } from "@codemirror/commands";
import { EditorView } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import { LSPPlugin, findReferences, formatDocument, jumpToDefinition, jumpToImplementation, jumpToTypeDefinition, renameSymbol, showSignatureHelp } from "@codemirror/lsp-client";
import ContextMenu, { type MenuItem } from "../../components/ContextMenu.svelte";
import { keysOf } from "../keymap.svelte";
import { toast } from "../state.svelte";
import { formatNote } from "./md-format";
import { pluginMenu } from "../plugin-menus";

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

function items(view: EditorView, target: HTMLElement, o: EditorMenuOptions): MenuItem[] {
  const some = !view.state.selection.main.empty, link = linkAt(target);
  const list: MenuItem[] = [];
  if (link && o.onOpenLink) list.push({ label: "Open link", icon: "link", run: () => o.onOpenLink!(link) }, "sep");
  list.push(
    { label: "Cut", hint: "Ctrl+X", disabled: !some, run: () => { void copy(selected(view)); view.dispatch(view.state.replaceSelection(""), { userEvent: "delete.cut" }); } },
    { label: "Copy", icon: "copy", hint: "Ctrl+C", disabled: !some, run: () => void copy(selected(view)) },
    { label: "Paste", hint: "Ctrl+V", run: () => void paste(view) },
    { label: "Select all", hint: "Ctrl+A", run: () => { selectAll(view); } },
  );
  if (o.markdown) list.push("sep",
    { label: "Bold", hint: keysOf("note.bold"), run: () => formatNote(view, "bold") },
    { label: "Italic", hint: keysOf("note.italic"), run: () => formatNote(view, "italic") },
    { label: "Link", icon: "link", hint: keysOf("note.link"), run: () => formatNote(view, "link") },
    { label: "To-do", icon: "check", hint: keysOf("note.task"), run: () => formatNote(view, "task") },
    { label: "Task…", icon: "calendar", run: () => formatNote(view, "taskDialog") },
    { label: "Insert template…", icon: "file-text", run: () => formatNote(view, "insertTemplate") },
  );
  else if (LSPPlugin.get(view)) list.push("sep",
    { label: "Go to definition", hint: "F12", run: () => { jumpToDefinition(view); } },
    { label: "Go to type definition", run: () => { jumpToTypeDefinition(view); } },
    { label: "Go to implementation", hint: "Ctrl+F12", run: () => { jumpToImplementation(view); } },
    { label: "Show parameters", hint: "Ctrl+Shift+Space", run: () => { showSignatureHelp(view); } },
    { label: "Find references", hint: "Shift+F12", run: () => { findReferences(view); } },
    { label: "Rename symbol…", icon: "edit", hint: "F2", run: () => { renameSymbol(view); } },
    { label: "Format document", hint: "Shift+Alt+F", run: () => { formatDocument(view); } },
  );
  if (o.markdown) list.push("sep", { label: "Edit live on the vault's mirror…", icon: "link", run: () => void chooseVault({ linkMirror: true }) });
  list.push(...pluginMenu("editor", { path: o.path, selection: selected(view) }));
  return list;
}

/** What last pressed the page: a long press by a finger or a pen is the phone's own (it selects a word, with the
 *  system's toolbar), not this menu: on the Boox a long press opened
 *  this menu instead of selecting (Android's WebView sends a contextmenu event on every long press). */
let lastPointer = "mouse";
if (typeof addEventListener === "function") addEventListener("pointerdown", (e: PointerEvent) => { lastPointer = e.pointerType; }, { capture: true, passive: true });

export function editorMenu(o: EditorMenuOptions): Extension {
  return EditorView.domEventHandlers({
    contextmenu: (e, view) => {
      if (e.shiftKey || e.defaultPrevented) return false; // the browser's menu, or a widget's own
      if (lastPointer === "touch" || lastPointer === "pen") return false; // a long press selects (the phone's own)
      const target = e.target as HTMLElement;
      // a rendered block (a table, a terminal, a picture) keeps its own menu or the browser's
      if (target.closest('[contenteditable="false"]') && !linkAt(target)) return false;
      e.preventDefault();
      // a right-click outside the selection moves the caret there, as everywhere
      const pos = view.posAtCoords({ x: e.clientX, y: e.clientY }), sel = view.state.selection.main;
      if (pos !== null && (pos < sel.from || pos > sel.to)) view.dispatch({ selection: { anchor: pos } });
      const m = mount(ContextMenu, { target: document.body, props: {
        x: e.clientX, y: e.clientY, items: items(view, target, o),
        onclose: () => { void unmount(m); view.focus(); },
      } });
      return true;
    },
  });
}
