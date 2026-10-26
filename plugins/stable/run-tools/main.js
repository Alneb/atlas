// Run tools — an example of `atlas.editor.toolbar` and `atlas.terminal.run` (docs/guides/PLUGIN-API.md).
// The buttons type a command into the shell terminal, so nothing is hidden: the command is there to
// read, its output scrolls by, and it can be changed and run again by hand.

const quote = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;          // one shell word
const dirOf = (path) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");
/** The folders from the file's own up to the vault's root. */
const upwards = (path) => { const out = []; for (let d = dirOf(path); ; d = dirOf(d)) { out.push(d); if (!d) return out; } };

/** The tests a file names, as the runner's selectors: pytest's `test_x` / `TestX::test_y`, Rust's `#[test] fn x`. */
export function testsIn(path, text) {
  const out = [];
  if (path.endsWith(".py")) {
    let cls = null;
    for (const line of text.split("\n")) {
      const c = /^class (Test\w*)/.exec(line);
      if (c) { cls = c[1]; continue; }
      if (/^\S/.test(line)) cls = null; // anything else at the top ends the class
      const f = /^(\s*)(?:async\s+)?def (test\w*)/.exec(line);
      if (f && (!f[1] || cls)) out.push(f[1] && cls ? `${cls}::${f[2]}` : f[2]);
    }
  } else if (path.endsWith(".rs")) {
    const re = /#\[(?:tokio::)?test\][\s\S]*?fn\s+(\w+)/g;
    for (let m; (m = re.exec(text)); ) out.push(m[1]);
  }
  return out;
}

export function register(atlas) {
  const settings = atlas.plugin.settings;
  // is there such a file? (a failed read is "no"; answers are kept: the bar asks at every redraw)
  const known = new Map();
  const exists = (path) => { if (!known.has(path)) known.set(path, atlas.readText(path).then(() => true, () => false)); return known.get(path); };
  atlas.onFilesChanged((paths) => { for (const p of paths) known.delete(p); });
  /** The nearest folder, from the file upwards, that holds `name`; null when none does. */
  const nearest = async (path, name) => { for (const d of upwards(path)) if (await exists(d ? `${d}/${name}` : name)) return d; return null; };

  /** Test: the file's tests in the chooser ("All" first); with none named, all at once. */
  async function test(path, run) {
    const names = testsIn(path, await atlas.readText(path).catch(() => ""));
    if (!names.length) return run("");
    atlas.pick({
      placeholder: "Which test…", tag: "Test",
      items: [{ value: "", title: "All tests in this file" }, ...names.map((n) => ({ value: n, title: n }))],
      onpick: (v) => run(v),
    });
  }

  /** The interpreter for a Python file: the setting, else the vault's environment (Python: choose the environment —
   *  the one its Python server and terminals use), else the nearest .venv, else python3. */
  async function python(path) {
    if (String(settings.python ?? "").trim()) return String(settings.python).trim();
    const envs = await fetch("/api/python-envs", { headers: { "x-atlas": "1" } }).then((r) => (r.ok ? r.json() : null), () => null);
    const chosen = envs?.found?.find((e) => e.path === envs.chosen);
    if (chosen) return quote(chosen.python);
    const venv = await nearest(path, ".venv/pyvenv.cfg");
    return venv === null ? "python3" : quote(`${venv ? `${venv}/` : ""}.venv/bin/python`);
  }

  // the bar is drawn at once, so the tools are plain objects; what needs looking up is looked up on the click
  atlas.editor.toolbar((file) => {
    const p = file.path;
    if (p.endsWith(".py")) return [
      { label: "Run", title: "Run this file with Python (a .venv beside or above it is used)", run: async () => atlas.terminal.run(`${await python(p)} ${quote(p)}`) },
      { label: "Test", title: "pytest: all of this file's tests, or one", run: () => test(p, async (one) => atlas.terminal.run(`${await python(p)} -m pytest ${quote(one ? `${p}::${one}` : p)}`)) },
    ];
    if (p.endsWith(".rs")) {
      const cargo = async (what) => {
        const crate = await nearest(p, "Cargo.toml");
        if (crate === null) return atlas.toast("Run tools", "No Cargo.toml beside this file or above it.", "error");
        return atlas.terminal.run(`cargo ${what}${crate ? ` --manifest-path ${quote(`${crate}/Cargo.toml`)}` : ""}`);
      };
      return [
        { label: "Run", title: "cargo run", run: () => cargo("run") },
        { label: "Test", title: "cargo test: all, or one of this file's tests", run: () => test(p, (one) => cargo(one ? `test ${quote(one)}` : "test")) },
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
