// A completion list goes the moment nothing can complete at the caret. CodeMirror keeps an open list on screen
// (greyed, "disabled") until typing pauses for its debounce and every running source has answered, so fast typing
// or a slow core left a stale list over the text. So each source comes with a synchronous test of its own, and the
// one that makes the list optional cannot be forgotten: a note's sources are all GatedSources.
import { autocompletion, closeCompletion, completionStatus, CompletionContext, type CompletionSource } from "@codemirror/autocomplete";
import { EditorView } from "@codemirror/view";
import type { Extension } from "@codemirror/state";

export interface GatedSource {
  /** Could this source offer anything at the caret? Asked at every key while a list shows: no I/O. */
  applies: (ctx: CompletionContext) => boolean;
  answer: CompletionSource;
}

/** A source that already answers synchronously is its own test. */
export const syncSource = (answer: (ctx: CompletionContext) => ReturnType<CompletionSource> | null): GatedSource =>
  ({ applies: (ctx) => answer(ctx) != null, answer });

/** How long typing must pause before the sources are asked; CodeMirror's 100 ms is longer than the gap between keys
 *  of fast typing, so a source the test cannot rule out (a to-do line: the core decides) was never asked in a burst. */
const ASK_AFTER_MS = 30;

/** `autocompletion` over gated sources, with the stale list closed at once. */
export function gatedCompletion(sources: GatedSource[], config: Omit<NonNullable<Parameters<typeof autocompletion>[0]>, "override" | "activateOnTypingDelay">): Extension {
  let explicit = false; // a list asked for by hand (Ctrl+Space) stays while its explicit sources still apply
  return [
    autocompletion({
      ...config,
      activateOnTypingDelay: ASK_AFTER_MS,
      override: sources.map((s) => (ctx) => {
        explicit = ctx.explicit;
        return s.applies(ctx) ? s.answer(ctx) : null;
      }),
    }),
    EditorView.updateListener.of((u) => {
      // only a list on screen: every key in prose is "pending" too, and needs no second transaction
      if (!u.docChanged || completionStatus(u.state) !== "pending" || !u.view.dom.querySelector(".cm-tooltip-autocomplete")) return;
      const ctx = new CompletionContext(u.state, u.state.selection.main.head, explicit);
      if (!sources.some((s) => s.applies(ctx))) closeCompletion(u.view);
    }),
  ];
}
