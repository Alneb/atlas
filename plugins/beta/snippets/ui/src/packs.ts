// Ready sets of snippets, each switched on in Settings, never copied into a vault's own files.
import type { Builders, Entry } from "./format";
import * as std from "./std";

export interface Pack { id: string; title: string; description: string; entries(b: Builders): Entry[] }

export const PACKS: Pack[] = [
  {
    id: "spacing", title: "Automatic spacing",
    description: "Bare names get their backslash, a letter after a command a space (\\sin x), a number after an operator a space (\\times 10), a digit after a Greek letter a subscript.",
    entries: (b) => [b.commands(std.greek, { digit: "subscript" }), b.commands([...std.operators, ...std.symbols], { digit: "space" })],
  },
  {
    id: "matrices", title: "Matrices by size",
    description: "33pmat, 24bmat: the size in the trigger, a stop in each cell. p b B v V for the brackets.",
    entries: (b) => [b.math(/(\d)(\d)([pbBvV]?)mat/, (m) => std.matrix(+m![1], +m![2], m![3] || "p"), { name: "A matrix by size" })],
  },
  {
    id: "sequences", title: "Sequences",
    description: "xsum → x_1 + x_2 + … + x_n, xprod, xleq, and x1dots → x_1, x_2, …, x_n.",
    entries: (b) => [
      b.math(/([A-Za-z])sum/, (m) => std.sequence(m![1], "+"), { name: "A written-out sum", priority: 1 }),
      b.math(/([A-Za-z])prod/, (m) => std.sequence(m![1], "\\times"), { name: "A written-out product", priority: 1 }),
      b.math(/([A-Za-z])leq/, (m) => std.sequence(m![1], "\\leq"), { name: "An ordered sequence", priority: 1 }),
      b.math(/([A-Za-z])1dots/, (m) => std.sequence(m![1], ","), { name: "A list", priority: 1 }),
    ],
  },
  {
    id: "minmax", title: "Smart min and max",
    description: "min + i → \\min_{i}, min + ( → \\min(), min + space → \\min. The same for max.",
    entries: (b) => (["min", "max"] as const).flatMap((f) => [
      b.math(new RegExp(`(?<!\\\\)${f}([A-Za-z])`), (m) => `\\${f}_{${m![1]}$1}$0`, { name: `\\${f} with a subscript` }),
      b.math(`${f}(`, `\\${f}($1)$0`, { priority: 1 }),
      b.math(`${f} `, `\\${f} `),
    ]),
  },
  {
    id: "derivatives", title: "Derivatives by their letters",
    description: "dydt → a fraction, ddt → d/dt, with any letters.",
    entries: (b) => [
      b.math(/d([a-ce-z])d([a-ce-z])/, "\\frac{d [[0]]}{d [[1]]} ", { name: "A derivative by its letters" }),
      b.math(/dd([a-ce-z])/, "\\frac{d}{d [[0]]} ", { name: "d/dx" }),
    ],
  },
  {
    id: "align", title: "Align a selection",
    description: "Select lines of math and type A: each is aligned at its first relation, inside align.",
    entries: (b) => [b.visual("A", (_m, at) => std.align(at.selection), { name: "Align what is selected" })],
  },
  {
    id: "colors", title: "Colour a selection",
    description: "Select math and type R: \\textcolor{red}{…}.",
    entries: (b) => [b.visual("R", "\\textcolor{ ${1:red} }{ ${VISUAL} }$0", { name: "Colour what is selected" })],
  },
  {
    id: "units", title: "Electrical units",
    description: "mV, kV, kW, mA, Ohm… written upright with a space before them. They fire on those letters anywhere in math, which is why they are a pack.",
    entries: (b) => [
      ...[["mV", "mV"], ["Vol", "V"], ["kV", "kV"], ["VA", "VA"], ["kVA", "kVA"], ["MVA", "MVA"], ["VAR", "VAR"], ["kVAR", "kVAR"], ["mW", "mW"], ["WATT", "W"], ["kW", "kW"], ["mA", "mA"], ["Amp", "A"], ["dB", "dB"], ["PF", "PF"], ["PU", "p.u."]]
        .map(([t, u]) => b.math(t, `\\space\\text{${u}}`, { name: `${u}, the unit` })),
      b.math("uA", "\\space\\mu\\text{A}"), b.math("Ohm", "\\Omega"), b.math("mOhm", "\\space\\text{m}\\Omega"), b.math("kOhm", "\\space\\text{k}\\Omega"), b.math("MOhm", "\\space\\text{M}\\Omega"),
    ],
  },
  {
    id: "text", title: "Small helpers in text",
    description: "ie → i.e., eg → e.g., and ## after a word flips the case of its first letter.",
    entries: (b) => [
      b.text(/\bie /, "i.e. ", { auto: true }), b.text(/\beg /, "e.g. ", { auto: true }),
      b.text(/(\w+)##/, (m) => { const f = m![1][0]; return (f === f.toUpperCase() ? f.toLowerCase() : f.toUpperCase()) + m![1].slice(1); }, { auto: true, name: "Flip the first letter's case" }),
    ],
  },
];
