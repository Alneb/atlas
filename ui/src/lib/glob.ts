// File globs as manifests write them (`*.epub`, `runs/**`): one matcher for `opens`, `claims` and embeds.

/** `*` within a folder, `**` across folders, `?` one character; case-insensitive, the whole path. */
export function globRe(glob: string): RegExp {
  const body = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, "\u0000").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]").replace(/\u0000/g, ".*");
  return new RegExp(`^${body}$`, "i");
}

/** A test for paths matching any of `globs`, by the whole path or by the file's name (`*.epub` matches `books/a.epub`). */
export function globTest(globs: string[]): (path: string) => boolean {
  const res = globs.map(globRe);
  return (path) => res.some((re) => re.test(path) || re.test(path.split("/").pop() ?? path));
}

/** `epub` / `.epub` → `*.epub`; anything with `*`, `?` or `/` is a glob already. */
export const extensionGlob = (p: string): string => (/[*?/]/.test(p) ? p : `*.${p.replace(/^\./, "")}`);
