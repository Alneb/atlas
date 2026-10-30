// The export dialog (docs/design/DESIGN-export.md §1): the options beside a preview of the document. PDF (Typst)
// previews as the options change; the LaTeX road on "Preview" (it takes seconds). "Export" writes into the exports
// folder and remembers the choices as the plugin's settings. Opened by main.js with the note's path as `atlas.arg`.
export default function mount(host, atlas) {
  const path = String(atlas.arg ?? "");
  const s = atlas.plugin.settings ?? {};
  const name = path.split("/").pop().replace(/\.md$/i, "");
  const el = (tag, props = {}, kids = []) => {
    const e = Object.assign(document.createElement(tag), props);
    e.append(...kids);
    return e;
  };
  const field = (label, input, hint) => el("label", { className: "ex-field" }, [el("span", { textContent: label }), input, ...(hint ? [el("small", { textContent: hint })] : [])]);
  const check = (label, input) => el("label", { className: "ex-check" }, [input, el("span", { textContent: label })]);
  const select = (choices, value) => {
    const x = el("select");
    for (const [v, l] of choices) x.append(el("option", { value: v, textContent: l }));
    x.value = value;
    return x;
  };
  const text = (value, placeholder = "") => el("input", { value: value ?? "", placeholder });
  const group = (title, kids, className = "") => el("fieldset", { className: `ex-group ${className}` }, [el("legend", { textContent: title }), ...kids]);

  host.classList.add("ex");
  const style = el("style", { textContent: `
    .ex { display: flex; height: 100%; min-height: 0; background: var(--bg); color: var(--text); }
    .ex-side { width: 330px; max-width: 48%; display: flex; flex-direction: column; border-right: 1px solid var(--border); }
    .ex-form { flex: 1; overflow: auto; padding: 14px 16px; display: flex; flex-direction: column; gap: 12px; }
    .ex-group { border: 0; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
    .ex-group legend { padding: 0; margin-bottom: 6px; font-size: .78em; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--text-faint, var(--text-muted)); }
    .ex-group[hidden] { display: none; }
    .ex-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .ex-field { display: flex; flex-direction: column; gap: 3px; font-size: .88em; color: var(--text-muted); min-width: 0; }
    .ex-field small { color: var(--text-faint, var(--text-muted)); font-size: .9em; }
    .ex-field input, .ex-field select { font: inherit; color: var(--text); background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: 5px 7px; min-width: 0; }
    .ex-check { display: flex; align-items: center; gap: 8px; font-size: .88em; }
    .ex-formats { display: flex; flex-direction: column; gap: 4px; }
    .ex-format { display: flex; align-items: baseline; gap: 8px; padding: 6px 8px; border: 1px solid var(--border); border-radius: 6px; cursor: pointer; font-size: .92em; }
    .ex-format:has(input:checked) { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, transparent); }
    .ex-format.off { opacity: .55; cursor: default; }
    .ex-format small { margin-left: auto; color: var(--text-faint, var(--text-muted)); font-size: .85em; }
    .ex-foot { border-top: 1px solid var(--border); padding: 10px 16px; display: flex; flex-direction: column; gap: 8px; }
    .ex-status { font-size: .86em; color: var(--text-muted); min-height: 1.2em; white-space: pre-wrap; max-height: 9em; overflow: auto; margin: 0; }
    .ex-status.err { color: var(--danger, var(--red, #c33)); }
    .ex-warn { font-size: .84em; color: var(--yellow, #b8860b); margin: 0; padding-left: 1.1em; }
    .ex-go { display: flex; gap: 8px; justify-content: flex-end; }
    .ex-go button { padding: 6px 14px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg); color: var(--text); cursor: pointer; font: inherit; }
    .ex-go button.primary { background: var(--accent); border-color: var(--accent); color: var(--accent-text, #fff); }
    .ex-go button:disabled { opacity: .5; cursor: default; }
    .ex-preview { flex: 1; min-width: 0; overflow: auto; padding: 16px; background: var(--bg-alt, var(--bg)); position: relative; }
    .ex-preview-label { font-size: .8em; color: var(--text-muted); margin: 0 0 8px; }
    .ex-preview.busy::after { content: ""; position: absolute; inset: 0; background: color-mix(in srgb, var(--bg) 35%, transparent); pointer-events: none; }
    .ex-empty { color: var(--text-muted); font-size: .92em; margin-top: 30%; text-align: center; }
    @media (max-width: 760px) { .ex { flex-direction: column; } .ex-side { width: auto; max-width: none; border-right: 0; border-bottom: 1px solid var(--border); max-height: 60%; } }
  ` });

  // the options; per-note ones (title…) start from the note, the rest from the settings
  const formatList = el("div", { className: "ex-formats" });
  let format = String(s.format || "pdf-typst");
  const title = text("", name), subtitle = text(""), author = text(""), date = text("");
  const toc = el("input", { type: "checkbox", checked: !!s.toc });
  const numbered = el("input", { type: "checkbox", checked: !!s.numbered });
  const paper = select([["a4", "A4"], ["letter", "US Letter"]], String(s.paper || "a4"));
  const fontsize = select([["10pt", "10 pt"], ["11pt", "11 pt"], ["12pt", "12 pt"]], String(s.fontsize || "11pt"));
  const margins = select([["narrow", "Narrow"], ["normal", "Normal"], ["wide", "Wide"]], String(s.margins || "normal"));
  const columns = select([["1", "One"], ["2", "Two"]], String(s.columns || 1));
  const lang = text(s.lang || "en", "en, fr, es…");
  const font = text(s.font || "", "the format's own");
  const bibliography = text(s.bibliography || "", "refs/refs.bib, else the vault's .bib");
  const styleSel = select([["numeric", "Numeric [1]"], ["author-year", "Author–year"], ["alphabetic", "Alphabetic [Hub63]"], ["physics", "Physics (APS)"]], String(s.style || "numeric"));
  const engine = select([["lualatex", "LuaLaTeX"], ["xelatex", "XeLaTeX"], ["pdflatex", "pdfLaTeX"]], String(s.engine || "lualatex"));
  const preamble = text(s.preamble || "", "templates/preamble.tex");
  const typstPreamble = text(s.typstPreamble || "", "templates/style.typ");
  const folder = text(s.folder || "exports");
  const openAfter = el("input", { type: "checkbox", checked: s.openAfter !== false });

  const refs = group("References", [field("Bibliography", bibliography), field("Citation style", styleSel)]);
  refs.hidden = true;
  const latex = group("LaTeX", [field("Engine", engine), field("Extra preamble", preamble, "a .tex of the vault, \\input before the document")]);
  const typst = group("Typst", [field("Preamble", typstPreamble, "a .typ of the vault, put before the document (set and show rules)")]);
  const form = el("div", { className: "ex-form" }, [
    group("Format", [formatList]),
    group("Document", [field("Title", title), field("Subtitle", subtitle), el("div", { className: "ex-row" }, [field("Author", author), field("Date", date)]),
      check("Table of contents", toc), check("Numbered sections", numbered)]),
    group("Page", [el("div", { className: "ex-row" }, [field("Paper", paper), field("Font size", fontsize)]),
      el("div", { className: "ex-row" }, [field("Margins", margins), field("Columns", columns)]),
      el("div", { className: "ex-row" }, [field("Language", lang), field("Font", font)])]),
    refs, latex, typst,
    group("Where", [field("Exports folder", folder, `${folder.value || "exports"}/${path.replace(/[^/]*$/, "")}${name}.…`), check("Open it when done", openAfter)]),
  ]);
  const status = el("p", { className: "ex-status" });
  const warns = el("ul", { className: "ex-warn" });
  const previewBtn = el("button", { textContent: "Preview" });
  const go = el("button", { className: "primary", textContent: "Export" });
  const close = el("button", { textContent: "Close" });
  // shown while an export runs: stops the helper, which ends the program it is waiting on (pandoc, latexmk)
  const stop = el("button", { textContent: "Stop", hidden: true, title: "Stop this export (the next one starts afresh)" });
  const side = el("div", { className: "ex-side" }, [form, el("div", { className: "ex-foot" }, [status, warns, el("div", { className: "ex-go" }, [close, stop, previewBtn, go])])]);
  const label = el("p", { className: "ex-preview-label" });
  const shown = el("div");
  const preview = el("div", { className: "ex-preview" }, [label, shown]);
  host.append(style, side, preview);
  shown.append(el("p", { className: "ex-empty", textContent: "Reading the note…" }));

  const say = (t, err = false) => { status.textContent = t; status.classList.toggle("err", err); };
  const warn = (list) => warns.replaceChildren(...list.map((w) => el("li", { textContent: w })));
  const options = () => ({
    title: title.value || title.placeholder, subtitle: subtitle.value, author: author.value, date: date.value,
    toc: toc.checked, numbered: numbered.checked, paper: paper.value, fontsize: fontsize.value, margins: margins.value,
    columns: Number(columns.value), lang: lang.value.trim(), font: font.value.trim(), bibliography: bibliography.value.trim(),
    style: styleSel.value, engine: engine.value, preamble: preamble.value.trim(), typstPreamble: typstPreamble.value.trim(),
    folder: folder.value.trim() || "exports", openAfter: openAfter.checked,
  });
  // what the preview is made with: the format's own PDF, else the PDF road that matches it
  let roads = {};
  const previewFormat = () => (format === "pdf-latex" || (format === "tex" && roads["pdf-latex"]) ? "pdf-latex" : "pdf-typst");
  const live = () => previewFormat() === "pdf-typst";

  let unmount = () => {};
  let generation = 0, stopped = false;
  // the note's ```tikz pictures (describe): the Typst and Word roads get them as PNGs the page's TeX draws, once each
  let tikz = [];
  const drawn = new Map(); // key → width in points
  async function figures(f) {
    if (f === "pdf-latex" || f === "tex" || !tikz.length || !atlas.tikz) return {};
    for (const t of tikz) {
      if (drawn.has(t.key)) continue;
      say("Drawing the TikZ pictures…");
      // a picture TeX cannot draw stays code, and the helper says so
      try { const { png, width } = await atlas.tikz.png(t.source); await atlas.writeBytes(t.png, png); drawn.set(t.key, width); } catch { /* left as code */ }
    }
    return Object.fromEntries(drawn);
  }
  const offProgress = atlas.helper.on("progress", (d) => { if (d?.stage !== "done" && d?.text) say(`${d.text}…`); });
  async function make(previewOnly) {
    const mine = ++generation;
    const f = previewOnly ? previewFormat() : format;
    if (!roads[f]) { say(`${f}: not available here`, true); return; }
    preview.classList.add("busy");
    previewBtn.disabled = true;
    if (!previewOnly) { go.disabled = true; stop.hidden = false; }
    try {
      const r = await atlas.helper.call("export", { path, format: f, options: options(), settings: s, preview: previewOnly, figures: await figures(f) }, { timeout: 600 });
      if (mine !== generation) return;
      warn(r.warnings);
      if (r.pdf && (previewOnly || f.startsWith("pdf"))) {
        unmount();
        shown.replaceChildren();
        unmount = atlas.mountBlock(shown, { type: "text", text: `![[${r.pdf}]]` }, path);
        label.textContent = previewOnly ? (f === format ? "Preview" : `Preview (as ${f === "pdf-latex" ? "PDF through LaTeX" : "PDF through Typst"})`) : r.pdf;
      }
      if (previewOnly) say("");
      else {
        const made = r.written[r.written.length - 1];
        say(`Exported: ${made}${r.cited.length ? ` · ${r.cited.length} paper${r.cited.length > 1 ? "s" : ""} cited` : ""}`);
        const { title: _t, subtitle: _s, author: _a, date: _d, ...keep } = options();
        await atlas.plugin.saveSettings({ ...s, ...keep, format }).catch(() => {});
        if (openAfter.checked) atlas.open(made);
      }
    } catch (e) {
      if (mine === generation) say(stopped ? "Stopped" : String(e?.message ?? e), !stopped);
    } finally {
      if (mine === generation) { preview.classList.remove("busy"); go.disabled = !roads[format]; previewBtn.disabled = false; stop.hidden = true; stopped = false; }
    }
  }
  let timer;
  const changed = () => {
    latex.hidden = !(format === "pdf-latex" || format === "tex");
    typst.hidden = !(format === "pdf-typst" || format === "typ");
    previewBtn.hidden = live();
    if (!live()) { label.textContent = "Preview — press Preview to make it (LaTeX takes a few seconds)"; return; }
    clearTimeout(timer);
    timer = setTimeout(() => void make(true), 450);
  };
  form.addEventListener("input", changed);
  form.addEventListener("change", changed);

  previewBtn.onclick = () => void make(true);
  go.onclick = () => void make(false);
  stop.onclick = () => { stopped = true; say("Stopping…"); void atlas.helper.restart(); };
  close.onclick = () => atlas.pane?.close();
  host.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); go.click(); } });

  Promise.all([atlas.helper.call("formats", {}, { timeout: 30 }), atlas.helper.call("describe", { path, settings: s }, { timeout: 60 })]).then(([list, d]) => {
    roads = Object.fromEntries(list.map((x) => [x.id, x.ok]));
    if (!roads[format]) format = list.find((x) => x.ok)?.id ?? format;
    for (const x of list) {
      const radio = el("input", { type: "radio", name: "ex-format", value: x.id, checked: x.id === format, disabled: !x.ok });
      radio.onchange = () => { format = x.id; go.disabled = !roads[format]; };
      formatList.append(el("label", { className: `ex-format${x.ok ? "" : " off"}` }, [radio, el("span", { textContent: x.label }), ...(x.needs ? [el("small", { textContent: `needs ${x.needs}` })] : [])]));
    }
    title.value = d.meta.title ?? ""; subtitle.value = d.meta.subtitle ?? ""; author.value = d.meta.author ?? ""; date.value = d.meta.date ?? "";
    tikz = d.tikz ?? [];
    refs.hidden = !d.cited.length;
    if (d.cited.length && !bibliography.value) bibliography.placeholder = d.bib ?? "no .bib found";
    warn(d.warnings);
    shown.replaceChildren(el("p", { className: "ex-empty", textContent: "The preview appears here." }));
    if (!list.some((x) => x.ok)) say("Nothing can export here: pandoc is not installed on the machine running Atlas.", true);
    changed();
  }, (e) => say(String(e?.message ?? e), true));

  // closed while exporting: the export is stopped, not left building a file nobody waits for
  return () => { if (!stop.hidden) void atlas.helper.restart(); clearTimeout(timer); offProgress?.(); unmount(); host.replaceChildren(); host.classList.remove("ex"); };
}
