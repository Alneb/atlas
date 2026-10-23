// Export — a note to LaTeX or PDF through the helper (helper.py: pandoc, then latexmk). From the palette, a note's
// right-click menu in the file tree and its tab's menu; each stage shows as it runs, the PDF opens when it is made.
const isNote = (p) => !!p && /\.md$/i.test(p);

export function register(atlas) {
  let busy = false;
  const exportTo = async (path, to) => {
    if (busy) return atlas.toast("Export", "An export is already running.");
    busy = true;
    const off = atlas.helper.on("progress", (d) => { if (d?.stage !== "done") atlas.toast("Export", d?.text ?? ""); });
    try {
      const r = await atlas.helper.call("export", { path, to, settings: atlas.plugin.settings }, { timeout: 600_000 });
      const made = r.written[r.written.length - 1];
      const cited = r.cited.length ? ` · ${r.cited.length} paper${r.cited.length > 1 ? "s" : ""} cited` : "";
      atlas.toast("Exported", `${made}${cited}`);
      for (const w of r.warnings) atlas.toast("Export: check this", w, "warn");
      atlas.open(made);
    } catch (e) {
      atlas.toast("Export failed", String(e?.message ?? e), "error");
    } finally {
      off();
      busy = false;
    }
  };
  const rows = (path) => (isNote(path) ? [
    { label: "Export to PDF", icon: "file", run: () => exportTo(path, "pdf") },
    { label: "Export to LaTeX", icon: "file", run: () => exportTo(path, "tex") },
  ] : []);
  atlas.shell.menu("file", (t) => (t.dir ? [] : rows(t.path)));
  atlas.shell.menu("tab", (t) => rows(t.path));
  const active = (to) => () => {
    const path = atlas.context().active?.path;
    if (!isNote(path)) return atlas.toast("Export", "Open a note first.");
    return exportTo(path, to);
  };
  atlas.registerCommand({ id: "pdf", title: "Export the open note to PDF", run: active("pdf") });
  atlas.registerCommand({ id: "tex", title: "Export the open note to LaTeX", run: active("tex") });
}
