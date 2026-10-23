// Print — `lp` for a file, typed into the terminal (docs/guides/PLUGIN-API.md: atlas.terminal.run), so its
// answer is there to read. A PDF, a picture or a text file prints as it is; a note prints as text.
const quote = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

export function register(atlas) {
  const print = (path) => {
    const s = atlas.plugin.settings;
    const printer = String(s.printer ?? "").trim(), opts = String(s.options ?? "").trim();
    return atlas.terminal.run(`lp${printer ? ` -d ${quote(printer)}` : ""}${opts ? ` ${opts}` : ""} ${quote(path)}`);
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
