// The shared context (docs/guides/MALLEABLE.md, R3): what the user is looking at — active and open panes,
// the editor selection, the section around the caret, and the entity under the pointer. One reactive
// object for every pane, plugin and view; also pushed to the core (PUT /api/ui/state), so Claude
// reads it through `atlas mcp` → atlas_context. The push is fire-and-forget and debounced.
import { api } from "./api";
import type { EditorSelection, PaneRef, UiState } from "./types";

const MAX_TEXT = 20_000; // the contract caps selection text at 20 kB

/** The heading the caret is under (Embark: views and formulas default to this subtree). */
export interface Section { path: string; heading: string; line: number }
/** What the pointer is on, in any pane: a note (path), optionally a line in it. Views and notes
 *  highlight the same thing (Embark's hover sync). */
export interface Hover { path: string; line?: number; source: string }

export const context = $state<{
  active?: PaneRef;
  open: PaneRef[];
  selection?: EditorSelection;
  section?: Section;
  hover?: Hover;
}>({ open: [] });

type Listener = (c: typeof context) => void;
const listeners = new Set<Listener>();
/** Called after every change (plain callback, for code outside Svelte: plugins, editor plugins). */
export function onContext(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

let timer: ReturnType<typeof setTimeout> | undefined;
function changed(serverSide = true): void {
  for (const fn of listeners) { try { fn(context); } catch (e) { console.warn("[atlas] context listener", e); } }
  if (!serverSide) return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    const s: UiState = { active: $state.snapshot(context.active), open: $state.snapshot(context.open), selection: $state.snapshot(context.selection) };
    void api.putUiState(s).catch(() => {});
  }, 300);
}

export function setPanes(active: PaneRef | undefined, open: PaneRef[]): void {
  // the file tree follows the active file, or the vault folder an explorer shows ("": its top)
  if (active?.path !== undefined && active.path !== context.active?.path) window.dispatchEvent(new CustomEvent("atlas-active-file", { detail: active.path }));
  context.active = active;
  context.open = open;
  // a selection in a closed editor is no longer something the user is looking at
  if (context.selection && !open.some((p) => p.path === context.selection!.path)) { context.selection = undefined; context.section = undefined; }
  changed();
}

/** The selection last reported by an editor (path + lines + text), if that editor is still open. */
export const currentSelection = () => context.selection;

export function setSelection(s: EditorSelection, section?: Section): void {
  context.selection = { ...s, text: s.text.length > MAX_TEXT ? s.text.slice(0, MAX_TEXT) : s.text };
  context.section = section;
  changed();
}

/** The pointer entered (or left, with null) an entity in some pane. Local only: not worth a request. */
export function setHover(h: Hover | null): void {
  const same = h && context.hover && h.path === context.hover.path && h.line === context.hover.line;
  if (same || (!h && !context.hover)) return;
  context.hover = h ?? undefined;
  changed(false);
}
