// Export — "Export…" on a note (its menus in the file tree and the tab, the palette) opens the export dialog (view.js):
// the options beside a preview, PDF through Typst or LaTeX, LaTeX or Typst source, Word (helper/helper.ts).
const isNote = (p) => !!p && /\.md$/i.test(p);

export function register(atlas) {
  const open = (path) => {
    const opts = { title: `Export ${path.split("/").pop().replace(/\.md$/i, "")}`, icon: "file" };
    // a popup over the app (API 20); a tab in an older app
    if (atlas.openDialog) void atlas.openDialog(path, { ...opts, width: 1100, height: 760 });
    else atlas.openView(path, opts);
  };
  const rows = (path) => (isNote(path) ? [{ label: "Export…", icon: "file", run: () => open(path) }] : []);
  atlas.shell.menu("file", (t) => (t.dir ? [] : rows(t.path)));
  atlas.shell.menu("tab", (t) => rows(t.path));
  atlas.registerCommand({ id: "dialog", title: "Export the open note…", run: () => {
    const path = atlas.context().active?.path;
    if (!isNote(path)) return atlas.toast("Export", "Open a note first.");
    return open(path);
  } });
}
