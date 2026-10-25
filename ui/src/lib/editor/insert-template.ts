// "Note: insert a template…": a template chosen in the palette, its properties merged into the note's (only what the
// note lacks: the core's merge, as when a template applies by itself) and its body put at the caret — one change.
import type { EditorView } from "@codemirror/view";
import { api } from "../api";
import { pick } from "../palette.svelte";
import { templateLabel } from "../notes-system";
import { diff } from "../frontmatter-edit";
import { editors, lastEditorId } from "../registry";
import { toast } from "../state.svelte";
import { errText } from "../text";

export function insertTemplate(view: EditorView): void {
  const path = editors.get(lastEditorId() ?? "")?.path ?? "";
  pick({
    placeholder: "Insert a template…",
    tag: "Template",
    icon: "file-text",
    items: async () => (await api.templates()).map((t) => ({ value: t.name, title: templateLabel(t), detail: t.path })),
    onpick: async (name) => {
      const before = view.state.doc.toString(), at = view.state.selection.main.head;
      try {
        const r = await api.mergeTemplate(path, name, before, true);
        if (view.state.doc.toString() !== before) return toast("Not inserted", "the note changed meanwhile: try again", "error");
        const props = diff(before, r.text ?? before), body = r.body?.trim() ? r.body.replace(/\n*$/, "\n") : "";
        // a caret inside what the properties change goes after it; positions are the note's before the change
        const where = props && at > props.from && at < props.to ? props.to : at;
        const grown = props && props.from <= where ? props.insert.length - (props.to - props.from) : 0;
        view.dispatch({
          changes: [...(props ? [props] : []), ...(body ? [{ from: where, insert: body }] : [])],
          selection: { anchor: where + grown + body.length },
          userEvent: "input.template",
          scrollIntoView: true,
        });
        view.focus();
      } catch (e) { toast("Not inserted", errText(e), "error"); }
    },
  });
}
