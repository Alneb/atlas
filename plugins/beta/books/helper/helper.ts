// Books: a DjVu book made once into a PDF in the plugin's cache, which the app's PDF reader then opens — as Manga makes
// a .cbr into a .cbz. The core converts it (djvu-rs: the pages as they are, the book's text selectable), on every
// platform; the vault's file is never touched.
import type { Params } from "atlas-helper";

atlas.methods({
  /** {path} (vault-relative .djvu) → {path}: its PDF in the cache (vault-relative), made on first ask. */
  as_pdf: async (params: Params) => ({ path: atlas.convert.djvuToPdf(String(params.path ?? "")) }),
});
