// The first lines of a text file, as the explorer's Thumbnails view draws them on a tile (file-sources.svelte.ts).

const PROPS = /^﻿?---\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/;

/** The start of a file worth reading on a tile: a note's properties left out (all of the head when they fill it), a
 *  line cut short dropped. */
export function excerptOf(head: string, whole: boolean): string {
  let t = head.replace(PROPS, "");
  if (t === head && /^﻿?---\r?\n/.test(head)) return "";
  if (!whole && t.includes("\n")) t = t.slice(0, t.lastIndexOf("\n"));
  return t.replace(/\r/g, "").replace(/^\s*\n/, "").trimEnd();
}
