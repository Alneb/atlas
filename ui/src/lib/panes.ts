// Pane kinds (ARCHITECTURE.md "UI"). A pane is described by a PaneSpec; its id, title and icon
// derive from the spec by exhaustive switches, so adding a kind fails `npm run check` until handled.
import { sideToolOf } from "./side-tools.svelte";
import type { PtyPreset, RelPath } from "./types";
import { isIconName } from "./icons";
import { basename, IMAGE_RE, shownName } from "./paths";

export type PaneSpec =
  | { kind: "today" }
  | { kind: "editor"; path: RelPath; line?: number }
  | { kind: "terminal"; preset: PtyPreset; n: number; /** the user's name for it (double-click the tab) */ title?: string; /** run directly (no interactive shell); the tab closes when it ends */ command?: string; /** a Claude tab's own session id: resumed when the layout is restored */ session?: string; /** an AI agent a plugin declares (`<plugin>/<id>`, agent_terminals.rs); its tab is an agent tab like Claude's */ agent?: string }
  | { kind: "files" }
  // the file explorer (Dolphin-like): a folder of a file source — the vault, an SSH host, a copyparty server (lib/file-sources.svelte.ts)
  | { kind: "explorer"; source: string; place: string; path?: string; /** the entry to select there (a file shown in it) */ select?: string }
  | { kind: "search"; q?: string }
  | { kind: "pdf"; path: RelPath; /** open at this page (a search hit inside the PDF) */ page?: number; /** and select these words on it (lib/pdf-place.ts) */ quote?: string; /** or flash this annotation */ annotation?: string }
  | { kind: "image"; path: RelPath }
  | { kind: "web"; url: string }
  | { kind: "settings" }
  | { kind: "git" }
  | { kind: "commit"; hash: string; subject?: string }
  | { kind: "diff"; path: RelPath; staged: boolean }
  | { kind: "table"; path: RelPath }
  | { kind: "base"; path: RelPath }
  // a .page layout file (rows/columns of blocks) — the home screen is one; title from the file
  | { kind: "page"; path: RelPath; title?: string }
  | { kind: "excalidraw"; path: RelPath; page?: string } // `page`: shown at open (an embed's `#Page 2`, draw-pages.ts frameRef)
  | { kind: "library" }
  // the vault's libraries (lib/libraries.svelte.ts), opened at one of them
  | { kind: "libraries"; at?: string }
  | { kind: "outline" }
  | { kind: "commands" }
  | { kind: "graph" }
  // a workspace plugin's view (.atlas/plugins/<id>/); title and icon travel with the spec so a
  // restored layout can label the tab before the plugin list has loaded
  | { kind: "plugin"; id: string; title?: string; icon?: string; /** the file it was opened with (Open with…) */ path?: RelPath; /** what the pane shows (a host, an account): `atlas.openView(arg)`; one tab per value */ arg?: string; /** the link's `#…` it was opened at (`atlas.anchor`); not part of its id */ anchor?: string }
  // any block (lib/blocks.ts) alone in a tab: its YAML and the document whose context it reads
  | { kind: "block"; src: string; doc: RelPath; title?: string };

export type PaneKind = PaneSpec["kind"];

// Every pane kind, for coverage (the UX audit reports kinds no journey opened). A Record keyed by
// PaneKind: forgetting a new kind here is a compile error, not a silent gap.
const KINDS: Record<PaneKind, true> = {
  today: true, editor: true, terminal: true, files: true, search: true, pdf: true, image: true, web: true,
  settings: true, git: true, commit: true, diff: true, table: true, base: true, excalidraw: true,
  library: true, libraries: true, outline: true, plugin: true, commands: true, graph: true, page: true, block: true, explorer: true,
};
export const PANE_KINDS = Object.keys(KINDS) as PaneKind[];
export type SpecOf<K extends PaneKind> = Extract<PaneSpec, { kind: K }>;

export { basename };
// names every folder of a kind repeats (a folder's index.md, an old paper's notes.md): told apart by the folder
const GENERIC = /^(notes|index|readme|info|main|_index)\.\w+$/i;
/** A file's name on a tab (no extension): its own, or `folder · name` when the name alone says nothing. */
export function tabName(path: string): string {
  const parts = path.split("/"), name = parts.pop() || path, folder = parts.pop();
  return folder && GENERIC.test(name) ? `${folder} · ${shownName(name)}` : shownName(name);
}

export function paneId(s: PaneSpec): string {
  switch (s.kind) {
    case "today":
    case "files":
    case "search":
    case "settings":
    case "git":
    case "library":
    case "libraries":
    case "outline":
    case "commands":
    case "graph":
      return s.kind;
    case "plugin":
      return s.path ? `plugin:${s.id}:${s.path}` : s.arg !== undefined ? `plugin:${s.id}#${s.arg}` : `plugin:${s.id}`;
    case "commit":
      return `commit:${s.hash}`;
    case "diff":
      return `diff:${s.staged ? "staged" : "work"}:${s.path}`;
    case "editor":
    case "pdf":
    case "image":
    case "table":
    case "base":
    case "page":
    case "excalidraw":
      return `${s.kind}:${s.path}`;
    case "terminal":
      return `terminal:${s.preset}:${s.n}`;
    case "explorer":
      return `explorer:${s.source}:${s.place}`; // where it opened: it may wander since (its title says where it is)
    case "web":
      return `web:${s.url}`;
    case "block":
      return `block:${s.doc}:${hash(s.src)}`;
  }
}

/** A short stable id for a text (djb2): a block tab's identity is its YAML. */
function hash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** `type: runs.plot` → "runs.plot" (the first line that names the block; "list" when none does). */
export const blockType = (src: string) => /^\s*type:\s*["']?([\w.:-]+)/m.exec(src)?.[1] ?? "list";

export function paneTitle(s: PaneSpec): string {
  switch (s.kind) {
    case "today": return "Today";
    case "files": return "Files";
    case "explorer": return s.path ? basename(s.path) : s.place || "Files";
    case "search": return "Search";
    case "editor":
    case "pdf":
    case "image":
    case "table":
    case "base":
    case "excalidraw":
      return tabName(s.path);
    case "page": return s.title ?? shownName(s.path);
    case "terminal": return s.title || (s.preset === "claude" ? "Claude" : s.n > 1 ? `Shell ${s.n}` : "Shell");
    case "settings": return "Settings";
    case "library": return "Library";
    case "libraries": return "Libraries";
    case "outline": return "Outline";
    case "commands": return "Commands";
    case "graph": return "Graph";
    case "plugin": return s.path ? shownName(s.path) : (s.title ?? s.arg ?? s.id);
    case "git": return "Git";
    case "commit": return s.hash.slice(0, 7) + (s.subject ? ` ${s.subject.length > 28 ? s.subject.slice(0, 27) + "…" : s.subject}` : "");
    case "diff": return `${shownName(s.path)} (${s.staged ? "staged" : "changes"})`;
    case "web": {
      try { return new URL(s.url).host || s.url; } catch { return s.url; }
    }
    case "block": return s.title ?? blockType(s.src);
  }
}

export type IconName =
  | "today" | "files" | "search" | "lecture" | "command" | "file" | "file-code" | "file-text" | "pdf"
  | "image" | "terminal" | "claude" | "globe" | "mail" | "folder" | "folder-open" | "chevron" | "close" | "edit" | "trash"
  | "eye" | "check" | "circle" | "commit" | "clock" | "sun" | "moon" | "plus" | "minus" | "refresh" | "zoom"
  | "settings" | "git" | "panel-bottom" | "panel-right" | "chevron-down" | "table" | "library" | "copy" | "link" | "outline" | "plugin" | "chart"
  | "error" | "warning" | "undo" | "arrow-up" | "arrow-down" | "arrow-left" | "arrow-right" | "pin" | "panel-left"
  | "calendar" | "flag" | "repeat" | "chevrons-up" | "chevrons-down" | "return" | "hash" | "inbox" | "server" | "grid" | "rows"
  | "pen" | "headphones" | "ballpoint" | "highlighter" | "eraser" | "pointer" | "hand" | "redo" | "maximize" | "sliders"
  | "folder-tree" | "move-out" | "move-in" | "external-link" | "user"
  | "bold" | "italic" | "code" | "heading" | "list" | "list-ordered" | "list-todo" | "quote";

export function paneIcon(s: PaneSpec): IconName {
  switch (s.kind) {
    case "today": return "today";
    case "files": return "files";
    case "explorer": return s.source === "vault" ? "folder-open" : "server";
    case "search": return "search";
    case "editor": return fileIcon(s.path);
    case "pdf": return "pdf";
    case "image": return "image";
    case "terminal": return s.preset === "claude" ? "claude" : "terminal";
    case "web": return "globe";
    case "settings": return "settings";
    case "git": return "git";
    case "commit": return "commit";
    case "diff": return "git";
    case "table":
    case "base":
      return "table";
    case "page": return "today";
    case "excalidraw":
      return "edit";
    case "library": case "libraries": return "library";
    case "outline": return "outline";
    case "commands": return "command";
    case "graph": return "link";
    case "plugin": return s.icon && isIconName(s.icon) ? s.icon : "plugin";
    case "block": return "chart";
  }
}

/** Delimited data opens as a table (the pane has a "view as text" switch). */
export const TABLE_RE = /\.(tsv|csv|tab|xlsx)$/i;
const CODE_RE = /\.(rs|py|ts|js|mjs|cjs|tsx|jsx|svelte|c|h|cc|cpp|hpp|go|java|kt|jl|f90|f|sh|zsh|bash|toml|ya?ml|json|lua|rb|css|scss|html|tex|bib|nix|cmake|sql)$/i;

export function fileIcon(path: string): IconName {
  if (/\.(excalidraw|rnote|excalidraw\.md)$/i.test(path)) return "edit";
  if (/\.pdf$/i.test(path)) return "pdf";
  if (IMAGE_RE.test(path)) return "image";
  if (TABLE_RE.test(path) || /\.base$/i.test(path)) return "table";
  if (/\.(md|markdown|txt)$/i.test(path)) return "file-text";
  if (CODE_RE.test(path)) return "file-code";
  return "file";
}

/** Which pane opens a file: PDFs and images get viewers, everything else the editor. */
export function specForPath(path: RelPath, line?: number): PaneSpec {
  if (/\.excalidraw(\.md)?$/i.test(path)) return { kind: "excalidraw", path }; // .md: the Obsidian plugin's format
  if (/\.pdf$/i.test(path)) return line === undefined ? { kind: "pdf", path } : { kind: "pdf", path, page: line }; // a PDF's "line" is its page
  if (IMAGE_RE.test(path)) return { kind: "image", path }; // SVG too, as a picture; "Open with" → the text editor for its code
  if (TABLE_RE.test(path)) return { kind: "table", path };
  if (/\.base$/i.test(path)) return { kind: "base", path };
  if (/\.page$/i.test(path)) return { kind: "page", path };
  return line === undefined ? { kind: "editor", path } : { kind: "editor", path, line };
}

/** "Document" panes live in the main area; tools (files/search) go to the side, terminals below. */
export type PaneZone = "main" | "side" | "bottom";
/** Where a pane goes. A block is in the main zone unless it is a plugin's side tool. */
export const specZone = (s: PaneSpec): PaneZone => (s.kind === "block" && sideToolOf(s.src) ? "side" : paneZone(s.kind));

export function paneZone(k: PaneKind): PaneZone {
  switch (k) {
    case "files":
    case "search":
    case "git":
    case "outline":
      return "side";
    case "terminal":
      return "bottom";
    case "today":
    case "editor":
    case "pdf":
    case "image":
    case "web":
    case "settings":
    case "commit":
    case "diff":
    case "table":
    case "base":
    case "page":
    case "library":
    case "libraries":
    case "excalidraw":
    case "plugin":
    case "commands":
    case "graph":
    case "block":
    case "explorer":
      return "main";
  }
}

const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
/** The block that shows this pane inside a note (the reverse of specFromOptions), or null for a
 *  pane that is not a thing to embed (a terminal, a commit, another block's own tab). */
export function embedOptions(s: PaneSpec): Record<string, string> | null {
  switch (s.kind) {
    case "today": case "files": case "git": case "library": case "outline": case "commands": case "graph":
      return {};
    case "search": return s.q ? { q: s.q } : {};
    case "libraries": return s.at ? { at: s.at } : {};
    case "editor": case "pdf": case "image": case "table": case "base": case "excalidraw": case "page":
      return { path: s.path };
    default: return null;
  }
}

let embeddedTerminals = 1000; // terminal numbers for embedded shells, clear of the tabs' 1, 2, 3…

/** The pane a block's options describe (`{ view: pdf, path: a.pdf }`), or what is missing, as text.
 *  Exhaustive over PaneKind: a new kind must say here how it is embedded. */
export function specFromOptions(kind: PaneKind, o: Record<string, unknown>): PaneSpec | string {
  const path = str(o.path);
  const needPath = `a ${kind} block needs \`path:\` (a file in the workspace)`;
  switch (kind) {
    case "today":
    case "files":
    case "settings":
    case "git":
    case "library":
    case "outline":
    case "commands":
    case "graph":
      return { kind };
    case "search": return { kind, q: str(o.q) };
    case "libraries": return { kind, at: str(o.at) };
    case "editor":
    case "pdf":
    case "image":
    case "table":
    case "base":
    case "excalidraw":
      return path ? { kind, path } : needPath;
    case "page": return path ? { kind, path, title: str(o.title) } : needPath;
    case "diff": return path ? { kind, path, staged: o.staged === true } : needPath;
    case "commit": return str(o.hash) ? { kind, hash: str(o.hash)! } : "a commit block needs `hash:`";
    case "web": return str(o.url) ? { kind, url: str(o.url)! } : "a web block needs `url:`";
    // `n` and `title`: a pinned terminal keeps its number and name (lib/bookmarks.svelte.ts)
    case "terminal": return { kind, preset: o.preset === "claude" ? "claude" : "shell", n: typeof o.n === "number" ? o.n : ++embeddedTerminals, title: str(o.title) };
    case "plugin": return str(o.id) ? { kind, id: str(o.id)!, path, title: str(o.title), icon: str(o.icon), arg: str(o.arg), anchor: str(o.anchor) } : "a plugin block needs `id:`";
    case "block": return "a block cannot embed itself";
    case "explorer": return { kind, source: str(o.source) ?? "vault", place: str(o.place) ?? "", path };
  }
}
