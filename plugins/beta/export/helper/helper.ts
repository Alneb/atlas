// The Export plugin's helper (docs/design/DESIGN-export.md): a note → PDF (through Typst in the core, or LaTeX),
// LaTeX or Typst source, or Word. translate.ts makes the note pandoc Markdown; pandoc writes each format; the core's
// Typst compiles the Typst road's PDF; latexmk the LaTeX road's. Results go under the exports folder at the note's own
// path (`notes/a/x.md` → `exports/notes/a/x.pdf`), a preview into the plugin's cache. The note is only read.
import type { Params } from "atlas-helper";
import { bibKeys, dirname, relative, translate, type Translated } from "./translate";

export type Format = "pdf-typst" | "pdf-latex" | "tex" | "typ" | "docx";
const FORMATS: Format[] = ["pdf-typst", "pdf-latex", "tex", "typ", "docx"];
const EXT: Record<Format, string> = { "pdf-typst": "pdf", "pdf-latex": "pdf", tex: "tex", typ: "typ", docx: "docx" };
const ENGINES: Record<string, string> = { lualatex: "-lualatex", xelatex: "-xelatex", pdflatex: "-pdf" };
const MARGINS: Record<string, string> = { narrow: "1.5cm", normal: "2.4cm", wide: "3.2cm" };
/** The citation styles offered, in each road's own names. */
const STYLES: Record<string, { biblatex: string; typst: string }> = {
  numeric: { biblatex: "numeric-comp", typst: "ieee" },
  "author-year": { biblatex: "authoryear", typst: "chicago-author-date" },
  alphabetic: { biblatex: "alphabetic", typst: "alphanumeric" },
  physics: { biblatex: "phys", typst: "american-physics-society" },
};
const CACHE = ".atlas/cache/plugins/export";
/** Where the dialog leaves a ```tikz picture drawn by the page's TeX (`atlas.tikz.png`), by its key. */
export const tikzPng = (key: string) => `${CACHE}/figures/${key}.png`;
/** A fence's key: the hash of its source, the same for the dialog (from `describe`) and the road. */
const keyOf = (source: string) => atlas.hash.sha256(source).slice(0, 16);
const PLUGIN = ".atlas/plugins/export";

/** The dialog's choices; any left out come from the plugin's settings, then these defaults. */
export interface Options {
  title?: string; subtitle?: string; author?: string; date?: string;
  toc?: boolean; numbered?: boolean;
  paper?: "a4" | "letter"; fontsize?: string; margins?: string; columns?: number; lang?: string; font?: string;
  bibliography?: string; style?: string;
  engine?: string; preamble?: string; typstPreamble?: string;
  folder?: string;
}

const progress = (stage: string, text: string) => atlas.event("progress", { stage, text });

/** Runs a program the manifest names; its output, or why not (with its last error lines). */
async function run(program: "pandoc" | "latexmk", args: string[], opts: { cwd?: string; stdin?: string; timeout?: number } = {}) {
  const r = await atlas.exec(program, args, { ...opts, timeout: opts.timeout ?? 120 }).catch((e: Error) => {
    throw new Error(/not installed/.test(e.message) ? `${program} is not installed on the machine running Atlas` : e.message);
  });
  return r;
}

/** Which formats work here: pandoc for all, latexmk for the LaTeX PDF; Typst is in the core. */
async function formats() {
  const has = async (p: "pandoc" | "latexmk", flag: string) => (await run(p, [flag], { timeout: 20 }).then((r) => r.status === 0, () => false));
  const [pandoc, latexmk] = await Promise.all([has("pandoc", "--version"), has("latexmk", "-v")]);
  const need = (ok: boolean, what: string) => (ok ? {} : { needs: what });
  return [
    { id: "pdf-typst", label: "PDF (Typst)", ok: pandoc, ...need(pandoc, "pandoc") },
    { id: "pdf-latex", label: "PDF (LaTeX)", ok: pandoc && latexmk, ...need(pandoc && latexmk, pandoc ? "latexmk (a TeX distribution)" : "pandoc and a TeX distribution") },
    { id: "tex", label: "LaTeX source (.tex)", ok: pandoc, ...need(pandoc, "pandoc") },
    { id: "typ", label: "Typst source (.typ)", ok: pandoc, ...need(pandoc, "pandoc") },
    { id: "docx", label: "Word (.docx)", ok: pandoc, ...need(pandoc, "pandoc") },
  ];
}

/** The .bib the citations come from: the setting's, else refs/refs.bib, else the first at the top or in refs/. */
function findBib(files: string[], setting: string): string | null {
  const s = setting.trim().replace(/^\/+/, "");
  if (s) return files.includes(s) ? s : null;
  const bibs = files.filter((f) => f.endsWith(".bib")).sort();
  return bibs.find((f) => f === "refs/refs.bib") ?? bibs.find((f) => !f.includes("/")) ?? bibs.find((f) => /^refs\/[^/]+$/.test(f)) ?? null;
}

/** `figures`: the tikz pictures the dialog drew, key → width in points. */
interface Job { rel: string; outDir: string; stem: string; o: Options; files: string[]; bib: string | null; t: Translated; figures: Record<string, number> }

async function prepare(params: Params, preview: boolean): Promise<Job> {
  const rel = String(params.path ?? "").trim().replace(/^\/+/, "");
  if (!/\.md$/i.test(rel)) throw new Error(`not a note: ${rel}`);
  const o: Options = { ...(params.settings ?? {}), ...(params.options ?? {}) };
  const folder = String(o.folder ?? "exports").trim().replace(/^\/+|\/+$/g, "") || "exports";
  const outDir = [preview ? `${CACHE}/preview` : folder, dirname(rel)].filter(Boolean).join("/");
  const files: string[] = await atlas.files();
  const bib = findBib(files, String(o.bibliography ?? ""));
  const keys = bib ? bibKeys(await atlas.read(bib)) : new Set<string>();
  progress("translate", `reading ${rel}`);
  const t = await translate({ files, read: (p) => atlas.read(p) }, rel, outDir, keys);
  if (t.cited.length && !bib) t.warnings.push("papers are cited but no .bib was found (the Bibliography option)");
  const stem = rel.slice(rel.lastIndexOf("/") + 1).replace(/\.md$/i, "");
  const figures: Record<string, number> = {};
  for (const [k, w] of Object.entries((params.figures ?? {}) as Record<string, unknown>)) if (/^[0-9a-f]{16}$/.test(k) && Number(w) > 0) figures[k] = Number(w);
  return { rel, outDir, stem, o, files, bib, t, figures };
}

/** The pandoc metadata block every road starts from: the title block, the page, the bibliography. */
function metadata(j: Job, road: "latex" | "typst" | "docx", header: string[]): string {
  const { o, t } = j;
  const m: Record<string, unknown> = { ...t.meta };
  for (const k of ["title", "subtitle", "author", "date"] as const) if (o[k] !== undefined) m[k] = o[k] || undefined;
  m.lang = o.lang || "en";
  if (o.font) m.mainfont = o.font;
  const margin = MARGINS[o.margins ?? "normal"] ?? MARGINS.normal;
  const paper = o.paper === "letter" ? "letter" : "a4";
  if (road === "latex") {
    Object.assign(m, { papersize: paper, fontsize: o.fontsize || "11pt", geometry: `margin=${margin}`, colorlinks: true });
    if (Number(o.columns) === 2) m.classoption = "twocolumn";
  } else if (road === "typst") {
    // pandoc's Typst template sets `font: ()` when no main font is named, which Typst 0.15 refuses: the bundled one
    m.mainfont ??= "Libertinus Serif";
    Object.assign(m, { papersize: paper === "letter" ? "us-letter" : "a4", fontsize: o.fontsize || "11pt", margin: { x: margin, y: margin }, columns: Number(o.columns) === 2 ? 2 : 1, "page-numbering": "1" });
  }
  if (o.toc) Object.assign(m, { toc: true, "toc-depth": 3 });
  if (o.numbered) m[road === "typst" ? "section-numbering" : "numbersections"] = road === "typst" ? "1.1" : true;
  if (j.bib && t.cited.length) {
    m.bibliography = road === "docx" ? j.bib : relative(j.outDir, j.bib); // pandoc reads it itself for Word
    const style = STYLES[o.style ?? "numeric"] ?? STYLES.numeric;
    if (road === "latex") m["biblio-style"] = style.biblatex;
    if (road === "typst") m.bibliographystyle = style.typst;
  }
  if (header.length) m["header-includes"] = header;
  // JSON is YAML: every value quoted as it is
  const yaml = Object.entries(m).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join("\n");
  return `---\n${yaml}\n---\n\n`;
}

/** The fences put back for a road: raw source, a compiled picture, or the code with a warning. */
async function fences(j: Job, road: "latex" | "typst" | "docx"): Promise<string> {
  const out: string[] = [];
  for (const [i, f] of j.t.fences.entries()) {
    if (f.lang === "typst" && road === "typst") out[i] = "```{=typst}\n" + f.source + "\n```";
    else if (f.lang === "tikz" && road === "latex") out[i] = "```tikz\n" + f.source + "\n```"; // tikz.lua draws it
    else if (f.lang === "typst" && road === "latex") {
      // drawn by the core's Typst into a PDF picture the LaTeX includes
      const pdf = `${CACHE}/figures/${keyOf(f.source)}.pdf`;
      atlas.convert.typstPdf(`${dirname(j.rel) || "."}/.fence.typ`, pdf, { source: f.source, fence: true });
      out[i] = `![](<${relative(j.outDir, pdf)}>)`;
    } else if (f.lang === "tikz" && j.figures[keyOf(f.source)]) {
      // drawn by the page's TeX as a PNG (the web fonts inside), at the width TeX gave it
      out[i] = `![](<${relative(j.outDir, tikzPng(keyOf(f.source)))}>){width=${j.figures[keyOf(f.source)].toFixed(1)}pt}`;
    } else {
      j.t.warnings.push(`a ${f.lang} picture is left as code: ${f.lang === "tikz" ? "the TeX in the page did not draw it" : "Word has no Typst"}`);
      out[i] = "```" + f.lang + "\n" + f.source + "\n```";
    }
  }
  const md = j.t.markdown.replace(/<!--fence:(\d+)-->/g, (_, n: string) => out[Number(n)]);
  // a note whose sections start at ## gets them one level up
  return /^# /m.test(md) || !/^## /m.test(md) ? md : md.replace(/^#(#+ )/gm, "$1");
}

const MD = "markdown+mark-implicit_figures+implicit_figures";

// run at the vault's top (the output folder may not exist yet): paths it reads itself are vault paths
async function pandoc(j: Job, to: string, input: string, extra: string[] = [], output?: string): Promise<string> {
  progress("pandoc", `writing ${output ?? to}`);
  const r = await run("pandoc", ["-f", MD, "-t", to, "-s", ...extra, ...(output ? ["-o", output] : [])], { stdin: input });
  if (r.status !== 0) throw new Error(`pandoc failed: ${(r.stderr || r.stdout).trim().slice(-2000)}`);
  return r.stdout;
}

/** The lines LaTeX marks as errors, with the two after each. */
export function latexErrors(log: string): string {
  const lines = log.split("\n");
  const picked = lines.flatMap((l, i) => (l.startsWith("!") || /^\S+\.tex:\d+:/.test(l) ? [i] : []));
  const keep = [...new Set(picked.flatMap((i) => [i, i + 1, i + 2].filter((k) => k < lines.length)))].sort((a, b) => a - b);
  return keep.map((k) => lines[k]).join("\n").slice(-3000) || lines.slice(-30).join("\n");
}

async function typstRoad(j: Job, format: "pdf-typst" | "typ"): Promise<string> {
  const header = j.o.typstPreamble ? [await atlas.read(j.o.typstPreamble).catch(() => { j.t.warnings.push(`Typst preamble not found: ${j.o.typstPreamble}`); return ""; })] : [];
  const header2 = header.filter(Boolean).map((h) => "```{=typst}\n" + h + "\n```");
  const typ = await pandoc(j, "typst", metadata(j, "typst", header2) + (await fences(j, "typst")));
  const at = `${j.outDir}/${j.stem}.typ`;
  if (format === "typ") { await atlas.write(at, typ); return at; }
  progress("typst", "compiling the PDF with Typst");
  return atlas.convert.typstPdf(at, `${j.outDir}/${j.stem}.pdf`, { source: typ });
}

async function latexRoad(j: Job, format: "pdf-latex" | "tex"): Promise<string[]> {
  const header = ["```{=latex}\n\\usepackage{soul}\n```"];
  if (j.o.preamble) {
    if (j.files.includes(j.o.preamble)) header.push("```{=latex}\n\\input{" + relative(j.outDir, j.o.preamble) + "}\n```");
    else j.t.warnings.push(`LaTeX preamble not found: ${j.o.preamble}`);
  }
  const extra = ["--lua-filter", `${PLUGIN}/tikz.lua`, ...(j.t.cited.length && j.bib ? ["--biblatex"] : [])];
  const tex = await pandoc(j, "latex", metadata(j, "latex", header) + (await fences(j, "latex")), extra);
  const at = `${j.outDir}/${j.stem}.tex`;
  await atlas.write(at, tex);
  if (format === "tex") return [at];
  const engine = String(j.o.engine || "lualatex");
  const buildDir = `${CACHE}/build/${j.rel.replace(/[^\w.-]+/g, "_")}`;
  const build = relative(j.outDir, buildDir);
  progress("latex", `compiling with ${engine} (latexmk; biber for the references)`);
  const r = await run("latexmk", [ENGINES[engine] ?? "-lualatex", "-interaction=nonstopmode", "-halt-on-error", "-file-line-error",
    "-emulate-aux-dir", `-auxdir=${build}`, "-outdir=.", `${j.stem}.tex`], { cwd: j.outDir, timeout: 600 });
  if (r.status !== 0) {
    const log = await atlas.read(`${buildDir}/${j.stem}.log`).catch(() => r.stdout);
    throw new Error(`LaTeX failed on ${at}:\n${latexErrors(log)}`);
  }
  return [at, `${j.outDir}/${j.stem}.pdf`];
}

async function docxRoad(j: Job): Promise<string> {
  const out = `${j.outDir}/${j.stem}.docx`;
  await atlas.write(out, ""); // makes its folder; pandoc writes over it
  const cite = j.t.cited.length && j.bib ? ["--citeproc"] : [];
  await pandoc(j, "docx", metadata(j, "docx", []) + (await fences(j, "docx")), [...cite, `--resource-path=${j.outDir}`], out);
  return out;
}

/** Old callers (Print) say `to: "pdf" | "tex"`: the PDF road the settings chose, or LaTeX source. */
function formatOf(params: Params): Format {
  const f = String(params.format ?? "");
  if ((FORMATS as string[]).includes(f)) return f as Format;
  if (params.to === "tex") return "tex";
  const set = String(params.settings?.format ?? "");
  return set === "pdf-latex" ? "pdf-latex" : "pdf-typst";
}

async function exportNote(params: Params) {
  const format = formatOf(params);
  const preview = params.preview === true;
  const j = await prepare(params, preview);
  let written: string[];
  if (format === "pdf-typst" || format === "typ") written = [await typstRoad(j, format)];
  else if (format === "pdf-latex" || format === "tex") written = await latexRoad(j, format);
  else written = [await docxRoad(j)];
  progress("done", written.join(", "));
  return { written, format, pdf: written.find((w) => w.endsWith(".pdf")) ?? null, cited: j.t.cited, warnings: j.t.warnings };
}

/** What the dialog shows before anything is made: the title block, whether papers are cited, which pictures. */
async function describe(params: Params) {
  const j = await prepare({ ...params, options: {} }, true);
  const tikz = j.t.fences.filter((f) => f.lang === "tikz").map((f) => ({ key: keyOf(f.source), source: f.source, png: tikzPng(keyOf(f.source)) }));
  return { meta: j.t.meta, cited: j.t.cited, bib: j.bib, fences: j.t.fences.map((f) => f.lang), tikz, warnings: j.t.warnings, ext: EXT };
}

atlas.methods({ formats, describe, export: exportNote });
