// Built from helper/helper.ts by scripts/dev/plugin-ui.mjs: edit the sources, not this file.
(function() {
	//#region plugins/beta/books/helper/helper.ts
	atlas.methods({ 
	/** {path} (vault-relative .djvu) → {path}: its PDF in the cache (vault-relative), made on first ask. */
as_pdf: async (params) => ({ path: atlas.convert.djvuToPdf(String(params.path ?? "")) }) });
	//#endregion
})();
