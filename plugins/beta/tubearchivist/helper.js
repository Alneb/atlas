// Built from helper/helper.ts by scripts/dev/plugin-ui.mjs: edit the sources, not this file.
(function() {
	//#region plugins/beta/tubearchivist/helper/helper.ts
	async function archive(params) {
		const settings = params.settings ?? {};
		const base = String(settings.address ?? "").trim().replace(/\/+$/, "");
		const vid = params.ids?.youtube;
		if (!base) return {
			fields: {},
			skipped: "no TubeArchivist address in Settings → TubeArchivist"
		};
		if (!vid) return {
			fields: {},
			skipped: "not a YouTube video"
		};
		if (settings.auto === false && !params.options?.archive) return {
			fields: {},
			skipped: "archiving is switched off (Settings → TubeArchivist)"
		};
		const token = Boolean(await atlas.secret("token"));
		const res = await atlas.fetchResponse({
			url: `${base}/api/download/`,
			method: "POST",
			headers: {
				...token ? { Authorization: {
					secret: "token",
					prefix: "Token "
				} } : {},
				"Content-Type": "application/json",
				Accept: "application/json"
			},
			body: JSON.stringify({ data: [{
				youtube_id: vid,
				status: "pending"
			}] })
		});
		if (res.signin) return { signin: res.signin };
		if (!res.ok) throw new Error(`TubeArchivist answered ${res.status}: ${String(res.text ?? "").slice(0, 200)}`);
		return { fields: { tubearchivist: `${base}/video/${vid}/` } };
	}
	atlas.methods({ archive });
	//#endregion
})();
