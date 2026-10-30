// The usage report in a dialog (atlas.openDialog with view "usage.js", from "Claude: show usage" or the status bar's
// cell): each account Atlas finds, the one in use first, its limits as bars — red past the warning setting — with when
// each window resets. Look again reads the helper anew.
import { resetText } from "./main.js";

export default function mount(host, atlas) {
  const el = (tag, props = {}, kids = []) => {
    const e = Object.assign(document.createElement(tag), props);
    e.append(...kids);
    return e;
  };
  host.classList.add("cu");
  const style = el("style", { textContent: `
    .cu { display: flex; flex-direction: column; gap: 12px; height: 100%; min-height: 0; padding: 16px; box-sizing: border-box; background: var(--bg); color: var(--text); }
    .cu p { margin: 0; }
    .cu .hint, .cu small { color: var(--text-muted); font-size: .9em; }
    .cu .err { color: var(--danger, #c33); overflow-wrap: anywhere; }
    .cu-list { flex: 1; min-height: 0; overflow: auto; display: flex; flex-direction: column; gap: 12px; }
    .cu section { display: flex; flex-direction: column; gap: 6px; padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px; }
    .cu section.current { border-color: var(--accent); }
    .cu h3 { margin: 0; font-size: 1em; display: flex; gap: 8px; align-items: baseline; }
    .cu .limit { display: grid; grid-template-columns: 9em 1fr 3.5em; gap: 8px; align-items: center; font-size: .92em; }
    .cu .bar { height: 8px; border-radius: 4px; background: var(--border); overflow: hidden; }
    .cu .bar span { display: block; height: 100%; background: var(--accent); }
    .cu .bar.warn span { background: var(--danger, #c33); }
    .cu .pc { text-align: right; font-variant-numeric: tabular-nums; }
    .cu .limit small { grid-column: 2 / 4; margin-top: -4px; }
    .cu-go { display: flex; justify-content: flex-end; gap: 8px; }
    .cu-go button { padding: 6px 14px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg); color: var(--text); cursor: pointer; }
  ` });
  const said = el("p", { className: "hint", textContent: "Reading the usage…" });
  const list = el("div", { className: "cu-list" });
  const again = el("button", { textContent: "Look again" });
  const close = el("button", { textContent: "Close" });
  close.addEventListener("click", () => atlas.pane.close());
  host.append(style, said, list, el("div", { className: "cu-go" }, [again, close]));

  let gone = false;
  const account = (a, warn) => {
    const head = el("h3", {}, [a.name, ...(a.current ? [el("small", { textContent: "in use" })] : [])]);
    const rows = a.error ? [el("p", { className: "err", textContent: a.error })]
      : a.limits.length ? a.limits.map((l) => {
        const pc = Math.max(0, Math.min(100, Math.round(l.percent)));
        const reset = resetText(l.resets_at);
        return el("div", { className: "limit", role: "meter", ariaLabel: `${a.name}: ${l.label}`, ariaValueNow: String(pc), ariaValueMin: "0", ariaValueMax: "100" }, [
          el("span", { textContent: l.label }),
          el("div", { className: `bar${pc >= warn ? " warn" : ""}` }, [el("span", { style: `width: ${pc}%` })]),
          el("span", { className: "pc", textContent: `${pc} %` }),
          ...(reset ? [el("small", { textContent: reset })] : []),
        ]);
      })
      : [el("p", { className: "hint", textContent: "No limits reported." })];
    const notes = [a.credits ? "usage credits on" : "", a.stale ? `as of ${a.stale} min ago` : ""].filter(Boolean);
    return el("section", { className: a.current ? "current" : "" }, [head, ...rows, ...(notes.length ? [el("small", { textContent: notes.join(" · ") })] : [])]);
  };
  async function look() {
    again.disabled = true;
    try {
      const { accounts } = await atlas.helper.call("usage", {}, { timeout: 30 });
      if (gone) return;
      const warn = Number(atlas.plugin.settings.warn ?? 80);
      const shown = [...accounts].sort((x, y) => Number(!!y.current) - Number(!!x.current));
      said.textContent = shown.length ? `A bar turns red at ${warn} % (the warning setting).` : "No Claude account found on this computer.";
      list.replaceChildren(...shown.map((a) => account(a, warn)));
    } catch (e) {
      if (!gone) { said.className = "err"; said.textContent = `Usage not read: ${e instanceof Error ? e.message : e}`; }
    } finally { again.disabled = false; }
  }
  again.addEventListener("click", () => { said.className = "hint"; void look(); });
  void look();
  return () => { gone = true; };
}
