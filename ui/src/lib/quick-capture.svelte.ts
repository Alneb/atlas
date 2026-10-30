// The capture popup over any pane (components/QuickCapture.svelte): Super+E twice, Super+C, the top bar's Capture.
// What was typed and not sent stays as a draft, here and across a reload.
import { load, save } from "./prefs";
import { editors, lastEditorId } from "./registry";
import { api } from "./api";
import { toast } from "./state.svelte";
import { open, openPath } from "./dock";
import { landedAt } from "./capture-guides";
import { errText } from "./text";
import type { CaptureResult } from "./gen/CaptureResult";

const DRAFT = "atlas.capture.draft";
export const quickCapture = $state({ open: false, text: "" });

/** The selection in the last editor, when there is one: a passage to keep. */
function selection(): string {
  const id = lastEditorId();
  const snap = id ? editors.get(id)?.snapshot() : null;
  return snap ? snap.ranges.map((r) => snap.text.slice(r.from, r.to)).filter(Boolean).join("\n") : "";
}

/** Opens the popup: `seed` (what was typed in the command bar), else the draft, else the editor's selection. */
/** The captures still to triage, in a tab: the one way every button and command opens them. */
export const openCaptures = (): void => void open({ kind: "block", src: "type: captures\n", doc: "", title: "Captures", icon: "inbox" });

export function openQuickCapture(seed = ""): void {
  if (quickCapture.open && !seed) { quickCapture.open = false; return; }
  quickCapture.text = seed || load<string>(DRAFT, "") || selection();
  quickCapture.open = true;
}
export function keepDraft(text: string): void { save(DRAFT, text); }

/** Every capture door's notice: where it went, Open (the line in its note) and Undo (taken back, the text back in the
 *  popup to change and send again). */
export function captured(r: CaptureResult, text: string): void {
  toast("Captured", landedAt(r), "success", 4500, [
    { label: "Open", run: () => openPath(r.path, r.line) },
    { label: "Undo", run: () => void api.captureUndo(r).then(() => { keepDraft(text); openQuickCapture(text); },
      (e) => toast("Not taken back", `${errText(e)} (it changed since, or moved)`, "error")) },
  ]);
}
