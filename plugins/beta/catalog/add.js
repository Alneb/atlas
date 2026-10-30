// "Add to the catalog…" as a dialog (atlas.openDialog with view "add.js"): the collections block's own form (addBox),
// its card and its choices in one place; the note added, or the one already there, is opened and the dialog closed.
import { addBox } from "./main.js";

export default function mount(host, atlas) {
  host.style.cssText = "padding: 16px; overflow: auto; height: 100%; box-sizing: border-box; background: var(--bg); color: var(--text);";
  const box = addBox(atlas, { text: String(atlas.arg ?? ""), ondone: (path) => { atlas.open(path); atlas.pane.close(); } });
  host.append(box);
  box.input.focus();
}
