// "Note: create or edit task…" (Obsidian Tasks' dialog): the caret's line in a form; Save writes it
// back as one change — unless the line was edited meanwhile (a sync, another window), then nothing is lost: the
// task goes on a new line below.
import { mount, unmount } from "svelte";
import type { EditorView } from "@codemirror/view";
import TaskDialog from "../../components/TaskDialog.svelte";
import { formatTaskLine, parseTaskLine, type TaskLine } from "../task-line";

export function editTask(view: EditorView): void {
  const head = view.state.selection.main.head;
  const line = view.state.doc.lineAt(head);
  const before = line.text;
  const task = parseTaskLine(before);
  const isNew = !/^\s*(?:[-*+]|\d+[.)])\s+\[.\]/u.test(before);
  const host = document.body.appendChild(document.createElement("div"));
  let app: ReturnType<typeof mount> | null = null;
  const close = (): void => { if (app) void unmount(app); app = null; host.remove(); view.focus(); };
  const save = (t: TaskLine): void => {
    const text = formatTaskLine(t);
    if (view.dom.isConnected) {
      const n = line.number <= view.state.doc.lines ? view.state.doc.line(line.number) : null;
      const at = n && n.text === before ? n : null;
      const change = at ? { from: at.from, to: at.to, insert: text } : { from: view.state.doc.lineAt(Math.min(head, view.state.doc.length)).to, insert: `\n${text}` };
      const end = change.from + (at ? 0 : 1) + text.length;
      view.dispatch({ changes: change, selection: { anchor: end }, userEvent: "input.task", scrollIntoView: true });
    }
    close();
  };
  app = mount(TaskDialog, { target: host, props: { task, isNew, onsubmit: save, oncancel: close } });
}
