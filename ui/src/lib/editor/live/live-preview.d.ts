// Hand-written types for live-preview.js (only the surface Atlas uses).
import type { Extension, EditorState, StateEffectType, Text } from "@codemirror/state";
import type { DecorationSet } from "@codemirror/view";

export interface CodeRange { from: number; to: number; cls: string }
export interface LivePreviewOptions {
  resolveAttachment?: (src: string) => string | null;
  linkResolves?: (target: string) => boolean;
  highlightCode?: (code: string, lang: string) => CodeRange[];
  renderMath?: (host: HTMLElement, source: string, block: boolean) => void;
  blockHtml?: (source: string) => string | null;
  hydrateBlock?: (host: HTMLElement) => Promise<unknown> | null | void;
  /** A hydrated host's DOM left the editor for good: undo what hydrateBlock mounted. */
  releaseBlock?: (host: HTMLElement) => void;
  inlineTitle?: (state: import("@codemirror/state").EditorState) => { key: string; render: () => HTMLElement } | null;
  /** A task box clicked: true when the caller ticked it (else the box only flips). */
  toggleTask?: (view: import("@codemirror/view").EditorView, line: number) => boolean;
  /** Receives the frontmatter source, fences included. */
  noteProperties?: (frontmatter: string) => { key: string; render: () => HTMLElement } | null;
  /** Raw `<img …>` / `<br>` source → sanitized HTML for an inline widget, or null. */
  inlineHtml?: (source: string) => string | null;
  icon?: (name: string) => HTMLElement | null;
}
export function livePreview(options?: LivePreviewOptions): [Extension, Extension];
export function buildDecorations(state: EditorState, ranges: { from: number; to: number }[], options?: LivePreviewOptions): DecorationSet;
export function bodyStart(doc: Text): number;
/** Rebuild the decorations although the document did not change (a setting changed a builder). */
export const redecorate: StateEffectType<null>;
