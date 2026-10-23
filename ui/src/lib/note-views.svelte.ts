// Note views (docs/design/DESIGN-shared-notes.md): a plugin draws a kind of note its own way — a mail note as the mail.
// A note's `view` property names one, or its `type` is one a view claims; the Editor pane draws it in place of the
// text, and "Show as note" gives the markdown back (remembered per note for the session).
import { SvelteMap, SvelteSet } from "svelte/reactivity";
import type { Props } from "./property-model";

export interface NoteViewContext { path: string; text: string; props: Props; /** back to the markdown */ showNote(): void }
export interface NoteView {
  title: string;
  /** `type` values drawn by this view when the note names no `view` */
  types?: string[];
  /** Draws the note into `host`; called again when the text changes. Returns its cleanup. */
  render(host: HTMLElement, note: NoteViewContext): void | (() => void);
}

const views = new SvelteMap<string, NoteView>();
/** Notes the user turned back to markdown ("Show as note"). */
export const shownAsNote = new SvelteSet<string>();

export function registerNoteView(name: string, v: NoteView): () => void {
  views.set(name, v);
  return () => { if (views.get(name) === v) views.delete(name); };
}

/** The view that draws a note with these properties: its `view`, else one claiming its `type`. */
export function noteViewFor(props: Props | null | undefined): NoteView | null {
  if (!props) return null;
  if (typeof props.view === "string") return views.get(props.view) ?? null;
  const type = typeof props.type === "string" ? props.type : null;
  return type ? ([...views.values()].find((v) => v.types?.includes(type)) ?? null) : null;
}
