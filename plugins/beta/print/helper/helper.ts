// The Print plugin's helper: CUPS (`lp`, `lpstat`) on the machine running Atlas, run by the core (`atlas.exec`). A note
// prints as the document the Export plugin makes of it (its PDF, with the Export settings), never as its Markdown text;
// any other file as it is. The answer is the job id `lp` gives, or why not — the page shows it. Tests: helper.test.ts.
import type { Params } from "atlas-helper";

const SIDES: Record<string, string> = { "one-sided": "one-sided", "two-sided (long edge)": "two-sided-long-edge", "two-sided (short edge)": "two-sided-short-edge" };

/** A CUPS program's output, in English whatever the machine's language (the words are read here). */
async function cups(program: "lp" | "lpstat", args: string[]): Promise<string> {
  const r = await atlas.exec(program, args, { locale: "C", timeout: 60 }).catch((e: Error) => {
    throw new Error(/not installed/.test(e.message) ? `${program} is not installed on the machine running Atlas (CUPS)` : e.message);
  });
  if (r.status !== 0) throw new Error((r.stderr || r.stdout).trim() || `${program} failed (${r.status ?? "killed"})`);
  return r.stdout;
}

/** The printers CUPS knows, the default first: [{value, label}] for the settings' suggestions. */
async function printers() {
  const names = [...(await cups("lpstat", ["-p"])).matchAll(/^printer (\S+)/gm)].map((m) => m[1]);
  const def = /:\s*(\S+)\s*$/.exec((await cups("lpstat", ["-d"])).trim())?.[1];
  const first = def && names.includes(def) ? def : undefined;
  return [...(first ? [first] : []), ...names.filter((n) => n !== first)].map((n) => ({ value: n, label: n === first ? `${n} (default)` : n }));
}

/** A note's PDF, made by the plugin that is the vault's PDF export (role `pdf-export`: Export) with its own saved
 *  settings (the core puts them in); its vault path. */
async function asPdf(path: string): Promise<string> {
  const r = await atlas.post("/api/plugins/@pdf-export/helper", { method: "export", params: { path, to: "pdf" }, timeout_secs: 600 }).catch((e: Error) => {
    throw new Error(/provides the role/.test(e.message) ? "a note is printed as its PDF, made by the Export plugin: install it (Settings → Plugins)" : e.message);
  });
  return r.written[r.written.length - 1];
}

/** What will print, for the dialog's preview: a note's PDF (made now by the Export plugin), any other file itself. */
async function prepare(params: Params) {
  const path = String(params.path ?? "").trim().replace(/^\/+/, "");
  if (!path) throw new Error("nothing to print");
  return { pdf: path.toLowerCase().endsWith(".md") ? await asPdf(path) : path };
}

/** The lp arguments for these settings (the dialog's choices or the plugin's settings), the file last. */
export function lpArgs(target: string, s: Record<string, unknown>): string[] {
  const args: string[] = [];
  const printer = String(s.printer ?? "").trim();
  if (printer) args.push("-d", printer);
  const copies = Number(s.copies) || 1;
  if (copies > 1) args.push("-n", String(copies));
  const sides = SIDES[String(s.sides ?? "")];
  if (sides) args.push("-o", `sides=${sides}`);
  if (String(s.media ?? "").trim()) args.push("-o", `media=${s.media}`);
  const pages = String(s.pages ?? "").replace(/\s+/g, "");
  if (pages) {
    if (!/^\d+(-\d+)?(,\d+(-\d+)?)*$/.test(pages)) throw new Error(`pages: "${s.pages}" is not like 1-3,5`);
    args.push("-o", `page-ranges=${pages}`);
  }
  if (s.landscape === true) args.push("-o", "landscape");
  if (s.fit === true) args.push("-o", "fit-to-page");
  args.push(...String(s.options ?? "").split(/\s+/).filter(Boolean));
  // the core runs it in the vault; `./` so a name starting with "-" is never read as an option
  args.push(`./${target}`);
  return args;
}

async function print(params: Params) {
  const path = String(params.path ?? "").trim().replace(/^\/+/, "");
  const s = params.settings ?? {};
  if (!path) throw new Error("nothing to print");
  const target = path.toLowerCase().endsWith(".md") ? await asPdf(path) : path;
  const printer = String(s.printer ?? "").trim();
  const out = await cups("lp", lpArgs(target, s));
  return { job: /request id is (\S+)/.exec(out)?.[1] ?? out.trim(), printed: target, printer: printer || "the default printer" };
}

atlas.methods({ printers, prepare, print });
