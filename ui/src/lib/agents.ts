// The AI agents the plugins declare (`[[agent]]`, agent_terminals.rs; docs/refactor/REFACTOR-agents-as-plugins.md):
// the list the + menus offer, and what "send the selection" types into one.
import type { AgentDecl } from "./gen/AgentDecl";
import { plugins, pluginOn } from "./plugins.svelte";

export type Agent = AgentDecl & { plugin: string; /** `<plugin>/<id>`: a terminal spec's `agent` */ ref: string };

/** The agents of the plugins that are on, in plugin order. */
export function agentsOn(): Agent[] {
  return plugins.list.filter(pluginOn).flatMap((p) => (p.agents ?? []).map((a) => ({ ...a, plugin: p.id, ref: `${p.id}/${a.id}` })));
}

/** The agent's `send_selection` pattern filled: `{path}`, `{from}`, `{to}`. Without lines (the whole file),
 *  what lies between `{path}` and the end of `{to}` is left out (`@{path}#L{from}-{to} ` → `@notes/a.md `). */
export function fillSelection(pattern: string, path: string, lines?: { from: number; to: number }): string {
  let p = pattern;
  if (!lines) {
    const at = p.indexOf("{path}"), end = p.lastIndexOf("{to}");
    if (at >= 0 && end > at) p = p.slice(0, at + "{path}".length) + p.slice(end + "{to}".length);
  }
  return p.replaceAll("{path}", path).replaceAll("{from}", String(lines?.from ?? "")).replaceAll("{to}", String(lines?.to ?? ""));
}
