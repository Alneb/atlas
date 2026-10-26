// The completion sources notes and LaTeX files share (citations, snippets, symbols). Each is ONE stable function:
// languageData providers must return the same function each time, or the completion plugin sees a "new" source on
// every update, drops the result and asks again forever.
import { EditorState } from "@codemirror/state";
import type { CompletionContext, CompletionSource } from "@codemirror/autocomplete";
import { citeSource } from "./md-complete";
import { snippetSource, symbolSource } from "./latex-suite";
import { builtinOn } from "../builtin-plugins";
import { settings } from "../settings.svelte";

/** Citations complete while the Library plugin is on and the setting allows it. */
export const citing = (): boolean => builtinOn("library") && (settings.config?.editor.citation_completion ?? true);
const texCiteSource = (ctx: CompletionContext) => (citing() ? citeSource(false)(ctx) : null);
/** The LaTeX plugin is on and its snippets too: the one test for snippets and their Tab stops. */
export const latexSnippetsOn = (): boolean => builtinOn("latex") && (settings.config?.latex.snippets ?? true);
/** A source of the LaTeX plugin: silent while the plugin (or, for snippets, its snippets) is off. */
const ofLatex = (on: () => boolean, src: (ctx: CompletionContext) => ReturnType<CompletionSource>) => (ctx: CompletionContext) => (on() ? src(ctx) : null);
const latexOn = () => builtinOn("latex");
export const snippetsMd = ofLatex(latexSnippetsOn, snippetSource(false));
const snippetsTex = ofLatex(latexSnippetsOn, snippetSource(true));
export const mdSymbols = ofLatex(latexOn, symbolSource(false));
const texSymbols = ofLatex(latexOn, symbolSource(true));
export const texCite = EditorState.languageData.of(() => [{ autocomplete: texCiteSource }, { autocomplete: snippetsTex }, { autocomplete: texSymbols }]);
