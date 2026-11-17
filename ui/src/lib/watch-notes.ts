// Notes while watching (docs/design/DESIGN-video-player.md §5): what plays is linked, quoted and pictured into the
// note being written — the time as a link back into it (`[[film#t=1:02:03]]`: a click seeks it), the subtitle line
// shown, the frame shown (attached through the one attach path, lib/attach.ts). All plain Markdown in the owner's note.
import type { EditorView } from "@codemirror/view";
import { api } from "./api";
import { attachFiles } from "./attach";
import { focusedNote } from "./editor/md-format";
import { clockOf, timeLink } from "./player-time";
import { nowPlaying, type PlayerState } from "./player.svelte";
import { editors, lastEditorId } from "./registry";
import { toast } from "./state.svelte";

export { timeLink };

/** The subtitle line as a quote, with its time. */
export function subtitleQuote(s: Pick<PlayerState, "at" | "note" | "subText">): string | null {
  const text = (s.subText ?? "").trim();
  if (!text) return null;
  return `${text.split(/\r?\n/).map((l) => `> ${l}`).join("\n")}\n> — ${timeLink(s)}`;
}

function playing(): PlayerState | null {
  const s = nowPlaying.s;
  if (!s) toast("Nothing plays", "Start a film or an episode first.");
  return s;
}

/** The note the keyboard is in, else the last one written in: inline text at the caret, or a block after its paragraph. */
function put(text: string, block: boolean): void {
  const view: EditorView | null = focusedNote();
  if (view) {
    const { from, to } = view.state.selection.main;
    const line = view.state.doc.lineAt(from);
    const ins = block ? `${line.text.trim() ? "\n" : ""}${text}\n` : `${text} `;
    view.dispatch({ changes: { from, to, insert: ins }, selection: { anchor: from + ins.length }, userEvent: "input", scrollIntoView: true });
    return;
  }
  const id = lastEditorId();
  if (id) editors.get(id)!.insertBlock(text);
  else toast("No note to write in", "Open the note beside the player and put the caret where it goes.");
}

export function insertTime(): void {
  const s = playing();
  if (s) put(timeLink(s), false);
}

export function quoteSubtitle(): void {
  const s = playing();
  if (!s) return;
  const q = subtitleQuote(s);
  if (q) put(q, true);
  else toast("No subtitle shown", "Turn subtitles on in mpv (j) to quote them.");
}

/** The frame shown, attached beside the note being written and embedded with its time. */
export async function grabFrame(): Promise<void> {
  const s = playing();
  if (!s) return;
  if (!s.video) { toast("Not a video", "A frame is grabbed from a film or an episode."); return; }
  const id = lastEditorId();
  const note = id ? editors.get(id)?.path : undefined;
  if (!note) { toast("No note to put it in", "Open the note beside the player first."); return; }
  const png = await api.mpvFrame().catch(() => null);
  if (!png) { toast("No frame", "mpv shows nothing to grab."); return; }
  const title = s.title.replace(/\.(mkv|mp4|webm|mov|avi|m4v)$/i, "").replace(/[\\/:*?"<>|#^[\]]/g, " ").trim() || "Frame";
  const name = `${title} ${clockOf(s.at).replace(/:/g, "-")}.png`;
  const [done] = await attachFiles(note, [new File([png], name, { type: "image/png" })]);
  if (done) put(`${done.embed}\n${timeLink(s)}`, true);
}
