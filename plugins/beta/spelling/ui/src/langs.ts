// Which languages are checked, from the installed dictionaries and three settings (all written by Settings → Spelling's
// own section, never typed): `languages` (the ones turned on; absent: the usual ones), `language` (the main one, for a
// note too short to tell) and `dictionaries` (`en=en_GB, es=es_MX`: a language's variant other than the usual).
import { chooseDictionaries } from "../../../../../ui/src/lib/editor/dictionaries";

export const langOf = (dict: string) => dict.split(/[_-]/)[0].toLowerCase();

export interface Languages {
  /** every installed language → the dictionaries it uses (the setting's variant, else the usual ones, else the first) */
  chosen: Map<string, string[]>;
  /** the installed languages, in a stable order */
  available: string[];
  /** the ones turned on: what notes are guessed among and checked against */
  langs: string[];
  /** the main one */
  main: string;
  /** what is on when `languages` was never set: English, Spanish, French, German as installed, and any the variants name */
  usual: string[];
}

export function languagesFrom(installed: string[], settings: Record<string, unknown>): Languages {
  const chosen = chooseDictionaries(installed, settings.dictionaries);
  const usual = [...chosen.keys()];
  for (const d of [...installed].sort()) if (!chosen.has(langOf(d))) chosen.set(langOf(d), [d]);
  const available = [...chosen.keys()];
  const picked = Array.isArray(settings.languages) ? settings.languages.map(String).filter((l) => chosen.has(l)) : [];
  const langs = picked.length ? available.filter((l) => picked.includes(l)) : usual;
  const want = String(settings.language ?? "");
  return { chosen, available, langs, usual, main: langs.includes(want) ? want : langs[0] ?? (want || "en") };
}

/** The `dictionaries` setting as language → variant (`es_MX`, or `es_MX+es_AR`). */
export function parseVariants(setting: unknown): Map<string, string> {
  const out = new Map<string, string>();
  for (const part of String(setting ?? "").split(/[,\s]+/)) {
    const m = /^([a-z]{2,3})=([\w+-]+)$/.exec(part.trim());
    if (m) out.set(m[1], m[2]);
  }
  return out;
}

/** Back to the setting's text; null (the setting taken out) when no language has a variant of its own. */
export function writeVariants(v: Map<string, string>): string | null {
  return v.size ? [...v].map(([l, d]) => `${l}=${d}`).join(", ") : null;
}

/** The `languages` setting for this set: null (taken out) when it is the usual one, so new dictionaries follow the default. */
export function writeLanguages(on: string[], l: Languages): string[] | null {
  const list = l.available.filter((x) => on.includes(x));
  return list.length === l.usual.length && list.every((x) => l.usual.includes(x)) ? null : list;
}
