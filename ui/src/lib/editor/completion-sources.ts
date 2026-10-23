// The completion sources notes and LaTeX files share (citations, snippets, symbols). Each is ONE stable function:
// languageData providers must return the same function each time, or the completion plugin sees a "new" source on
// every update, drops the result and asks again forever.
import { EditorState } from "@codemirror/state";
import type { CompletionContext } from "@codemirror/autocomplete";
import { citeSource } from "./md-complete";
import { snippetSource, symbolSource } from "./latex-suite";
import { builtinOn } from "../builtin-plugins";
import { settings } from "../settings.svelte";

/** Citations complete while the Library plugin is on and the setting allows it. */
export const citing = (): boolean => builtinOn("library") && (settings.config?.editor.citation_completion ?? true);
const texCiteSource = (ctx: CompletionContext) => (citing() ? citeSource(false)(ctx) : null);
const snippetsOn = () => settings.config?.editor.latex_snippets ?? true;
const mdSnippetSource = snippetSource(false), texSnippetSource = snippetSource(true);
export const mdSymbols = symbolSource(false), texSymbols = symbolSource(true);
export const snippetsMd = (ctx: CompletionContext) => (snippetsOn() ? mdSnippetSource(ctx) : null);
const snippetsTex = (ctx: CompletionContext) => (snippetsOn() ? texSnippetSource(ctx) : null);
export const texCite = EditorState.languageData.of(() => [{ autocomplete: texCiteSource }, { autocomplete: snippetsTex }, { autocomplete: texSymbols }]);
