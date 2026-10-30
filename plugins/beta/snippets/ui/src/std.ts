// What a snippet file may use besides the builders: names and the bodies worth not writing twice.
export const greek = "alpha beta gamma Gamma delta Delta epsilon varepsilon zeta eta theta vartheta Theta iota kappa lambda Lambda mu nu xi Xi omicron pi Pi varpi rho varrho sigma Sigma varsigma tau upsilon Upsilon phi Phi varphi chi psi Psi omega Omega".split(" ");
/** Functions and operators, the spacing rule's list. Not `max`, `min`, `dim`: as bare words they are labels (`x_{max}`). */
export const operators = "arcsin arccos arctan arccot arccsc arcsec sinh cosh tanh coth sech csch sin cos tan cot csc sec exp log ln det sum prod int iint iiint oint".split(" ");
export const symbols = "parallel perp partial nabla hbar ell infty oplus ominus otimes square star dagger vee wedge subseteq subset supseteq supset emptyset exists nexists forall implies impliedby iff setminus neg lor land bigcup bigcap cdot times simeq approx quad qquad leq geq neq gg ll equiv sim propto rightarrow leftarrow Rightarrow Leftarrow leftrightarrow to mapsto cap cup dots vdots ddots langle rangle".split(" ");

const ENV: Record<string, string> = { p: "pmatrix", b: "bmatrix", B: "Bmatrix", v: "vmatrix", V: "Vmatrix", m: "matrix" };

/** An `rows × cols` matrix with a stop in each cell. `kind`: p b B v V, or m for no brackets. */
export function matrix(rows: number, cols: number, kind = "p"): string {
  const env = ENV[kind] ?? "pmatrix";
  let n = 1;
  const body = Array.from({ length: rows }, () => Array.from({ length: cols }, () => `\${${n++}}`).join(" & ")).join(" \\\\\n");
  return `\\begin{${env}}\n${body}\n\\end{${env}}$0`;
}

/** Lines of mathematics aligned at their first relation: `=` becomes `&=`, lines get `\\`, all inside `align`. */
export function align(selection: string): string {
  const lines = selection.split("\n").map((l) => l.trim().replace(/^\$+|\$+$/g, "").trim()).filter(Boolean);
  const body = lines.map((l) => (/(?<![\\<>!])=|\\(?:leq|geq|neq|approx|equiv|sim|simeq|implies|iff)(?![A-Za-z])/.test(l)
    ? l.replace(/(?<![\\<>!])=|\\(?:leq|geq|neq|approx|equiv|sim|simeq|implies|iff)(?![A-Za-z])/, (r) => `&${r}`) : `&${l}`)).join(" \\\\\n");
  return `\\begin{align}\n${body}\n\\end{align}$0`;
}

/** `x_1 <sep> x_2 <sep> \cdots <sep> x_{n}`. */
export const sequence = (x: string, sep: string) => `${x}_1 ${sep} ${x}_2 ${sep} \\cdots ${sep} ${x}_{\${1:n}}$0`;
