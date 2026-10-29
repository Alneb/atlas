// The print dialog: the document as it will print (a note as the PDF the Export plugin makes of it) beside the options —
// printer, copies, pages, sides, paper, orientation, fit — prefilled from the plugin's settings; "Print" sends it to
// CUPS (helper/helper.ts). The preview is the app's own PDF view (an embed in a text block).
export default function mount(host, atlas) {
  const path = String(atlas.arg ?? "");
  const s = atlas.plugin.settings ?? {};
  const el = (tag, props = {}, kids = []) => {
    const e = Object.assign(document.createElement(tag), props);
    e.append(...kids);
    return e;
  };
  // the control named by its label alone (a wrapping label would add a select's option text to its name)
  const field = (label, input) => { input.setAttribute("aria-label", label); return el("label", { className: "pr-field" }, [el("span", { textContent: label }), input]); };
  const select = (choices, value) => {
    const x = el("select");
    for (const [v, l] of choices) x.append(el("option", { value: v, textContent: l, selected: v === value }));
    return x;
  };

  host.classList.add("pr");
  const style = el("style", { textContent: `
    .pr { display: flex; height: 100%; min-height: 0; background: var(--bg); color: var(--text); }
    .pr-preview { flex: 1; min-width: 0; overflow: auto; padding: 16px; border-right: 1px solid var(--border); background: var(--bg-alt, var(--bg)); }
    .pr-side { width: 300px; max-width: 45%; overflow: auto; padding: 16px; display: flex; flex-direction: column; gap: 10px; }
    .pr-side h2 { margin: 0 0 4px; font-size: 1.05em; overflow-wrap: anywhere; }
    .pr-field { display: flex; flex-direction: column; gap: 3px; font-size: .9em; color: var(--text-muted); }
    .pr-field input:not([type=checkbox]), .pr-field select { font: inherit; color: var(--text); background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: 5px 7px; }
    .pr-check { flex-direction: row; align-items: center; gap: 8px; }
    .pr-status { font-size: .9em; color: var(--text-muted); min-height: 1.3em; }
    .pr-status.err { color: var(--danger, #c33); }
    .pr-go { display: flex; gap: 8px; margin-top: 6px; }
    .pr-go button { padding: 6px 14px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg); color: var(--text); cursor: pointer; }
    .pr-go button.primary { background: var(--accent); border-color: var(--accent); color: var(--accent-text, #fff); }
    .pr-go button:disabled { opacity: .5; cursor: default; }
    @media (max-width: 700px) { .pr { flex-direction: column; } .pr-preview { border-right: 0; border-bottom: 1px solid var(--border); } .pr-side { width: auto; max-width: none; } }
  ` });
  const preview = el("div", { className: "pr-preview" }, [el("p", { className: "pr-status", textContent: "Making the document to print…" })]);
  // the chosen printer stays chosen even when CUPS does not list it: lp then says so, rather than the default printing
  const printer = select([["", "The default printer"], ...(s.printer ? [[String(s.printer), String(s.printer)]] : [])], String(s.printer ?? ""));
  const copies = el("input", { type: "number", min: 1, value: String(Number(s.copies) || 1) });
  const pages = el("input", { placeholder: "all — or 1-3, 5" });
  const sides = select(["one-sided", "two-sided (long edge)", "two-sided (short edge)"].map((v) => [v, v]), String(s.sides || "one-sided"));
  const media = select([["", "The printer's own"], ["A4", "A4"], ["Letter", "Letter"], ["A3", "A3"], ["Legal", "Legal"]], String(s.media ?? ""));
  const landscape = el("input", { type: "checkbox" });
  const fit = el("input", { type: "checkbox", checked: true });
  const status = el("p", { className: "pr-status" });
  const go = el("button", { className: "primary", textContent: "Print", disabled: true });
  const cancel = el("button", { textContent: "Close" });
  const side = el("div", { className: "pr-side" }, [
    el("h2", { textContent: `Print ${path.split("/").pop()}` }),
    field("Printer", printer), field("Copies", copies), field("Pages", pages), field("Sides", sides), field("Paper", media),
    el("label", { className: "pr-field pr-check" }, [landscape, el("span", { textContent: "Landscape" })]),
    el("label", { className: "pr-field pr-check" }, [fit, el("span", { textContent: "Fit to the page" })]),
    status, el("div", { className: "pr-go" }, [go, cancel]),
  ]);
  host.append(style, preview, side);

  let pdf = null;
  let unmount = () => {};
  const say = (text, err = false) => { status.textContent = text; status.classList.toggle("err", err); };
  atlas.helper.call("printers", {}, { timeout: 30 }).then((list) => {
    for (const p of list) if (![...printer.options].some((o) => o.value === p.value)) printer.append(el("option", { value: p.value, textContent: p.label }));
    printer.value = String(s.printer ?? "");
  }, (e) => say(String(e?.message ?? e), true));
  atlas.helper.call("prepare", { path }, { timeout: 600 }).then((r) => {
    pdf = r.pdf;
    preview.replaceChildren();
    unmount = atlas.mountBlock(preview, { type: "text", text: `![[${pdf}]]` }, path);
    go.disabled = false;
  }, (e) => {
    preview.replaceChildren(el("p", { className: "pr-status err", textContent: String(e?.message ?? e) }));
  });

  go.onclick = async () => {
    go.disabled = true;
    say(`Sending to ${printer.value || "the default printer"}…`);
    const settings = { ...s, printer: printer.value, copies: Number(copies.value) || 1, sides: sides.value, media: media.value, pages: pages.value.trim(), landscape: landscape.checked, fit: fit.checked };
    try {
      const r = await atlas.helper.call("print", { path: pdf, settings }, { timeout: 600 });
      say(`Printing on ${r.printer}${r.job ? ` (job ${r.job})` : ""}.`);
      atlas.toast("Printing", `${path.split("/").pop()} on ${r.printer}`);
    } catch (e) {
      say(String(e?.message ?? e), true);
    } finally {
      go.disabled = false;
    }
  };
  cancel.onclick = () => atlas.pane?.close();
  return () => { unmount(); host.replaceChildren(); host.classList.remove("pr"); };
}
