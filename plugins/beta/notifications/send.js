// "Send to my phone" in a dialog (atlas.openDialog with view "send.js", the active note's name as `atlas.arg`): a title
// (that name, or "Atlas"), the text in a box of its own lines, then whether it went and through what.
import { sendToPhone } from "./main.js";

export default function mount(host, atlas) {
  const el = (tag, props = {}, kids = []) => {
    const e = Object.assign(document.createElement(tag), props);
    e.append(...kids);
    return e;
  };
  host.classList.add("ntp");
  const style = el("style", { textContent: `
    .ntp { display: flex; flex-direction: column; gap: 8px; height: 100%; min-height: 0; padding: 16px; box-sizing: border-box; background: var(--bg); color: var(--text); }
    .ntp label { display: flex; flex-direction: column; gap: 3px; font-size: .9em; color: var(--text-muted); }
    .ntp input, .ntp textarea { font: inherit; color: var(--text); background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: 5px 7px; }
    .ntp label:has(textarea) { flex: 1; min-height: 0; }
    .ntp textarea { flex: 1; min-height: 4em; resize: none; }
    .ntp p { margin: 0; min-height: 1.3em; }
    .ntp .ok { color: var(--success, #2a7); }
    .ntp .err { color: var(--danger, #c33); overflow-wrap: anywhere; }
    .ntp-go { display: flex; justify-content: flex-end; gap: 8px; }
    .ntp-go button { padding: 6px 14px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg); color: var(--text); cursor: pointer; }
    .ntp-go button.primary { background: var(--accent); border-color: var(--accent); color: var(--accent-text, #fff); }
    .ntp-go button:disabled { opacity: .5; cursor: default; }
  ` });
  const title = el("input", { value: String(atlas.arg || "Atlas") });
  const text = el("textarea", { placeholder: "What to send…" });
  const said = el("p", { ariaLive: "polite" });
  const send = el("button", { className: "primary", textContent: "Send", disabled: true });
  const close = el("button", { textContent: "Close" });
  host.append(style, el("label", {}, ["Title", title]), el("label", {}, ["Text", text]), said, el("div", { className: "ntp-go" }, [close, send]));
  text.addEventListener("input", () => { send.disabled = !text.value.trim(); });
  close.addEventListener("click", () => atlas.pane.close());
  let gone = false;
  async function go() {
    if (!text.value.trim()) return;
    send.disabled = true;
    said.className = "";
    said.textContent = "Sending…";
    try {
      const through = await sendToPhone(atlas, text.value.trim(), title.value.trim());
      if (gone) return;
      said.className = "ok";
      said.textContent = `Sent, through ${through}.`;
      text.value = "";
      close.textContent = "Done";
      close.focus();
    } catch (e) {
      if (gone) return;
      said.className = "err";
      said.textContent = `Not sent: ${String(e instanceof Error ? e.message : e).replace(/^\w+Error: /, "")}`;
      send.disabled = false;
    }
  }
  send.addEventListener("click", () => void go());
  // Ctrl+Enter sends from the box; a plain Enter is a new line
  text.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void go(); } });
  setTimeout(() => text.focus());
  return () => { gone = true; };
}
