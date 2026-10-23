// Tools a plugin adds to the side panel (`atlas.shell.sideTool`), next to Files / Search / Outline /
// Git. A side tool is a block that lives in the side zone: in the left bar it is mounted like the
// four built-in tools, beside the editors it is a tab of the side column. No imports: the dock, the
// panes and the side panel all ask this list.
import type { IconName } from "./panes";

export interface SideTool { plugin: string; /** the block type that draws it */ type: string; title: string; icon: IconName }
export const sideTools = $state<SideTool[]>([]);

export function addSideTool(t: SideTool): () => void {
  const i = sideTools.findIndex((x) => x.type === t.type);
  if (i >= 0) sideTools.splice(i, 1, t); else sideTools.push(t);
  return () => { const j = sideTools.findIndex((x) => x.type === t.type && x.plugin === t.plugin); if (j >= 0) sideTools.splice(j, 1); };
}

/** How the side panel names a plugin's tool (the built-in ones are named by their pane kind). */
export const TOOL = "tool:";
export const toolId = (type: string): `tool:${string}` => `${TOOL}${type}`;
const typeOf = (src: string) => /^\s*(?:type|view):\s*["']?([\w.-]+)/m.exec(src)?.[1] ?? "";
/** The side tool a block's text is, if it is one. */
export const sideToolOf = (src: string): SideTool | undefined => { const t = typeOf(src); return t ? sideTools.find((x) => x.type === t) : undefined; };
