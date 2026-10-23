// The agent's own files (`editor.index_exclude`: memories, session logs, its instructions) are not
// the user's notes. The core keeps them out of the index and of search; this is the same pattern
// rule (config.rs `matches_any`) for the one place the UI decides alone: resolving a link by name.
import { settings } from "./settings.svelte";

/** A pattern with a `/` names one place (`/docs`, `docs/memory`); a bare name matches at any depth. */
export function isAgentFile(rel: string): boolean {
  return (settings.config?.editor.index_exclude ?? []).some((raw) => {
    const pat = raw.replace(/^\/+|\/+$/g, "");
    if (raw.startsWith("/") || pat.includes("/")) return rel === pat || rel.startsWith(`${pat}/`);
    return rel.split("/").includes(pat);
  });
}
