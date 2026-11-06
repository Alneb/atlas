// The Hunspell dictionaries the Spelling and Predictor plugins use: which are there, which a language takes, and a
// dictionary's plain word list (its stems) for finishing a word. Pure but for the file access a helper passes in.
//
// Two places hold dictionaries. The vault's own `.atlas/dictionaries/` comes first: read through the vault's file API,
// it works on every device (the server and the phone have no system dictionaries, nor `ls`). Then the machine's
// folders (the setting's, /usr/share/hunspell…), read with `ls` and `cat`. A machine that has a language's dictionary
// copies it into the vault (`keepInVault`), so every device sharing the vault checks that language too.

/** What a helper's `atlas.exec` gives back. */
export type Exec = (cmd: string, args: string[], opts?: { timeout?: number }) => Promise<{ status: number; stdout: string; stderr: string }>;

/** One place's files: a folder's file names (null: no such folder, or no way to look), and a file's text. */
export type Files = { list(dir: string): Promise<string[] | null>; read(path: string): Promise<string> };

/** The vault's folder of dictionaries (synced with the vault, unlike the machine's). */
export const VAULT_DICTIONARIES = ".atlas/dictionaries";

/** The vault, through a helper's `atlas`. */
export const vaultFiles = (atlas: { tree(dir: string): Promise<{ name: string; kind: string }[]>; read(path: string): Promise<string> }): Files => ({
  list: (dir) => atlas.tree(dir).then((t) => t.filter((e) => e.kind === "file").map((e) => e.name), () => null),
  read: (path) => atlas.read(path),
});

/** The machine, through `ls` and `cat` (none on the phone: nothing found there). */
export const machineFiles = (exec: Exec): Files => ({
  list: async (dir) => {
    try { const r = await exec("ls", [dir]); return r.status === 0 ? r.stdout.split("\n") : null; } catch { return null; }
  },
  read: async (path) => {
    const r = await exec("cat", [path], { timeout: 30 });
    if (r.status !== 0) throw new Error(r.stderr || `could not read ${path}`);
    if (!r.stdout.includes("\uFFFD")) return r.stdout;
    // not UTF-8: older dictionaries (en_GB on some systems) are ISO-8859-1, which `exec`'s text output mangles. The
    // bytes again, through base64 (GNU's -w0, else BSD's unwrapped default), each byte its Latin-1 character.
    for (const args of [["-w0", path], [path]]) {
      const b = await exec("base64", args, { timeout: 30 }).catch(() => null);
      if (b?.status === 0) return latin1(b.stdout.replace(/\s+/g, ""));
    }
    return r.stdout;
  },
});

/** Base64 → a string whose characters are the bytes (Latin-1); no atob in every helper runtime. */
export function latin1(b64: string): string {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "", bits = 0, n = 0;
  for (const c of b64) {
    const v = A.indexOf(c);
    if (v < 0) continue; // "=" padding
    bits = (bits << 6) | v; n += 6;
    if (n >= 8) { n -= 8; out += String.fromCharCode((bits >> n) & 0xff); }
  }
  return out;
}

/** Where a dictionary was found. */
export type Found = { files: Files; dir: string; inVault: boolean };

/** The places to look, in order: the vault's folder, the setting's folder, the systems' usual ones. */
function places(vault: Files, machine: Files, own: unknown): Found[] {
  const mine = typeof own === "string" ? own.trim() : "";
  return [{ files: vault, dir: VAULT_DICTIONARIES, inVault: true },
    ...[mine, "/usr/share/hunspell", "/usr/share/myspell", "/usr/share/myspell/dicts"].filter(Boolean).map((dir) => ({ files: machine, dir, inVault: false }))];
}

/** Each dictionary there is (`en_US`) and where, the first place holding a name winning. */
export async function installedDictionaries(vault: Files, machine: Files, own: unknown): Promise<Map<string, Found>> {
  const found = new Map<string, Found>();
  for (const place of places(vault, machine, own)) {
    const listed = await place.files.list(place.dir);
    if (!listed) continue;
    const names = new Set(listed);
    for (const n of names) {
      const m = /^([A-Za-z]{2,3}(?:[_-][A-Za-z0-9]+)*)\.dic$/.exec(n);
      if (m && names.has(`${m[1]}.aff`) && !found.has(m[1])) found.set(m[1], place);
    }
  }
  return found;
}

/** One dictionary's file (`aff` or `dic`), as text. */
export async function dictionaryFile(vault: Files, machine: Files, own: unknown, name: string, ext: "aff" | "dic"): Promise<string> {
  const at = (await installedDictionaries(vault, machine, own)).get(name);
  if (!at) throw new Error(`no Hunspell dictionary named ${name}`);
  return at.files.read(`${at.dir}/${name}.${ext}`);
}

/** Copies the named dictionaries found only on this machine into the vault's folder; the names copied. */
export async function keepInVault(vault: Files, machine: Files, own: unknown, names: string[], write: (path: string, text: string) => Promise<unknown>): Promise<string[]> {
  const all = await installedDictionaries(vault, machine, own);
  const kept: string[] = [];
  for (const name of names) {
    const at = all.get(name);
    if (!at || at.inVault) continue;
    // the .aff last: a dictionary counts as there once both files are, so a copy cut short is never half-used
    // written as UTF-8 whatever the source's encoding (read above as characters), so the .aff says so
    for (const ext of ["dic", "aff"] as const) {
      const text = await at.files.read(`${at.dir}/${name}.${ext}`);
      await write(`${VAULT_DICTIONARIES}/${name}.${ext}`, ext === "aff" ? text.replace(/^SET\s+\S+/m, "SET UTF-8") : text);
    }
    kept.push(name);
  }
  return kept;
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
