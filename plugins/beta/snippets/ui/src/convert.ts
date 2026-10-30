// The old file → a module of the new format. The old file stays as it was. The misfires found in real use are mended
// here as one batch, each listed at the top of what is written, so the file itself says what changed.
import { evalLegacy, type RawLegacy } from "./format";

/** `$0, $1, … $n` (LaTeX Suite's order) → `$1, $2, …` with a final bare stop at the very end as `$0`. */
export function renumber(body: string): string {
  const numbers = [...body.matchAll(/\$\{?(\d+)/g)].map((m) => Number(m[1]));
  if (!numbers.length) return body;
  const top = Math.max(...numbers);
  const endsBare = new RegExp(`\\$${top}$`).test(body) && !new RegExp(`\\$\\{${top}\\b`).test(body) && numbers.filter((n) => n === top).length === 1;
  return body.replace(/\$(\{?)(\d+)/g, (_w, open: string, d: string) => {
    const n = Number(d);
    return `$${open}${endsBare && n === top ? 0 : n + 1}`;
  });
}

const key = (t: string | RegExp) => (t instanceof RegExp ? String(t) : t);

/** What the batch does, by the trigger as the old file writes it. */
const GONE = new Map<string, string>([
  ["([A-Z])T", "turned UT, NT and k_BT into transposes; ^{\\top} is not used in the notes"],
  ["=d", "turned x=d into x\\Downarrow; never used"], ["=u", "turned v=u into v\\Uparrow; never used"],
  ["u=d", "never used"], ["d=u", "never used"],
  ["and", "turned band into b\\cap; never used"],
  ["_([a-zA-Z0-9]{2,})", "could not fire: _ has already become _{"], ["/([A-Za-z])_(\\d\\d)/", "could not fire: _ has already become _{"],
  ["\\leq>", "a chain through <=; <=> is its own trigger"],
]);
/** The spacing regexes, all replaced by one rule, written where the first of them stood. */
const SPACING = new Set(["([^\\\\])(${GREEK}|${SYMBOL}|${MORE_SYMBOLS})", "\\\\(${GREEK}|${SYMBOL}|${MORE_SYMBOLS})([A-Za-z])", "/([^\\\\])(exp|log|ln)/", "/([^\\\\])(det)/",
  "/([^\\\\])(arcsin|sin|arccos|cos|arctan|tan|csc|sec|cot)/", "/\\\\(arcsin|sin|arccos|cos|arctan|tan|csc|sec|cot)([A-Za-gi-z])/", "/\\\\(sinh|cosh|tanh|coth)([A-Za-z])/"]);
const FUNCTIONS = "arcsin arccos arctan arccot arccsc arcsec sin cos tan cot csc sec sinh cosh tanh coth sech csch exp log ln det".split(" ");
/** Off, in their pack: they fire on those letters anywhere in math, and the notes never use them. */
const UNITS = new Set("mV Vol kV VA kVA MVA VAR kVAR mW WATT kW uA mA Amp mOhm Ohm kOhm MOhm PU PF dB".split(" "));
/** Mended in place. */
const MEND: { when: (r: RawLegacy) => boolean; to: (r: RawLegacy) => RawLegacy | null; why: string }[] = [
  { when: (r) => r.trigger === "\\xii", to: (r) => ({ ...r, trigger: "xii" }), why: "xii is its own trigger, not a chain through \\xi" },
  { when: (r) => r.trigger === "e\\xi sts", to: (r) => ({ ...r, trigger: "exists" }), why: "a trigger written from what a chain produced" },
  { when: (r) => r.trigger === "k_{\\mbox{\\tiny B}} t", to: (r) => ({ ...r, trigger: "kbt" }), why: "a trigger written from what a chain produced" },
  { when: (r) => r.trigger === "=>" && r.replacement === "\\geq", to: () => null, why: "hid the arrow; >= gives \\geq" },
  { when: (r) => r.trigger === "=<" && r.replacement === "\\leq", to: () => null, why: "hid the arrow; <= gives \\leq" },
];

const str = (s: string) => JSON.stringify(s);

/** Comments of the old file before each entry, by entry: the file is evaluated, which loses them, so they are found in
 *  its text. A commented-out snippet is kept as the comment it was. */
function commentsOf(src: string): { before: Map<number, string[]>; end: string[] } {
  const before = new Map<number, string[]>();
  let n = 0, pending: string[] = [], inFn = 0;
  for (const raw of src.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("//") && !inFn) { pending.push(line); continue; }
    if (/\btrigger\s*:/.test(line.replace(/\/\/.*$/, "")) && !inFn) {
      if (pending.length) before.set(n, pending);
      pending = [];
      n++;
    }
  }
  return { before, end: pending };
}

/** One entry as a line of the new format. */
function entryLine(r: RawLegacy): string {
  const o = String(r.options ?? ""), isRe = r.trigger instanceof RegExp || o.includes("r");
  const trigger = r.trigger instanceof RegExp ? String(r.trigger) : str(String(r.trigger));
  const fn = typeof r.replacement === "function";
  const body = fn ? String(r.replacement) : str(renumber(String(r.replacement)));
  const opts: string[] = [];
  if (isRe && !(r.trigger instanceof RegExp)) opts.push("regex: true");
  if (fn) opts.push("legacyStops: true"); // a function's text counts as it always did
  if (o.includes("w")) opts.push("word: true");
  if (r.priority) opts.push(`priority: ${r.priority}`);
  if (r.description) opts.push(`name: ${str(r.description)}`);
  const text = o.includes("t"), code = o.includes("c"), math = o.includes("m") || o.includes("M") || o.includes("n") || (!text && !code);
  if (o.includes("M")) opts.push('form: "display"');
  if (o.includes("n")) opts.push('form: "inline"');
  const auto = o.includes("A");
  if (math && !text && !code) {
    if (!auto) opts.push("auto: false");
    const visual = typeof r.replacement === "string" && r.replacement.includes("${VISUAL}");
    return `${visual ? "visual" : "math"}(${trigger}, ${body}${opts.length ? `, { ${opts.join(", ")} }` : ""}),`;
  }
  if (text && !math && !code) {
    if (auto) opts.push("auto: true");
    return `text(${trigger}, ${body}${opts.length ? `, { ${opts.join(", ")} }` : ""}),`;
  }
  // several places: said in full
  const where = [text && '{ kind: "text" }', code && '{ kind: "code" }', math && '{ kind: "math" }'].filter(Boolean).join(", ");
  opts.push(`auto: ${auto}`);
  return `anywhere([${where}], ${trigger}, ${body}, { ${opts.join(", ")} }),`;
}

/** The module for this vault's old files. */
export function convert(d: { sources: string[]; variables: string }): { text: string; kept: number; dropped: string[] } {
  const out: string[] = [], dropped: string[] = [];
  let kept = 0, spaced = false;
  const vars = d.variables.trim() ? (evalLegacy(d.variables) as Record<string, string>) : {};
  const names = (k: string) => (vars[`\${${k}}`] ?? "").split("|").filter(Boolean);
  for (const src of d.sources) {
    const raws = evalLegacy(src);
    if (!Array.isArray(raws)) continue;
    const { before, end } = commentsOf(src);
    (raws as RawLegacy[]).forEach((orig, i) => {
      for (const c of before.get(i) ?? []) out.push(`  ${c}`);
      let r: RawLegacy | null = orig;
      for (const m of MEND) if (r && m.when(r)) { const was = key(r.trigger!); r = m.to(r); dropped.push(`${was}: ${m.why}`); }
      if (!r || r.trigger == null || r.replacement == null) return;
      const k = key(r.trigger);
      if (GONE.has(k)) { dropped.push(`${k}: ${GONE.get(k)}`); return; }
      if (SPACING.has(k)) {
        if (!spaced) {
          spaced = true;
          dropped.push("the spacing regexes: one rule, in two commands(...) lines");
          // the names those regexes covered and no others: a new one would be a new misfire (`x_{max}`)
          out.push(`  // the automatic spacing: a bare name gets its backslash, a letter after a command a space`);
          out.push(`  commands(${JSON.stringify(names("GREEK"))}, { digit: "subscript" }),`);
          out.push(`  commands(${JSON.stringify([...new Set([...names("SYMBOL"), ...names("MORE_SYMBOLS"), ...FUNCTIONS])])}, { digit: "space" }),`);
        }
        return;
      }
      if (typeof r.trigger === "string" && UNITS.has(r.trigger)) { out.push(`  // off, in the Electrical units pack: ${entryLine(r)}`); kept++; return; }
      // a mended rule: the arrows only where no operand stands before them, the letter + digit subscript not inside a command
      if (r.trigger === "-d" || r.trigger === "-u") {
        out.push(`  ${entryLine(r).replace(/\),$/, `, { when: (at) => !/[A-Za-z0-9})]$/.test(at.before) }),`)}`);
        dropped.push(`${r.trigger}: not after an operand, so a-d stays a subtraction`);
        kept++;
        return;
      }
      if (String(r.trigger) === "/([A-Za-z])(\\d)/") {
        r = { ...r, trigger: /(?<![\\A-Za-z])([A-Za-z])(\d)/ };
        dropped.push("letter + digit: not when the letter ends a command, so \\times10 is safe");
      }
      out.push(`  ${entryLine(r)}`);
      kept++;
    });
    for (const c of end) out.push(`  ${c}`);
  }
  const head = [
    `// Written by Snippets: convert from the old snippet file, which was left as it was. Edit freely: this file is yours.`,
    ...(dropped.length ? [`// Changed from the old file, as one batch:`, ...dropped.map((w) => `//   ${w}`)] : []),
    `export default ({ math, text, code, visual, anywhere, commands, words, vars, std }) => [`,
    ...(Object.keys(vars).length ? [`  vars(${JSON.stringify(vars)}),`] : []),
  ];
  return { text: `${[...head, ...out].join("\n")}\n];\n`, kept, dropped };
}
