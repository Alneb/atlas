// Print — CUPS through the helper (helper/helper.ts: `lp`, run by the core): a note prints as the document the Export plugin makes of it,
// any other file as it is; the job id or the reason it failed comes back as a notice.
export function register(atlas) {
  const print = async (path) => {
    const note = /\.md$/i.test(path);
    atlas.toast("Print", note ? `Making the PDF of ${path.split("/").pop()} to print…` : `Sending ${path.split("/").pop()}…`);
    try {
      const r = await atlas.helper.call("print", { path, settings: atlas.plugin.settings }, { timeout: 600_000 });
      atlas.toast("Printing", `${r.printed.split("/").pop()} on ${r.printer}${r.job ? ` (job ${r.job})` : ""}`);
    } catch (e) {
      atlas.toast("Not printed", String(e?.message ?? e), "error");
    }
  };
  const printable = (p) => !!p && !p.endsWith("/");
  atlas.shell.menu("file", (t) => (t.path && !t.dir ? [{ label: "Print", icon: "file", run: () => print(t.path) }] : []));
  atlas.shell.menu("tab", (t) => (printable(t.path) ? [{ label: "Print", icon: "file", run: () => print(t.path) }] : []));
  atlas.registerCommand({ id: "this", title: "Print the open file", run: () => {
    const path = atlas.context().active?.path;
    if (!printable(path)) return atlas.toast("Print", "Open a file first.");
    return print(path);
  } });
}
