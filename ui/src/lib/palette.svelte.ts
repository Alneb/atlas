// Palette state. One overlay, several modes: commands+files (Super+E), files only (Super+P), a
// free-text URL prompt, and `pick`: a generic chooser any feature or plugin opens (Open with…,
// lecture courses…) — one fuzzy list instead of a dialog per feature.
import type { IconName } from "./panes";
import { api } from "./api";
import { toast } from "./state.svelte";
import { errText } from "./text";
import { keepDraft, openQuickCapture, captured } from "./quick-capture.svelte";

/** `capture`: the bar as a capture box (Super+E, then `+`; or "Capture in the bar"). */
export type PaletteMode = "all" | "files" | "url" | "pick" | "capture";

export interface PickItem { value: string; title: string; detail?: string; icon?: IconName; section?: string }
export interface PickRequest {
  /** Shown in the input. */
  placeholder: string;
  /** The mode tag at the right of the input ("Open with", "Course"…). */
  tag: string;
  icon?: IconName;
  items: PickItem[] | (() => Promise<PickItem[]>);
  /** Offer the typed text as a new value ("New course “X”"); returns that row's title. */
  typed?: (text: string) => string;
  onpick(value: string, isNew: boolean): void | Promise<void>;
  /** The box starts with this typed (a rename: the current name). */
  seed?: string;
  /** Closed with nothing chosen (Escape, a click outside, another chooser in its place). */
  oncancel?(): void;
}

/** `q` (the text in the box) and `sel` (the highlighted row) live here, not in the component: every
 *  way of opening the palette sets them itself, in the same step that opens it — no effect resets
 *  state after the fact. */
export const palette = $state({ open: false, mode: "all" as PaletteMode, q: "", sel: 0, pick: null as PickRequest | null });

/** Captures `text` (the core's capture: the day's log, a to-do, a link filed), saying where it went. */
/** The bar has closed when this answers: a failed capture reopens in the capture popup, kept as its draft, never lost. */
export const captureText = (text: string): void =>
  void api.capture(text).then((r) => captured(r, text), (e) => {
    toast("Not captured", errText(e), "error");
    keepDraft(text);
    openQuickCapture(text);
  });

export function openPalette(mode: Exclude<PaletteMode, "pick">, seed = ""): void {
  // Super+E again on the bar: the capture popup, carrying what was typed (not a command's ">" or a heading's "#")
  if (palette.open && mode === "all" && (palette.mode === "all" || palette.mode === "capture")) {
    const typed = palette.q.trim().replace(/^\+\s*/, "");
    palette.open = false;
    openQuickCapture(/^[>#]/.test(typed) ? "" : typed);
    return;
  }
  if (palette.open && palette.mode === mode) { palette.open = false; return; }
  palette.mode = mode;
  palette.q = seed;
  palette.sel = 0;
  palette.open = true;
}
/** Let the user choose one value (or type a new one, with `typed`). A command or a choice may ask
 *  again at once: the palette runs what was chosen only after it has closed (Palette.svelte). */
let picks = 0; // which chooser is showing: palette.pick is a proxy of the request, never the request itself
/** Returns a function that closes this chooser if it is still the one showing. */
export function pick(req: PickRequest): () => void {
  cancelWaiting();
  waiting = req;
  const mine = ++picks;
  palette.pick = req;
  palette.mode = "pick";
  palette.q = req.seed ?? "";
  palette.sel = 0;
  palette.open = true;
  return () => { if (palette.open && palette.mode === "pick" && picks === mine) palette.open = false; };
}
export function closePalette(): void { palette.open = false; }

// the chooser showing, until a value is chosen (pickChosen) or the palette closes without one (its oncancel)
let waiting: PickRequest | null = null;
function cancelWaiting(): void { const r = waiting; waiting = null; r?.oncancel?.(); }
/** Palette.svelte, as a chooser's row runs: the choice was made, so its closing is no cancel. */
export function pickChosen(): void { waiting = null; }
$effect.root(() => { $effect(() => { if (!palette.open) cancelWaiting(); }); });
