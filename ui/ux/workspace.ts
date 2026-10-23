// The UX audit's workspace: a COPY of a sample of a real vault (ATLAS_UX_SOURCE / ATLAS_VAULT), so
// journeys run on real notes, papers, runs and code while writes never touch the original.
// Sampling is by shape (folders that exist, small tables, a few PDFs), not by hardcoded names.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, relative } from "node:path";

const MB = 1 << 20;

function walk(dir: string, keep: (p: string, size: number) => boolean, out: string[] = [], depth = 0): string[] {
  if (depth > 8 || !existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    // dot-folders, environments and package caches never hold the user's own files
    if (e.name.startsWith(".") || (e.isDirectory() && /^(node_modules|site-packages|__pycache__|venv\w*|env)$/.test(e.name))) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, keep, out, depth + 1);
    else if (e.isFile() && keep(p, statSync(p).size)) out.push(p);
  }
  return out;
}

function copy(src: string, dst: string, files: string[]) {
  for (const f of files) {
    const to = join(dst, relative(src, f));
    mkdirSync(dirname(to), { recursive: true });
    cpSync(f, to);
  }
}

/** Builds the sample; returns a short description of what was copied (for the report). */
export function buildWorkspace(src: string, dst: string): string[] {
  rmSync(dst, { recursive: true, force: true });
  mkdirSync(dst, { recursive: true });
  const notes: string[] = [];
  const take = (label: string, files: string[]) => { copy(src, dst, files); notes.push(`${label}: ${files.length} files`); };

  for (const f of ["FOCUS.md", "README.md"]) if (existsSync(join(src, f))) take(f, [join(src, f)]);
  take("log/", walk(join(src, "log"), (p) => p.endsWith(".md")));
  take("notes/ (all notes + attachments ≤ 5 MB)", walk(join(src, "notes"), (_p, s) => s <= 5 * MB));
  // papers: every entry's metadata + notes, PDFs for the first few (enough to open one)
  const papers = join(src, "refs/papers");
  const meta = walk(papers, (p) => /info\.yaml$|notes\.md$/.test(p));
  const pdfs = walk(papers, (p, s) => p.endsWith(".pdf") && s <= 20 * MB).slice(0, 4);
  take("refs/papers (metadata, 4 PDFs)", [...meta, ...pdfs]);
  // the Zotero database (read-only for the importer; small) so "import from Zotero" really runs
  const zdb = join(src, "refs/zotero/zotero.sqlite");
  if (existsSync(zdb) && statSync(zdb).size <= 200 * MB) take("refs/zotero/zotero.sqlite", [zdb]);
  if (existsSync(join(src, "refs/refs.bib"))) take("refs/refs.bib", [join(src, "refs/refs.bib")]);
  // code: the first project folder holding Python (small files only)
  const py = walk(join(src, "projects"), (p, s) => p.endsWith(".py") && s <= MB);
  const pyDir = py.length ? dirname(py[0]) : "";
  take("one Python project folder", py.filter((p) => dirname(p) === pyDir));
  // runs: up to 3 run folders with small tables (+ their figures)
  const runDirs = [...new Set(walk(join(src, "runs"), (p, s) => p.endsWith(".tsv") && s <= 2 * MB).map(dirname))].slice(0, 3);
  take("runs/ (3 small run folders)", runDirs.flatMap((d) => readdirSync(d).map((n) => join(d, n)).filter((p) => statSync(p).isFile() && statSync(p).size <= 5 * MB)));
  // one real file of each type Atlas opens that the folders above may lack (from anywhere in the
  // source, ignored folders included), under ux-samples/ so search and the palette can see them
  const wanted = ["tex", "bib", "svg", "tsv", "csv", "toml", "json", "png", "jpg"];
  // types already visible to search (runs/ is usually on the ignore list, so its tables do not count)
  const have = new Set(walk(dst, () => true).filter((f) => !relative(dst, f).startsWith("runs/")).map((f) => f.split(".").pop()!.toLowerCase()));
  const pool = walk(src, (p, s) => s <= 2 * MB && wanted.includes(p.split(".").pop()!.toLowerCase()) && !p.includes("/node_modules/"));
  const extra = wanted.filter((e) => !have.has(e)).flatMap((e) => pool.filter((p) => p.toLowerCase().endsWith("." + e)).slice(0, 1));
  for (const f of extra) { mkdirSync(join(dst, "ux-samples"), { recursive: true }); cpSync(f, join(dst, "ux-samples", f.split("/").pop()!)); }
  notes.push(`ux-samples/ (one real file per missing type): ${extra.map((f) => f.split(".").pop()).join(", ") || "none needed"}`);
  // Atlas config + commands; relative tool paths are made absolute (they point into the original)
  if (existsSync(join(src, ".atlas/config.toml"))) {
    mkdirSync(join(dst, ".atlas"), { recursive: true });
    let cfg = readFileSync(join(src, ".atlas/config.toml"), "utf8").replace(/^(\w+\s*=\s*")((?:lib|tools|bin)\/[^"]*")/gm, `$1${src}/$2`);
    // the audit never starts the real Claude: its "Claude" is `cat`, which echoes what Atlas types into it
    if (/^claude\s*=/m.test(cfg)) cfg = cfg.replace(/^claude\s*=.*$/m, 'claude = "cat"');
    else if (/^\[terminal\]/m.test(cfg)) cfg = cfg.replace(/^\[terminal\]\s*$/m, '[terminal]\nclaude = "cat"');
    else cfg += '\n[terminal]\nclaude = "cat"\n';
    writeFileSync(join(dst, ".atlas/config.toml"), cfg);
    notes.push(".atlas/config.toml (relative tool paths → absolute; Claude replaced by `cat`)");
  }
  // everything else under .atlas/ (commands, plugins, keys…) except the rebuildable cache
  if (existsSync(join(src, ".atlas"))) {
    for (const e of readdirSync(join(src, ".atlas"))) {
      if (e === "cache" || e === "config.toml") continue;
      cpSync(join(src, ".atlas", e), join(dst, ".atlas", e), { recursive: true });
    }
  }

  const git = (...a: string[]) => execFileSync("git", ["-C", dst, ...a], { stdio: "ignore" });
  git("init", "-q"); git("config", "user.name", "UX audit"); git("config", "user.email", "ux@example.org");
  git("add", "-A"); git("commit", "-q", "-m", "UX audit sample of the real workspace");
  return notes;
}
