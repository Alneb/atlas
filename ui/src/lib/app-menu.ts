// The app's right-click menu wherever no part of it has its own: the WebView's (Back, Reload, Inspect…) is not an
// app's, and its Back left the app. What the place offers: a text field's clipboard, a row naming a file (`data-path`:
// open, beside, reveal, copy its link), a link (open, copy), the selected text (copy, search the vault), else the ways
// to go anywhere (commands, search). A part with its own
// menu (the editor, tabs, files, a terminal…) prevents the default and this one stays away. Shift+right-click keeps
// the WebView's (spelling suggestions, Inspect); a long press by a finger or a pen stays the phone's own.
import type { MenuItem } from "../components/ContextMenu.svelte";
import { atPointer, popMenu, pressedByHand } from "./menu";
import { open, openPath } from "./dock";
import { revealItems } from "./reveal-items";
import { pluginMenu } from "./plugin-menus";
import { actions, openWith } from "./actions";
import { keysOf } from "./keymap.svelte";
import { toast } from "./state.svelte";
import { resolveLink } from "./vault";
import { dirOf } from "./paths";

const copy = (text: string) => navigator.clipboard.writeText(text).catch(() => toast("Clipboard", "Could not copy — the window refused."));

type Field = HTMLInputElement | HTMLTextAreaElement | HTMLElement;
/** The editable field under the pointer: an <input> that takes text, a <textarea>, or a contenteditable outside
 *  CodeMirror (which has its own menu). */
function fieldAt(el: Element): Field | null {
  const f = el.closest<HTMLElement>("input, textarea, [contenteditable]:not([contenteditable=false])");
  if (!f || f.closest(".cm-editor")) return null;
  if (f instanceof HTMLInputElement && !/^(text|search|url|email|tel|password|number|)$/.test(f.type)) return null;
  return f;
}

function fieldItems(f: Field): MenuItem[] {
  const ro = (f as HTMLInputElement).readOnly || (f as HTMLInputElement).disabled;
  const some = !!getSelection()?.toString() || ((f as HTMLInputElement).selectionStart ?? 0) !== ((f as HTMLInputElement).selectionEnd ?? 0);
  const run = (cmd: string) => () => { f.focus(); document.execCommand(cmd); };
  return [
    { label: "Cut", icon: "scissors", hint: "Ctrl+X", disabled: ro || !some, run: run("cut") },
    { label: "Copy", icon: "copy", hint: "Ctrl+C", disabled: !some, run: run("copy") },
    { label: "Paste", icon: "clipboard", hint: "Ctrl+V", disabled: ro, run: () => {
      f.focus();
      navigator.clipboard.readText().then((t) => { document.execCommand("insertText", false, t); },
        () => toast("Clipboard", "This window may not read the clipboard — paste with Ctrl+V."));
    } },
    { label: "Select all", icon: "select-all", hint: "Ctrl+A", run: () => { f.focus(); if ("select" in f && typeof f.select === "function") f.select(); else document.execCommand("selectAll"); } },
  ];
}

const short = (t: string) => (t.length > 28 ? t.slice(0, 27) + "…" : t);

function selectionItems(text: string): MenuItem[] {
  const one = text.replace(/\s+/g, " ").trim();
  return [
    { label: "Copy", icon: "copy", hint: "Ctrl+C", run: () => void copy(text) },
    { label: `Search the vault for “${short(one)}”`, icon: "search", run: () => { open({ kind: "search", q: one }); } },
  ];
}

function linkItems(a: HTMLAnchorElement): MenuItem[] {
  const url = a.href;
  return [
    { label: "Open link", icon: "link", detail: short(url.replace(/^https?:\/\//, "")), run: () => void import("./web-links").then((m) => m.openWeb(url)) },
    // a DOI link the library has not got yet (doi-links.ts): Catalog's own dialog files it
    ...(a.classList.contains("not-in-library") ? [{ label: "Add to library…", icon: "library" as const, run: () => void import("./doi-links").then((m) => m.addToLibrary(url)) }] : []),
    { label: "Copy link address", icon: "copy", run: () => void copy(url) },
  ];
}

/** A vault link drawn in rendered text (`a.internal-link`: a wikilink, a filed DOI link): its note's path, if it resolves. */
function vaultLinkPath(a: HTMLAnchorElement): string | null {
  const from = a.closest<HTMLElement>("[data-note]")?.dataset.note ?? "";
  return resolveLink(a.dataset.href ?? "", dirOf(from));
}

/** A row that names a file (`data-path`, and `data-line` for a place in it: a search hit, a task, a change) in a part
 *  with no menu of its own: the things done with any file, the same everywhere. */
export function fileItems(path: string, line?: number): MenuItem[] {
  const name = path.slice(path.lastIndexOf("/") + 1).replace(/\.md$/i, "");
  return [
    { label: "Open", icon: "file-text", run: () => openPath(path, line) },
    { label: "Open beside", icon: "panel-right", run: () => openPath(path, line, { beside: true }) },
    "sep",
    ...revealItems(path),
    { label: "Open with…", icon: "plugin", run: () => openWith(path) },
    "sep",
    { label: "Copy link", icon: "link", detail: `[[${name}]]`, run: () => void copy(`[[${name}]]`) },
    { label: "Copy path", icon: "copy", run: () => void copy(path) },
    ...pluginMenu("file", { path, dir: false }),
  ];
}

/** Nothing under the pointer to act on: the app's own commands for going anywhere, as their actions define them. */
const ANYWHERE = ["ui.palette", "ui.quickOpen", "ui.search", "ui.commands"];
const anywhere = (): MenuItem[] => ANYWHERE.flatMap((id) => {
  const a = actions.find((x) => x.id === id);
  return a ? [{ label: a.label ?? a.title, icon: typeof a.icon === "function" ? a.icon() : a.icon, hint: keysOf(id), run: () => void a.run() }] : [];
});

/** The items for a right-click on `el`: the most specific place first, never empty. */
export function appMenuItems(el: Element, selection: string): MenuItem[] {
  const field = fieldAt(el);
  if (field) return fieldItems(field);
  const file = el.closest<HTMLElement>("[data-path]");
  if (file?.dataset.path && !selection.trim()) return fileItems(file.dataset.path, Number(file.dataset.line) || undefined);
  const link = el.closest<HTMLAnchorElement>("a[href]");
  // a vault link in rendered text is its note, with the menu any row naming that note has (not its "#" address)
  const linked = link?.classList.contains("internal-link") && !selection.trim() ? vaultLinkPath(link) : null;
  if (linked) return fileItems(linked);
  const out: MenuItem[] = [];
  if (link && !link.classList.contains("internal-link") && /^(https?|mailto):/i.test(link.href)) out.push(...linkItems(link));
  if (selection.trim()) out.push(...(out.length ? ["sep" as const] : []), ...selectionItems(selection));
  return out.length ? out : anywhere();
}

/** Installs the menu for the whole window; returns its removal. */
export function attachAppMenu(): () => void {
  const onMenu = (e: MouseEvent) => {
    if (e.defaultPrevented || e.shiftKey || pressedByHand()) return; // a part's own menu, the WebView's, the phone's
    if (!(e.target instanceof Element)) return;
    e.preventDefault();
    popMenu(atPointer(e, appMenuItems(e.target, getSelection()?.toString() ?? "")));
  };
  addEventListener("contextmenu", onMenu); // bubbling: every part's own handler has had its turn
  return () => removeEventListener("contextmenu", onMenu);
}
