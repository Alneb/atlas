// The sources in a dialog (atlas.openDialog with view "sources.js", from "Notifications: mute a source…"): each source
// with what is unread and how long it is muted, changed in place — one form instead of two lists in a row. A source's
// name opens its note.
import { MUTE_CHOICES, muteSource, mutedOf, sourceName, sourceNotes } from "./main.js";

export default function mount(host, atlas) {
  const el = (tag, props = {}, kids = []) => {
    const e = Object.assign(document.createElement(tag), props);
    e.append(...kids);
    return e;
  };
  host.classList.add("nts");
  const style = el("style", { textContent: `
    .nts { display: flex; flex-direction: column; gap: 10px; height: 100%; min-height: 0; padding: 16px; box-sizing: border-box; background: var(--bg); color: var(--text); }
    .nts p { margin: 0; }
    .nts .hint { color: var(--text-muted); font-size: .9em; }
    .nts ul { flex: 1; min-height: 0; overflow: auto; margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 4px; }
    .nts li { display: flex; gap: 10px; align-items: center; padding: 4px 6px; border: 1px solid var(--border); border-radius: 6px; }
    .nts li .name { flex: 1; min-width: 0; overflow-wrap: anywhere; text-align: left; background: none; border: 0; padding: 0; color: var(--text); cursor: pointer; font: inherit; }
    .nts li .name:hover { text-decoration: underline; }
    .nts li .unread { color: var(--accent); font-size: .9em; white-space: nowrap; }
    .nts li .done { color: var(--text-muted); font-size: .85em; white-space: nowrap; }
    .nts select { font: inherit; color: var(--text); background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: 3px 6px; }
    .nts-go { display: flex; justify-content: flex-end; }
    .nts-go button { padding: 6px 14px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg); color: var(--text); cursor: pointer; }
  ` });
  const said = el("p", { className: "hint", textContent: "Reading the sources…" });
  const list = el("ul", { ariaLabel: "Sources" });
  const close = el("button", { textContent: "Close" });
  close.addEventListener("click", () => atlas.pane.close());
  host.append(style, said, list, el("div", { className: "nts-go" }, [close]));

  let gone = false;
  const row = (path, props) => {
    const name = sourceName(atlas, path);
    const open = el("button", { className: "name", textContent: name, title: path });
    open.addEventListener("click", () => { atlas.open(path); atlas.pane.close(); });
    const unread = Number(props.unread) || 0;
    const muted = mutedOf(props);
    // the mute as it stands, then the choices; "off" reads "Not muted" here, as the state it leaves
    const now = muted === "always" ? "always" : muted ? "until" : "off";
    const select = el("select", { ariaLabel: `Mute ${name}` }, [
      ...(muted && muted !== "always" ? [el("option", { value: "until", textContent: `Muted until ${muted}` })] : []),
      ...MUTE_CHOICES.map((c) => el("option", { value: c.value, textContent: c.value === "off" ? "Not muted" : c.value === "always" ? "Muted until I unmute it" : `Mute for ${c.title.toLowerCase()}` })),
    ]);
    select.value = now;
    const done = el("span", { className: "done", ariaLive: "polite" });
    select.addEventListener("change", async () => {
      if (select.value === "until") return;
      select.disabled = true;
      try {
        const until = await muteSource(atlas, path, select.value);
        done.textContent = select.value === "off" ? "unmuted" : select.value === "always" ? "muted" : `until ${until}`;
      } catch (e) { done.textContent = e instanceof Error ? e.message : String(e); }
      finally { select.disabled = false; }
    });
    return el("li", {}, [open, ...(unread ? [el("span", { className: "unread", textContent: `${unread} unread` })] : []), select, done]);
  };
  sourceNotes(atlas).then(async (paths) => {
    const rows = await Promise.all(paths.map(async (p) => row(p, await atlas.noteProps(p).catch(() => ({})))));
    if (gone) return;
    said.textContent = rows.length ? "A muted source is still logged in its note; it only stops showing as a toast." : "No source has sent anything yet.";
    list.append(...rows);
  }, (e) => { if (!gone) said.textContent = e instanceof Error ? e.message : String(e); });
  return () => { gone = true; };
}
