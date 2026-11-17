// The import dialog (atlas.openDialog with view "import.js"): the user's Letterboxd export chosen from the ones in the
// vault or typed as a path, then read (helper `import_export`) and a first sync started, each step and its result
// said in the dialog rather than in toasts.
export default function mount(host, atlas) {
  const el = (tag, props = {}, kids = []) => {
    const e = Object.assign(document.createElement(tag), props);
    e.append(...kids);
    return e;
  };
  host.classList.add("lbx");
  const style = el("style", { textContent: `
    .lbx { display: flex; flex-direction: column; gap: 10px; height: 100%; min-height: 0; overflow: auto; padding: 16px; background: var(--bg); color: var(--text); box-sizing: border-box; }
    .lbx p { margin: 0; }
    .lbx-hint { font-size: .9em; color: var(--text-muted); }
    .lbx-list { display: flex; flex-direction: column; gap: 4px; }
    .lbx-list label { display: flex; align-items: center; gap: 8px; padding: 5px 7px; border: 1px solid var(--border); border-radius: 6px; cursor: pointer; overflow-wrap: anywhere; }
    .lbx-list label:has(input:checked) { border-color: var(--accent); }
    .lbx input[type=text] { font: inherit; color: var(--text); background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: 5px 7px; }
    .lbx-steps { display: flex; flex-direction: column; gap: 4px; margin: 0; padding: 0; list-style: none; font-size: .9em; }
    .lbx-steps li.err { color: var(--danger, #c33); }
    .lbx-go { display: flex; gap: 8px; margin-top: auto; }
    .lbx-go button { padding: 6px 14px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg); color: var(--text); cursor: pointer; }
    .lbx-go button.primary { background: var(--accent); border-color: var(--accent); color: var(--accent-text, #fff); }
    .lbx-go button:disabled { opacity: .5; cursor: default; }
  ` });
  const list = el("div", { className: "lbx-list", role: "radiogroup", ariaLabel: "Exports in the vault" });
  const typed = el("input", { type: "text", placeholder: "or its path in the vault (a .zip or the folder)" });
  typed.setAttribute("aria-label", "Export path");
  const steps = el("ol", { className: "lbx-steps" });
  const go = el("button", { className: "primary", textContent: "Import", disabled: true });
  const close = el("button", { textContent: "Close" });
  host.append(style,
    el("p", { className: "lbx-hint", textContent: "Your export from letterboxd.com → Settings → Data → Export, put anywhere in the vault." }),
    list, typed, steps, el("div", { className: "lbx-go" }, [go, close]));

  let gone = false;
  const step = (text, err = false) => { if (!gone) steps.append(el("li", { textContent: text, className: err ? "err" : "" })); };
  const chosen = () => typed.value.trim() || list.querySelector("input:checked")?.value || "";
  const ready = () => { go.disabled = !chosen(); };
  typed.addEventListener("input", ready);
  typed.addEventListener("keydown", (e) => { if (e.key === "Enter" && !go.disabled) go.click(); });
  close.addEventListener("click", () => atlas.pane.close());

  atlas.helper.call("exports", {}, { timeout: 60 }).then(({ exports }) => {
    if (gone) return;
    if (!exports.length) list.append(el("p", { className: "lbx-hint", textContent: "No export found in the vault." }));
    exports.forEach((p, i) => {
      const radio = el("input", { type: "radio", name: "lbx-export", value: p, checked: i === 0 });
      radio.addEventListener("change", ready);
      list.append(el("label", {}, [radio, el("span", { textContent: p })]));
    });
    ready();
    (exports.length ? list.querySelector("input") : typed).focus();
  }, (e) => step(e instanceof Error ? e.message : String(e), true));

  go.addEventListener("click", async () => {
    const path = chosen();
    go.disabled = true;
    steps.replaceChildren();
    try {
      step(`Reading ${path}…`);
      step((await atlas.helper.call("import_export", { path }, { timeout: 60 })).summary);
      step("Filing the first films…");
      step((await atlas.helper.call("sync", { settings: atlas.plugin.settings }, { timeout: 300 })).summary);
      close.focus();
    } catch (e) {
      step(e instanceof Error ? e.message : String(e), true);
      go.disabled = false;
    }
  });
  return () => { gone = true; };
}
