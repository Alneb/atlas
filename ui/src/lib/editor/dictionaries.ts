// The machine's Hunspell dictionaries, as the Spelling and Predictor plugins use them: which are installed (their
// helpers list the folders with `ls`, read the files with `cat`), which a language takes, and a dictionary's plain word
// list (its stems) for finishing a word. Pure but for the `exec` a helper passes in.

/** What a helper's `atlas.exec` gives back. */
export type Exec = (cmd: string, args: string[], opts?: { timeout?: number }) => Promise<{ status: number; stdout: string; stderr: string }>;

/** Where systems keep Hunspell dictionaries, the setting's folder first. */
const folders = (own: unknown) => [typeof own === "string" ? own.trim() : "", "/usr/share/hunspell", "/usr/share/myspell", "/usr/share/myspell/dicts"].filter(Boolean);

/** Each installed dictionary (`en_US`) with its folder, the first folder holding a name winning. */
export async function installedDictionaries(exec: Exec, own: unknown): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  for (const dir of folders(own)) {
    let r;
    try { r = await exec("ls", [dir]); } catch { return found; } // no `ls` (the phone): no dictionaries
    if (r.status !== 0) continue;
    const names = new Set(r.stdout.split("\n"));
    for (const n of names) {
      const m = /^([A-Za-z]{2,3}(?:[_-][A-Za-z0-9]+)*)\.dic$/.exec(n);
      if (m && names.has(`${m[1]}.aff`) && !found.has(m[1])) found.set(m[1], dir);
    }
  }
  return found;
}

/** One dictionary's file (`aff` or `dic`), as text. */
export async function dictionaryFile(exec: Exec, own: unknown, name: string, ext: "aff" | "dic"): Promise<string> {
  const dir = (await installedDictionaries(exec, own)).get(name);
  if (!dir) throw new Error(`no Hunspell dictionary named ${name}`);
  const r = await exec("cat", [`${dir}/${name}.${ext}`], { timeout: 30 });
  if (r.status !== 0) throw new Error(r.stderr || `could not read ${name}.${ext}`);
  return r.stdout;
}

/** The dictionaries a language uses when the setting names none: of each group, the first installed. English takes
 *  both the American and the British one, so either spelling (centered, centred) is right. */
const PREFERRED: Record<string, string[][]> = { en: [["en_US", "en_CA"], ["en_GB", "en_AU"]], es: [["es_ES", "es_MX", "es_AR"]], fr: [["fr_FR", "fr_CA"]], de: [["de_DE"]] };

/** language → dictionary names: the preferred installed ones, under the setting's choices (`en=en_GB, es=es_MX+es_AR`). */
export function chooseDictionaries(installed: string[], setting: unknown): Map<string, string[]> {
  const chosen = new Map<string, string[]>();
  for (const [lang, groups] of Object.entries(PREFERRED)) {
    const names = groups.map((g) => g.find((x) => installed.includes(x))).filter((x): x is string => !!x);
    if (names.length) chosen.set(lang, names);
  }
  for (const part of String(setting ?? "").split(/[,\s]+/)) {
    const m = /^([a-z]{2,3})=([\w+-]+)$/.exec(part.trim());
    const names = m?.[2].split("+").filter((n) => installed.includes(n)) ?? [];
    if (m && names.length) chosen.set(m[1], names);
  }
  return chosen;
}

/** A `.dic` file's words without their affix flags, lower-case words only (names are the vault's to teach), sorted. */
export function dicStems(dic: string): string[] {
  const out = new Set<string>();
  for (const line of dic.split("\n").slice(1)) {
    const w = line.split("/")[0].split(/\s/)[0];
    if (/^\p{Ll}[\p{Ll}\p{M}'’-]*$/u.test(w)) out.add(w);
  }
  return [...out].sort();
}
