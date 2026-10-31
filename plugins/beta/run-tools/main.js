// Run tools: buttons in the bar above a code file that run it, test it or build it in the shell terminal, so nothing is
// hidden — the command is there to read, its output scrolls by, ↑ runs it again (docs/guides/PLUGIN-API.md,
// `atlas.editor.toolbar`, `atlas.terminal`). What a file gets is found from the file and the project around it (the
// nearest Cargo.toml, package.json, go.mod, Makefile, justfile, .venv…), and each command is written for the shell the
// terminal runs (POSIX, PowerShell or cmd), so the same buttons work on Linux, macOS and Windows.

// --- the shell's words: pure, exported for the tests; the app's `atlas.terminal.quote` / `line` (API 23) are the same
// rule (a spec checks they agree), these kept for an older app ---

/** One argument, as `shell` reads it back unchanged. */
export function quote(s, shell = "posix") {
  s = String(s);
  if (/^[\w./:=@%+,-]+$/.test(s)) return s; // nothing to protect: kept readable
  if (shell === "powershell") return `'${s.replace(/'/g, "''")}'`;
  if (shell === "cmd") return `"${s.replace(/"/g, '""')}"`;
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/** A program and its arguments as one command line; PowerShell runs a quoted program only after `&`. */
export function line(shell, program, ...args) {
  const p = quote(program, shell);
  return [shell === "powershell" && p !== program ? `& ${p}` : p, ...args.filter((a) => a !== undefined).map((a) => quote(a, shell))].join(" ");
}

/** A path under a folder with the separators the shell's system uses. */
export const under = (shell, ...parts) => parts.filter(Boolean).join(shell === "posix" ? "/" : "\\");

/** A virtual environment's interpreter: bin/python on Unix, Scripts\python.exe on Windows. */
export const venvPython = (shell, venv) => (shell === "posix" ? under(shell, venv, "bin", "python") : under(shell, venv, "Scripts", "python.exe"));

const dirOf = (path) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");
const baseOf = (path) => path.slice(path.lastIndexOf("/") + 1);
/** The folders from the file's own up to the vault's root. */
export const upwards = (path) => { const out = []; for (let d = dirOf(path); ; d = dirOf(d)) { out.push(d); if (!d) return out; } };

// --- what a project offers, read from its files: pure, exported for the tests ---

/** The tests a file names, as the runner's selectors: pytest's `test_x` / `TestX::test_y`, Rust's `#[test] fn x`,
 *  Go's `func TestX(t *testing.T)`, node:test / Jest / Vitest's `test("name"` / `it("name"`. */
export function testsIn(path, text) {
  const out = [];
  if (path.endsWith(".py")) {
    let cls = null;
    for (const l of text.split("\n")) {
      const c = /^class (Test\w*)/.exec(l);
      if (c) { cls = c[1]; continue; }
      if (/^\S/.test(l)) cls = null; // anything else at the top ends the class
      const f = /^(\s*)(?:async\s+)?def (test\w*)/.exec(l);
      if (f && (!f[1] || cls)) out.push(f[1] && cls ? `${cls}::${f[2]}` : f[2]);
    }
  } else if (path.endsWith(".rs")) {
    for (const m of text.matchAll(/#\[(?:tokio::)?test\][\s\S]*?fn\s+(\w+)/g)) out.push(m[1]);
  } else if (path.endsWith(".go")) {
    for (const m of text.matchAll(/^func (Test\w*)\s*\(\s*\w+\s+\*testing\.T\)/gm)) out.push(m[1]);
  } else if (/\.[cm]?[jt]sx?$/.test(path)) {
    for (const m of text.matchAll(/^\s*(?:test|it)\s*\(\s*(["'`])((?:(?!\1).)+)\1/gm)) out.push(m[2]);
  }
  return out;
}

/** package.json's scripts, by name. */
export const npmScripts = (text) => { try { return Object.keys(JSON.parse(text).scripts ?? {}); } catch { return []; } };

/** A Makefile's own targets (not the special ones, not patterns or variables). */
export const makeTargets = (text) =>
  [...new Set([...text.matchAll(/^([A-Za-z0-9][\w.-]*)\s*:(?!=)/gm)].map((m) => m[1]).filter((t) => !t.startsWith(".")))];

/** A justfile's recipes (a name at the line's start, its arguments, then `:`). */
export const justRecipes = (text) => [...new Set([...text.matchAll(/^@?([A-Za-z_][\w-]*)(?:\s+[^:\n]*)?:(?!=)/gm)].map((m) => m[1]))];

/** The document a .tex file belongs to, as editors say it: `% !TEX root = ../main.tex` in its first lines, relative to
 *  the file; null when it does not say. */
export function texRoot(path, text) {
  const m = /^\s*%\s*!TEX\s+root\s*=\s*(.+?)\s*$/im.exec(text.split("\n").slice(0, 20).join("\n"));
  if (!m) return null;
  const parts = dirOf(path).split("/").filter(Boolean);
  for (const p of m[1].split("/")) { if (p === "..") parts.pop(); else if (p && p !== ".") parts.push(p); }
  return parts.join("/");
}
/** A whole document (not a chapter \input by one). */
export const isDocument = (text) => /^\s*\\documentclass\b/m.test(text);

export const LATEX = "latexmk -lualatex -interaction=nonstopmode -file-line-error -synctex=1";

// --- the plugin ---

export function register(atlas) {
  const settings = atlas.plugin.settings;
  const own = (key) => String(settings[key] ?? "").trim();
  // is there such a file? (a failed read is "no"; kept, as the bar asks at every redraw; forgotten when files change)
  const known = new Map();
  const read = (path) => { if (!known.has(path)) known.set(path, atlas.readText(path).then((t) => t, () => null)); return known.get(path); };
  atlas.onFilesChanged((paths) => { for (const p of paths) known.delete(p); });
  /** The nearest folder, from the file upwards, that holds `name`; null when none does. */
  const nearest = async (path, name) => { for (const d of upwards(path)) if ((await read(d ? `${d}/${name}` : name)) !== null) return d; return null; };
  const shellOf = async () => (await atlas.terminal.shell?.().catch(() => null)) ?? "posix";
  /** Runs `make(shell)` in the terminal: the command is built once the shell is known. */
  const go = async (make) => { const sh = await shellOf(); const cmd = await make(sh); if (cmd) return atlas.terminal.run(cmd); };
  const say = (text) => atlas.toast("Run tools", text, "error");

  /** The tests of `path` in the chooser ("All" first) → `run(one)`; with none named, all at once. */
  async function pickTest(path, run) {
    const names = testsIn(path, (await read(path)) ?? "");
    if (!names.length) return run("");
    atlas.pick({
      placeholder: "Which test…", tag: "Test",
      items: [{ value: "", title: "All tests in this file" }, ...names.map((n) => ({ value: n, title: n }))],
      onpick: (v) => run(v),
    });
  }
  /** One of `items` (names) in the chooser → `run(name)`. */
  const pickOne = (tag, items, run) => atlas.pick({ placeholder: `Which ${tag.toLowerCase()}…`, tag, items: items.map((n) => ({ value: n, title: n })), onpick: (v) => run(v) });

  /** The interpreter for a Python file: the setting, else the vault's environment (Python: choose the environment —
   *  the one its language server and terminals use), else a project run by uv, else the nearest .venv, else python. */
  async function python(sh, path) {
    if (own("python")) return own("python"); // the person's own words, typed as they are (`conda run -n env python`)
    const envs = await fetch("/api/python-envs", { headers: { "x-atlas": "1" } }).then((r) => (r.ok ? r.json() : null), () => null);
    const chosen = envs?.found?.find((e) => e.path === envs.chosen);
    if (chosen) return quote(chosen.python, sh);
    if ((await nearest(path, "uv.lock")) !== null) return "uv run python";
    const venv = await nearest(path, ".venv/pyvenv.cfg");
    if (venv !== null) return line(sh, venvPython(sh, under(sh, venv, ".venv")));
    return sh === "posix" ? "python3" : "python";
  }

  /** The document a .tex file belongs to: its `% !TEX root`, else itself when it is one, else the nearest main.tex
   *  above it that is one (a chapter of a thesis), else itself. */
  async function rootOf(path) {
    const text = (await read(path)) ?? "";
    const said = texRoot(path, text);
    if (said) return said;
    if (isDocument(text)) return path;
    for (const d of upwards(path)) {
      const main = d ? `${d}/main.tex` : "main.tex";
      if (main !== path && isDocument((await read(main)) ?? "")) return main;
    }
    return path;
  }

  /** Cargo, at the nearest Cargo.toml above the file. */
  const cargo = (path, ...args) => go(async (sh) => {
    const crate = await nearest(path, "Cargo.toml");
    if (crate === null) return void say("No Cargo.toml beside this file or above it.");
    return line(sh, "cargo", ...args, ...(crate ? ["--manifest-path", under(sh, crate, "Cargo.toml")] : []));
  });

  /** The nearest project's task runners: package.json scripts, Makefile targets, justfile recipes → a Task button. */
  async function taskButton(path) {
    const [npm, make, just] = await Promise.all([nearest(path, "package.json"), nearest(path, "Makefile"), nearest(path, "justfile")]);
    const kinds = [];
    if (npm !== null) kinds.push({ at: npm, names: async () => npmScripts((await read(npm ? `${npm}/package.json` : "package.json")) ?? ""), cmd: (sh, n) => line(sh, "npm", "--prefix", npm || ".", "run", n) });
    if (make !== null) kinds.push({ at: make, names: async () => makeTargets((await read(make ? `${make}/Makefile` : "Makefile")) ?? ""), cmd: (sh, n) => line(sh, "make", "-C", make || ".", n) });
    if (just !== null) kinds.push({ at: just, names: async () => justRecipes((await read(just ? `${just}/justfile` : "justfile")) ?? ""), cmd: (sh, n) => line(sh, "just", "--justfile", under(sh, just, "justfile"), n) });
    if (!kinds.length) return [];
    // the nearest project's runner first: a folder deeper in the tree is nearer to the file
    kinds.sort((a, b) => b.at.length - a.at.length);
    return [{ label: "Task", title: "A script, target or recipe of the project (package.json, Makefile, justfile)", run: async () => {
      const all = (await Promise.all(kinds.map(async (k) => (await k.names()).map((n) => ({ k, n }))))).flat();
      if (!all.length) return say("The project names no script, target or recipe.");
      atlas.pick({ placeholder: "Which task…", tag: "Task", items: all.map(({ k, n }, i) => ({ value: String(i), title: n, detail: k.cmd("posix", n) })),
        onpick: (v) => { const { k, n } = all[Number(v)]; void go((sh) => k.cmd(sh, n)); } });
    } }];
  }

  // the bar is drawn at once, so the tools are plain objects; what needs looking up is looked up on the click — but
  // the Task button needs a project around the file, which is known only after a look: the bar is drawn again then
  // (registering anew redraws it)
  const tasks = new Map();
  const tasksOf = (path) => {
    if (!tasks.has(path)) { tasks.set(path, []); void taskButton(path).then((b) => { tasks.set(path, b); if (b.length) redraw(); }); }
    return tasks.get(path);
  };
  atlas.onFilesChanged(() => tasks.clear());

  const tools = (file) => {
    const p = file.path, name = baseOf(p);
    const own_ = (() => {
      if (p.endsWith(".py")) return [
        { label: "Run", title: "Run this file with Python (the vault's environment, uv, or a .venv beside or above it)", run: () => go(async (sh) => `${await python(sh, p)} ${quote(p, sh)}`) },
        { label: "Test", title: "pytest: all of this file's tests, or one", run: () => pickTest(p, (one) => go(async (sh) => `${await python(sh, p)} -m pytest ${quote(one ? `${p}::${one}` : p, sh)}`)) },
      ];
      if (p.endsWith(".rs")) return [
        { label: "Run", title: "cargo run", run: () => cargo(p, "run") },
        { label: "Test", title: "cargo test: all, or one of this file's tests", run: () => pickTest(p, (one) => (one ? cargo(p, "test", one) : cargo(p, "test"))) },
        { label: "Clippy", title: "cargo clippy", run: () => cargo(p, "clippy") },
      ];
      if (p.endsWith(".go")) return [
        { label: "Run", title: "go run, in the file's folder", run: () => go((sh) => line(sh, "go", "-C", dirOf(p) || ".", "run", "."))},
        { label: "Test", title: "go test: all, or one of this file's tests", run: () => pickTest(p, (one) => go((sh) => line(sh, "go", "-C", dirOf(p) || ".", "test", ...(one ? ["-run", `^${one}$`] : []), "."))) },
      ];
      if (/\.[cm]?[jt]s$/.test(p)) return [
        { label: "Run", title: "Run this file with Node", run: () => go((sh) => line(sh, own("node") || "node", p)) },
        { label: "Test", title: "node --test: all of this file's tests, or one", run: () => pickTest(p, (one) => go((sh) => line(sh, own("node") || "node", "--test", ...(one ? ["--test-name-pattern", one] : []), p))) },
      ];
      if (p.endsWith(".jl")) return [{ label: "Run", title: "Run this file with Julia", run: () => go((sh) => line(sh, own("julia") || "julia", p)) }];
      if (/\.(sh|bash)$/.test(p)) return [{ label: "Run", title: "Run this script with bash", run: () => go((sh) => line(sh, "bash", p)) }];
      if (p.endsWith(".tex")) {
        const latex = (sh, root, ...more) => [own("latex") || LATEX, ...more, "-cd", quote(root, sh)].join(" ");
        const pdfOf = (root) => root.replace(/\.tex$/, ".pdf");
        return [
          { label: "Build", title: "Build the PDF with LuaLaTeX (latexmk), the whole document this file belongs to; the PDF opens beside and follows each build", run: async () => {
            const root = await rootOf(p);
            await go((sh) => latex(sh, root));
            if ((await read(pdfOf(root))) !== null) atlas.open(pdfOf(root), undefined, { beside: true });
          } },
          { label: "Watch", title: "Build again at every save (latexmk -pvc), until Ctrl+C in the terminal", run: async () => { const root = await rootOf(p); await go((sh) => latex(sh, root, "-pvc", "-view=none")); } },
          { label: "PDF", title: "Open the PDF beside", run: async () => atlas.open(pdfOf(await rootOf(p)), undefined, { beside: true }) },
          { label: "Clean", title: "Remove the build files (latexmk -c), the PDF kept", run: async () => { const root = await rootOf(p); await go((sh) => [own("latex") || LATEX, "-c", "-cd", quote(root, sh)].join(" ")); } },
        ];
      }
      if (/\.(c|cc|cpp|cxx|h|hpp)$/.test(p)) return [
        { label: "Build", title: "cmake --build (a CMakeLists.txt above), else make", run: () => go(async (sh) => {
          const cm = await nearest(p, "CMakeLists.txt");
          if (cm !== null) return line(sh, "cmake", "--build", under(sh, cm, "build"));
          const mk = await nearest(p, "Makefile");
          return mk !== null ? line(sh, "make", "-C", mk || ".") : void say(`No CMakeLists.txt or Makefile above ${name}.`);
        }) },
      ];
      return [];
    })();
    return [...own_, ...tasksOf(p)];
  };
  let off = atlas.editor.toolbar(tools);
  const redraw = () => { off(); off = atlas.editor.toolbar(tools); };
}
