// Built from helper/helper.ts by scripts/dev/plugin-ui.mjs: edit the sources, not this file.
(function(exports) {
	Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
	//#region plugins/beta/downloader/helper/helper.ts
	/** `{name}` in a template replaced by each value, put through `quote` (JSON-escaped in a body, URL-escaped in an address). */
	function fill(template, values, quote) {
		return Object.entries(values).reduce((out, [k, v]) => out.replaceAll(`{${k}}`, quote(String(v ?? ""))), template);
	}
	/** A value inside a JSON string: its escapes, without the quotes. */
	const jsonInner = (v) => JSON.stringify(v).slice(1, -1);
	/** Every reserved character escaped (an address's query part). */
	const urlPart = (v) => atlas.url.quote(v, "");
	const JSON_HEADERS = {
		"Content-Type": "application/json",
		Accept: "application/json"
	};
	function presetOf(s) {
		return s.preset === "MeTube" || s.preset === "TubeArchivist" ? s.preset : "custom";
	}
	/** The note property the answer goes in: the setting, else the preset's own. */
	function answerOf(s) {
		return String(s.answer ?? "").trim() || (presetOf(s) === "TubeArchivist" ? "tubearchivist" : "downloaded");
	}
	/** The request a preset makes for `t` (null: it cannot take this thing), and the value the note keeps. */
	async function requestFor(s, t) {
		const address = String(s.address ?? "").trim(), base = address.replace(/\/+$/, "");
		const hasToken = Boolean(await atlas.secret("token"));
		switch (presetOf(s)) {
			case "TubeArchivist": {
				if (!t.youtube) return { skipped: "TubeArchivist takes only YouTube videos" };
				const headers = {
					...JSON_HEADERS,
					...hasToken ? { Authorization: {
						secret: "token",
						prefix: "Token "
					} } : {}
				};
				const body = JSON.stringify({ data: [{
					youtube_id: t.youtube,
					status: "pending"
				}] });
				return {
					req: {
						url: `${base}/api/download/`,
						method: "POST",
						headers,
						body
					},
					value: `${base}/video/${t.youtube}/`
				};
			}
			case "MeTube": {
				const body = JSON.stringify({
					url: t.url,
					quality: "best",
					format: t.kind === "song" ? "mp3" : "any"
				});
				return {
					req: {
						url: `${base}/add`,
						method: "POST",
						headers: { ...JSON_HEADERS },
						body
					},
					value: "requested"
				};
			}
			case "custom": {
				const values = {
					url: t.url,
					kind: t.kind,
					title: t.title,
					artist: t.artist,
					id: t.youtube
				};
				const method = String(s.method || "POST").toUpperCase();
				const headers = { ...JSON_HEADERS };
				const header = String(s.header ?? "").trim();
				if (header && hasToken) headers[header] = { secret: "token" };
				const req = {
					url: fill(address, values, urlPart),
					method,
					headers
				};
				if (method !== "GET") {
					req.body = fill(String(s.body || "{\"url\": \"{url}\"}"), values, jsonInner);
					JSON.parse(req.body);
				}
				return {
					req,
					value: "requested"
				};
			}
		}
	}
	async function send(params) {
		const s = params.settings ?? {};
		const kind = String(params.kind ?? "");
		const answer = answerOf(s);
		const note = params.note ?? {};
		if (String(note[answer] ?? "").trim()) return {};
		if (!(s.kinds ?? ["song"]).includes(kind)) return {
			fields: {},
			skipped: `${kind} is not sent (Settings → Downloader → Kinds to send)`
		};
		const options = params.options ?? {};
		if (s.auto === false && !options.send && !options.archive) return {
			fields: {},
			skipped: "sending is switched off (Settings → Downloader)"
		};
		const ids = params.ids ?? {}, props = params.props ?? {};
		const url = ids.url || props.source;
		if (!url || !String(s.address ?? "").trim()) return {
			fields: {},
			skipped: "no address to send, or no download service set"
		};
		const made = await requestFor(s, {
			url,
			kind,
			title: props.title,
			artist: props.artist,
			youtube: ids.youtube ?? ""
		});
		if ("skipped" in made) return {
			fields: {},
			skipped: made.skipped
		};
		const res = await atlas.fetchResponse(made.req);
		if (res.signin) return { signin: res.signin };
		if (!res.ok) throw new Error(`the download service answered ${res.status}: ${String(res.text ?? "").slice(0, 200)}`);
		return { fields: { [answer]: made.value } };
	}
	atlas.methods({ send });
	//#endregion
	exports.answerOf = answerOf;
	exports.presetOf = presetOf;
	return exports;
})({});
