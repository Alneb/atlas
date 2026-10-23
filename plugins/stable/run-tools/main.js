// Run tools — an example of `atlas.editor.toolbar` and `atlas.terminal.run` (docs/guides/PLUGIN-API.md).
// The buttons type a command into the shell terminal, so nothing is hidden: the command is there to
// read, its output scrolls by, and it can be changed and run again by hand.

const quote = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;          // one shell word
const dirOf = (path) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");
/** The folders from the file's own up to the vault's root. */
const upwards = (path) => { const out = []; for (let d = dirOf(path); ; d = dirOf(d)) { out.push(d); if (!d) return out; } };

export function register(atlas) {
  const settings = atlas.plugin.settings;
  // is there such a file? (a failed read is "no"; answers are kept: the bar asks at every redraw)
  const known = new Map();
  const exists = (path) => { if (!known.has(path)) known.set(path, atlas.readText(path).then(() => true, () => false)); return known.get(path); };
  atlas.onFilesChanged((paths) => { for (const p of paths) known.delete(p); });
  /** The nearest folder, from the file upwards, that holds `name`; null when none does. */
  const nearest = async (path, name) => { for (const d of upwards(path)) if (await exists(d ? `${d}/${name}` : name)) return d; return null; };

  /** The interpreter for a Python file: the setting, else the nearest .venv, else python3. */
  async function python(path) {
    if (String(settings.python ?? "").trim()) return String(settings.python).trim();
    const venv = await nearest(path, ".venv/pyvenv.cfg");
    return venv === null ? "python3" : quote(`${venv ? `${venv}/` : ""}.venv/bin/python`);
  }

  // the bar is drawn at once, so the tools are plain objects; what needs looking up is looked up on the click
  atlas.editor.toolbar((file) => {
    const p = file.path;
    if (p.endsWith(".py")) return [
      { label: "Run", title: "Run this file with Python (a .venv beside or above it is used)", run: async () => atlas.terminal.run(`${await python(p)} ${quote(p)}`) },
      { label: "Test", title: "pytest on this file", run: async () => atlas.terminal.run(`${await python(p)} -m pytest ${quote(p)}`) },
    ];
    if (p.endsWith(".rs")) {
      const cargo = async (what) => {
        const crate = await nearest(p, "Cargo.toml");
        if (crate === null) return atlas.toast("Run tools", "No Cargo.toml beside this file or above it.", "error");
        return atlas.terminal.run(`cargo ${what}${crate ? ` --manifest-path ${quote(`${crate}/Cargo.toml`)}` : ""}`);
      };
      return [
        { label: "Run", title: "cargo run", run: () => cargo("run") },
        { label: "Test", title: "cargo test", run: () => cargo("test") },
        { label: "Clippy", title: "cargo clippy", run: () => cargo("clippy") },
      ];
    }
    if (p.endsWith(".tex")) return [
      { label: "Build", title: "Build the PDF", run: () => atlas.terminal.run(`${settings.latex} -cd ${quote(p)}`) },
      { label: "PDF", title: "Open the PDF beside", run: () => atlas.open(p.replace(/\.tex$/, ".pdf"), undefined, { beside: true }) },
    ];
    return [];
  });
}
