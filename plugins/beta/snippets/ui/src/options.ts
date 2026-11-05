// The ready-made options a snippet file can declare (`options.spacing()`, `options.units({ on: false })`): each a set of
// snippets switched on or off as one in Settings. Declared in the file, so the file stays the one place snippets come from.
import { builders as b, type Entry } from "./format";
import * as std from "./std";

type On = { on?: boolean };

export const options = {
  spacing: (o: On = {}): Entry => b.option("Automatic spacing",
    "Bare names get their backslash, a letter after a command a space (\\sin x), a number after an operator a space (\\times 10), a digit after a Greek letter a subscript.",
    [b.commands(std.greek, { digit: "subscript" }), b.commands([...std.operators, ...std.symbols], { digit: "space" })], o),
  matrices: (o: On = {}): Entry => b.option("Matrices by size",
    "33pmat, 24bmat: the size in the trigger, a stop in each cell. p b B v V for the brackets.",
    [b.math(/(\d)(\d)([pbBvV]?)mat/, (m) => std.matrix(+m![1], +m![2], m![3] || "p"), { name: "A matrix by size" })], o),
  sequences: (o: On = {}): Entry => b.option("Sequences",
    "xsum → x_1 + x_2 + … + x_n, xprod, xleq, and x1dots → x_1, x_2, …, x_n.",
    [
      b.math(/([A-Za-z])sum/, (m) => std.sequence(m![1], "+"), { name: "A written-out sum", priority: 1 }),
      b.math(/([A-Za-z])prod/, (m) => std.sequence(m![1], "\\times"), { name: "A written-out product", priority: 1 }),
      b.math(/([A-Za-z])leq/, (m) => std.sequence(m![1], "\\leq"), { name: "An ordered sequence", priority: 1 }),
      b.math(/([A-Za-z])1dots/, (m) => std.sequence(m![1], ","), { name: "A list", priority: 1 }),
    ], o),
  minmax: (o: On = {}): Entry => b.option("Smart min and max",
    "min + i → \\min_{i}, min + ( → \\min(), min + space → \\min. The same for max.",
    (["min", "max"] as const).flatMap((f) => [
      b.math(new RegExp(`(?<!\\\\)${f}([A-Za-z])`), (m) => `\\${f}_{${m![1]}$1}$0`, { name: `\\${f} with a subscript` }),
      b.math(`${f}(`, `\\${f}($1)$0`, { priority: 1 }),
      b.math(`${f} `, `\\${f} `),
    ]), o),
  derivatives: (o: On = {}): Entry => b.option("Derivatives by their letters",
    "dydt → a fraction, ddx → d/dx, with any letters.",
    [
      b.math(/d([a-ce-z])d([a-ce-z])/, "\\frac{d [[0]]}{d [[1]]} ", { name: "A derivative by its letters" }),
      b.math(/dd([a-ce-z])/, "\\frac{d}{d [[0]]} ", { name: "d/dx" }),
    ], o),
  align: (o: On = {}): Entry => b.option("Align a selection",
    "Select lines of math and type A: each is aligned at its first relation, inside align.",
    [b.visual("A", (_m, at) => std.align(at.selection), { name: "Align what is selected" })], o),
  colors: (o: On = {}): Entry => b.option("Colour a selection",
    "Select math and type R: \\textcolor{red}{…}.",
    [b.visual("R", "\\textcolor{${1:red}}{${VISUAL}}$0", { name: "Colour what is selected" })], o),
  autoAlign: (o: On = {}): Entry => b.option("Auto-align",
    "malign writes a $$align block: plain lines, drawn as an align with each line at its first relation (=, \\leq, \\approx…). menv stays plain math.",
    [b.text("malign", "$$align\n$1\n$$", { word: true, auto: true, name: "An auto-aligned block" })], o),
  units: (o: On = {}): Entry => b.option("Electrical units",
    "mV, kV, kW, mA, Ohm… written upright with a space before them. They fire on those letters anywhere in math.",
    [
      ...[["mV", "mV"], ["Vol", "V"], ["kV", "kV"], ["VA", "VA"], ["kVA", "kVA"], ["MVA", "MVA"], ["VAR", "VAR"], ["kVAR", "kVAR"], ["mW", "mW"], ["WATT", "W"], ["kW", "kW"], ["mA", "mA"], ["Amp", "A"], ["dB", "dB"], ["PF", "PF"], ["PU", "p.u."]]
        .map(([t, u]) => b.math(t, `\\space\\text{${u}}`, { name: `${u}, the unit` })),
      b.math("uA", "\\space\\mu\\text{A}"), b.math("Ohm", "\\Omega"), b.math("mOhm", "\\space\\text{m}\\Omega"), b.math("kOhm", "\\space\\text{k}\\Omega"), b.math("MOhm", "\\space\\text{M}\\Omega"),
    ], o),
  textHelpers: (o: On = {}): Entry => b.option("Small helpers in text",
    "ie → i.e., eg → e.g., and ## after a word flips the case of its first letter.",
    [
      b.text(/\bie /, "i.e. ", { auto: true }), b.text(/\beg /, "e.g. ", { auto: true }),
      b.text(/(\w+)##/, (m) => { const f = m![1][0]; return (f === f.toUpperCase() ? f.toLowerCase() : f.toUpperCase()) + m![1].slice(1); }, { auto: true, name: "Flip the first letter's case" }),
    ], o),
};
