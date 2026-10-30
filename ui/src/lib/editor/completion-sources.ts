// The completion sources notes and LaTeX files share (citations, symbols). Each is ONE stable function:
// languageData providers must return the same function each time, or the completion plugin sees a "new" source on
// every update, drops the result and asks again forever.
import { EditorState } from "@codemirror/state";
import type { CompletionContext, CompletionSource } from "@codemirror/autocomplete";
import { citeSource } from "./md-complete";
import type { CompletionResult } from "@codemirror/autocomplete";
import { placeAt } from "./math-context";
import { builtinOn } from "../builtin-plugins";
import { settings } from "../settings.svelte";

/** Citations complete while the Library plugin is on and the setting allows it. */
export const citing = (): boolean => builtinOn("library") && (settings.config?.editor.citation_completion ?? true);
const texCiteSource = (ctx: CompletionContext) => (citing() ? citeSource(false)(ctx) : null);
/** A source of the LaTeX plugin: silent while the plugin is off. */
const ofLatex = (on: () => boolean, src: (ctx: CompletionContext) => ReturnType<CompletionSource>) => (ctx: CompletionContext) => (on() ? src(ctx) : null);
const latexOn = () => builtinOn("latex");

const SYMBOLS = ("alpha beta gamma Gamma delta Delta epsilon varepsilon zeta eta theta vartheta Theta iota kappa lambda Lambda mu nu xi Xi pi Pi rho varrho sigma varsigma Sigma tau upsilon Upsilon phi varphi Phi chi psi Psi omega Omega "
  + "langle rangle lvert rvert lVert rVert lfloor rfloor lceil rceil hbar hslash ell nabla partial infty mathbb mathbf mathcal mathrm mathfrak mathscr mathit boldsymbol text textbf textit operatorname overline underline "
  + "overbrace underbrace widehat widetilde hat bar tilde vec dot ddot sqrt frac dfrac tfrac binom left right bigl bigr sum prod int iint oint lim limsup liminf sup inf max min exp log ln sin cos tan cot sec csc sinh cosh tanh arcsin "
  + "arccos arctan det dim ker deg gcd cdot cdots ldots dots vdots ddots times div pm mp leq geq neq approx equiv sim simeq propto cong to mapsto rightarrow leftarrow Rightarrow Leftarrow leftrightarrow Leftrightarrow uparrow downarrow "
  + "forall exists in notin subset subseteq supset supseteq cup cap setminus emptyset varnothing wedge vee oplus otimes dagger quad qquad angle triangle top bot bra ket braket").split(" ");

/** `\\alpha`, `\\nabla`…: command names in math, from two letters on (with or without the backslash). */
const symbolSource = (path: (ctx: CompletionContext) => string) => (ctx: CompletionContext): CompletionResult | null => {
  const word = ctx.matchBefore(/\\?[A-Za-z]{2,}$/);
  if (!word) return null;
  const place = placeAt(ctx.state, ctx.pos, path(ctx));
  if (place.kind !== "math" || place.textArg) return null;
  const typed = word.text.replace(/^\\/, "").toLowerCase();
  const found = SYMBOLS.filter((s) => s.toLowerCase().startsWith(typed) && s !== word.text.replace(/^\\/, "")).sort((a, b) => a.length - b.length || a.localeCompare(b)).slice(0, 40);
  return found.length ? { from: word.from, options: found.map((s) => ({ label: `\\${s}`, type: "constant" })), filter: false } : null;
};
export const mdSymbols = ofLatex(latexOn, symbolSource(() => "a.md"));
const texSymbols = ofLatex(latexOn, symbolSource(() => "a.tex"));
export const texCite = EditorState.languageData.of(() => [{ autocomplete: texCiteSource }, { autocomplete: texSymbols }]);
