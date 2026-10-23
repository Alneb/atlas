// Sections plugins draw on their page in Settings (`atlas.plugin.registerSettingsSection`, plugin API 12), by plugin
// id. No imports of the plugin machinery: plugins.svelte.ts registers into it.
import type { SettingsSection } from "./plugin-api";

export const sections = $state<Record<string, SettingsSection[]>>({});

export function addSettingsSection(plugin: string, s: SettingsSection): () => void {
  sections[plugin] = [...(sections[plugin] ?? []).filter((x) => x.id !== s.id), s];
  return () => { sections[plugin] = (sections[plugin] ?? []).filter((x) => x !== s); };
}
