// Ephemeral suggestions (docs/guides/MALLEABLE.md R4, Embark): while the caret is in a note's section, views
// that fit its data are offered; accepting inserts concrete text; nothing is ever inserted by itself.
// Providers are plain functions, so plugins add their own (`atlas.registerSuggestion`).
export interface SectionInfo { path: string; heading: string; text: string }
export interface Suggestion { label: string; insert: string }
export type SuggestionProvider = (s: SectionInfo) => Suggestion[];

const DATED = /^\s*[-*] \[[ xX]\] .*(📅\s*\d{4}-\d{2}-\d{2}|due::\s*\d{4}-\d{2}-\d{2}|\b\d{4}-\d{2}-\d{2}\b)/gm;
const hasView = (text: string, type: string) => new RegExp(`^\\s*type:\\s*["']?${type.replace(/\./g, "\\.")}\\b`, "m").test(text);

/** Built in: a section with ≥ 2 dated tasks and no calendar → a calendar of them. */
const datedTasks: SuggestionProvider = (s) => {
  const n = s.text.match(DATED)?.length ?? 0;
  return n >= 2 && !hasView(s.text, "calendar")
    ? [{ label: `Show these ${n} dated tasks as a calendar`, insert: "```view\ntype: calendar\nfrom: section\n```\n" }]
    : [];
};

const providers: SuggestionProvider[] = [datedTasks];

export function registerSuggestion(p: SuggestionProvider): () => void {
  providers.push(p);
  return () => { const i = providers.indexOf(p); if (i >= 0) providers.splice(i, 1); };
}

export function suggestFor(s: SectionInfo): Suggestion[] {
  return providers.flatMap((p) => { try { return p(s); } catch { return []; } });
}
