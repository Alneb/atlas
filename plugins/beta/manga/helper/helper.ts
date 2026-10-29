// Manga: a comic archive the page cannot read (.cbr, .cb7, .cbt) made once into a .cbz in the plugin's cache, which the
// reader then opens like any .cbz. The core unpacks zip, tar and 7z itself, on every platform; a RAR needs bsdtar,
// unar or unrar on the machine. The vault's file is never touched.
import type { Params } from "atlas-helper";

atlas.methods({
  /** {path} (vault-relative .cbr/.cb7/.cbt) → {path}: its .cbz in the cache (vault-relative), made on first ask. */
  as_cbz: async (params: Params) => ({ path: atlas.convert.comicToCbz(String(params.path ?? "")) }),
});
