// Open with… (docs/guides/MALLEABLE.md R2, tools not apps): one file, many views. Atlas's own viewers and
// plugin panes that declare `opens = [...]` are openers. The default of a plain open, first that applies: the vault's
// `[files] open_with` for the extension, a plugin's `claims = [...]` (the editor contract,
// docs/guides/PLUGIN-API.md), Atlas's built-in viewer. Kept free of dock/plugin imports (they register here).
import { specForPath, tableViewIn, TABLE_RE, type IconName, type PaneSpec } from "./panes";
import { settings, updateSettings } from "./settings.svelte";

export interface Opener {
  /** `editor`, `table`… or `plugin:<id>`; what `[files] open_with` stores. */
  id: string;
  title: string;
  icon: IconName;
  accepts(path: string): boolean;
  /** A plugin's claim: the default for these files while the vault names no other (`claims` in its manifest). */
  claims?(path: string): boolean;
  /** `anchor`: the link's `#…` (`Chapter 3`), for the viewers that take one. */
  spec(path: string, line?: number, anchor?: string): PaneSpec;
}

const TEXTISH = /\.(md|markdown|txt|tsv|csv|tab|dat|json|ya?ml|toml|base|page|svg|tex|bib|py|rs|js|ts|sh|log|ini|cfg|xml|html|css|lua)$/i;
const builtins: Opener[] = [
  { id: "editor", title: "Text editor", icon: "file-text", accepts: (p) => TEXTISH.test(p) || !/\.[^/]+$/.test(p), spec: (path, line) => (line === undefined ? { kind: "editor", path } : { kind: "editor", path, line }) },
  { id: "table", title: "Table", icon: "table", accepts: (p) => TABLE_RE.test(p) || /\.(dat|txt)$/i.test(p), spec: (path, _line, anchor) => ({ kind: "table", path, view: tableViewIn(anchor) }) },
  { id: "base", title: "Database (Bases)", icon: "table", accepts: (p) => /\.base$/i.test(p), spec: (path) => ({ kind: "base", path }) },
  { id: "page", title: "Page", icon: "today", accepts: (p) => /\.page$/i.test(p), spec: (path) => ({ kind: "page", path }) },
  { id: "pdf", title: "PDF reader", icon: "pdf", accepts: (p) => /\.pdf$/i.test(p), spec: (path, line) => (line === undefined ? { kind: "pdf", path } : { kind: "pdf", path, page: line }) },
  { id: "image", title: "Image", icon: "image", accepts: (p) => /\.(png|jpe?g|gif|svg|webp|avif|bmp)$/i.test(p), spec: (path) => ({ kind: "image", path }) },
  { id: "excalidraw", title: "Excalidraw", icon: "edit", accepts: (p) => /\.excalidraw(\.md)?$/i.test(p), spec: (path) => ({ kind: "excalidraw", path }) },
];
const extra = new Map<string, Opener>();

/** Plugins add their panes here (lib/plugins.svelte.ts). */
export function registerOpener(o: Opener): () => void {
  extra.set(o.id, o);
  return () => { if (extra.get(o.id) === o) extra.delete(o.id); };
}

/** `a.tsv` → `tsv`; `x.excalidraw.md` → `excalidraw.md` (compound extensions are their own kind). */
export const extOf = (path: string) => /\.((?:excalidraw\.)?[^./]+)$/i.exec(path)?.[1].toLowerCase() ?? "";

const all = () => [...builtins, ...extra.values()];
const defaultId = (path: string) => settings.config?.files.open_with?.[extOf(path)];

/** The spec a plain open uses: the user's choice for this extension, else a plugin's claim, else Atlas's usual viewer. */
export function resolveSpec(path: string, line?: number, anchor?: string): PaneSpec {
  const id = defaultId(path);
  const o = (id ? all().find((x) => x.id === id && x.accepts(path)) : undefined) ?? [...extra.values()].find((x) => x.claims?.(path));
  return o ? o.spec(path, line, anchor) : specForPath(path, line, anchor);
}

/** Every view that can show `path`, the current default first. */
export function openersFor(path: string): (Opener & { isDefault: boolean })[] {
  const usual = resolveSpec(path);
  const isDefault = (o: Opener) => (defaultId(path) ? o.id === defaultId(path) : JSON.stringify(o.spec(path)) === JSON.stringify(usual));
  return all().filter((o) => o.accepts(path)).map((o) => ({ ...o, isDefault: isDefault(o) })).sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
}

/** Make `id` the default for this file's extension (`null`: back to Atlas's usual viewer). */
export function setDefaultOpener(path: string, id: string | null): Promise<void> {
  const ext = extOf(path);
  return updateSettings((c) => {
    if (id) c.files.open_with[ext] = id; else delete c.files.open_with[ext];
  });
}
