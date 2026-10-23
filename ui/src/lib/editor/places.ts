// Where each file was left: its caret and the line at the top of the screen, per device (localStorage, one origin per vault),
// the last MAX files. A file opened at a given line (a link's heading, a search hit) goes there instead.
import type { EditorView } from "@codemirror/view";
import { load, save } from "../prefs";

const KEY = "atlas.places.v1";
const MAX = 400;
/** Offsets into the file: the caret, the first line on screen. */
export interface Place { head: number; top: number }

type Places = Record<string, Place>;
let cache: Places | null = null;
const all = (): Places => (cache ??= load<Places>(KEY, {}));

export function placeOf(path: string): Place | null {
  const p = all()[path];
  return p && Number.isFinite(p.head) && Number.isFinite(p.top) ? p : null;
}

/** `path`'s place now; the least recently left files are forgotten past MAX. */
export function keepPlace(path: string, p: Place): void {
  const places = all();
  delete places[path]; // re-inserted last: key order is the recency
  places[path] = p;
  const keys = Object.keys(places);
  for (const k of keys.slice(0, Math.max(0, keys.length - MAX))) delete places[k];
  save(KEY, places);
}

/** The view's place: the caret, and the start of the line block at the scroller's top edge. */
export function placeIn(view: EditorView): Place {
  const top = view.lineBlockAtHeight(view.scrollDOM.scrollTop - view.documentPadding.top).from;
  return { head: view.state.selection.main.head, top };
}
