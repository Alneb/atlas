// Writing in a note while a film plays (docs/design/DESIGN-video-player.md §5), the two `[player]` settings:
// - `pause_on_type`: a key typed in any note pauses the video that plays; `resume_after` seconds without a key play it
//   on — only when it was the typing that paused it (a pause of the person's own stays).
// - `stamp_lines`: the first character typed on an empty line (or one that is only a list / quote marker) comes after
//   the time, as a link that seeks it (`timeLink`), outside the properties and code blocks.
// Both read the setting at each key, so Settings takes effect at once; neither does anything while nothing plays.
import { EditorState, type Extension, type Transaction, type TransactionSpec } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { nowPlaying, shellPlayer } from "../player.svelte";
import { startsLine, timeLink } from "../player-time";
import { settings } from "../settings.svelte";
import { bodyStart } from "./live/live-preview.js";

const film = () => {
  const s = nowPlaying.s;
  return s?.video && s.playing ? s : null;
};

/** Code where the time would be text of the program, not a note: fenced or indented code, inline code, math. */
const CODE = /Code|Math|Comment/;
function inCode(state: EditorState, at: number): boolean {
  for (let n: ReturnType<ReturnType<typeof syntaxTree>["resolveInner"]> | null = syntaxTree(state).resolveInner(at, -1); n; n = n.parent)
    if (CODE.test(n.name)) return true;
  return false;
}

/** The typed character's transaction, rewritten to put the time before it when it starts a line. */
function stamp(tr: Transaction): TransactionSpec | readonly TransactionSpec[] {
  if (!tr.docChanged || !tr.isUserEvent("input.type") || !settings.config?.player?.stamp_lines) return tr;
  const s = film();
  if (!s) return tr;
  let one: { from: number; to: number; text: string } | null = null, count = 0;
  tr.changes.iterChanges((from, to, _f, _t, ins) => { count++; one = { from, to, text: ins.toString() }; });
  if (count !== 1 || !one) return tr;
  const { from, to, text } = one as { from: number; to: number; text: string };
  const doc = tr.startState.doc, line = doc.lineAt(from);
  if (to !== from || from !== line.to || from < bodyStart(doc) || inCode(tr.startState, from)) return tr;
  if (!startsLine(line.text.slice(0, from - line.from), text)) return tr;
  const t = `${timeLink(s)} `;
  // the typed character stays as typed; the time goes in front of it, the caret after both (one undo step)
  return [tr, { changes: { from, to: from, insert: t }, selection: { anchor: from + t.length + text.length }, userEvent: "input.type", sequential: true }];
}

let resumeTimer: ReturnType<typeof setTimeout> | undefined;
let pausedByTyping = false;
function pauseForTyping(): void {
  const cfg = settings.config?.player;
  if (!cfg?.pause_on_type) return;
  if (film()) { shellPlayer.pause(); pausedByTyping = true; }
  if (!pausedByTyping) return;
  clearTimeout(resumeTimer);
  if (cfg.resume_after > 0)
    resumeTimer = setTimeout(() => {
      // played or closed by the person meanwhile: theirs, not ours to resume
      if (pausedByTyping && nowPlaying.s?.video && !nowPlaying.s.playing) shellPlayer.resume();
      pausedByTyping = false;
    }, cfg.resume_after * 1000);
}

/** A note's extension: the time before a line started during a film, the film paused while typing. */
export function watching(): Extension {
  return [
    EditorState.transactionFilter.of(stamp),
    EditorView.updateListener.of((u) => {
      if (u.docChanged && u.transactions.some((t) => t.isUserEvent("input") || t.isUserEvent("delete"))) pauseForTyping();
    }),
  ];
}
