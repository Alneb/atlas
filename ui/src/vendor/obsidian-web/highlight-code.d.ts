// Hand-written types for the vendored highlight-code.js.
import type { CodeRange } from "./live-preview";
interface HljsLike {
  getLanguage(name: string): unknown;
  highlight(code: string, opts: { language: string; ignoreIllegals?: boolean }): { value: string };
}
export function spansFromHljsHtml(html: string): CodeRange[];
export function createCodeHighlighter(getHljs: () => HljsLike | null, limit?: number): (code: string, lang: string) => CodeRange[];
