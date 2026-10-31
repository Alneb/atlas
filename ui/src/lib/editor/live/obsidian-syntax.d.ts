// Hand-written types for obsidian-syntax.js.
import type { MarkdownExtension } from "@lezer/markdown";
export const obsidianMarkdown: MarkdownExtension[];
export function isIconToken(text: string): boolean;
/** A task box with any one status (`[-]`, `[/]`…), as Obsidian reads it; needs GFM's task nodes. */
export const AnyTaskStatus: MarkdownExtension;
