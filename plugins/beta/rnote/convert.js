// A folder's Rnote files converted to drawings in a dialog (atlas.openDialog with view "convert.js", the folder as
// `atlas.arg`): a bar while it runs, then one line per file — made, made before, or why it failed — each drawing
// opened by a click.
import { convertFolder } from "./main.js";

export default function mount(host, atlas) {
  const dir = String(atlas.arg ?? "");
  const el = (tag, props = {}, kids = []) => {
    const e = Object.assign(document.createElement(tag), props);
    e.append(...kids);
    return e;
  };
  host.classList.add("rnc");
  const style = el("style", { textContent: `
    .rnc { display: flex; flex-direction: column; gap: 10px; height: 100%; min-height: 0; padding: 16px; box-sizing: border-box; background: var(--bg); color: var(--text); }
    .rnc p { margin: 0; }
    .rnc progress { width: 100%; accent-color: var(--accent); }
    .rnc-said { font-weight: 600; }
    .rnc ul { flex: 1; min-height: 0; overflow: auto; margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 2px; font-size: .9em; }
    .rnc li { display: flex; gap: 8px; align-items: baseline; padding: 3px 6px; border-radius: 5px; }
    .rnc li span:first-child { flex: 1; min-width: 0; overflow-wrap: anywhere; }
    .rnc li .what { color: var(--text-muted); white-space: nowrap; }
    .rnc li.err .what { color: var(--danger, #c33); white-space: normal; }
    .rnc li.open { cursor: pointer; }
    .rnc li.open:hover { background: var(--bg-hover, rgba(127,127,127,.12)); }
    .rnc-go { display: flex; justify-content: flex-end; }
    .rnc-go button { padding: 6px 14px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg); color: var(--text); cursor: pointer; }
  ` });
  const said = el("p", { className: "rnc-said", textContent: `Looking for Rnote files in ${dir || "the vault"}…` });
  const bar = el("progress", { max: 1, value: 0 });
  const list = el("ul");
  const close = el("button", { textContent: "Close" });
  close.addEventListener("click", () => atlas.pane.close());
  host.append(style, said, bar, list, el("div", { className: "rnc-go" }, [close]));

  let gone = false;
  convertFolder(atlas, dir, ({ path, n, of, out, error }) => {
    if (gone) return;
    bar.max = of;
    bar.value = n;
    said.textContent = `Converting ${n} of ${of}…`;
    const what = error ? error : out.made ? "made" : "made before";
    const li = el("li", { className: error ? "err" : "open", title: error ? "" : out.path }, [el("span", { textContent: path.slice(dir ? dir.length + 1 : 0) }), el("span", { className: "what", textContent: what })]);
    if (!error) li.addEventListener("click", () => atlas.open(out.path));
    list.append(li);
  }).then((r) => {
    if (gone) return;
    bar.remove();
    said.textContent = r.of ? `${r.said[0].toUpperCase()}${r.said.slice(1)}.` : `No Rnote files in ${dir || "the vault"}.`;
    close.focus();
  }, (e) => { if (!gone) { bar.remove(); said.textContent = e instanceof Error ? e.message : String(e); } });
  return () => { gone = true; };
}
