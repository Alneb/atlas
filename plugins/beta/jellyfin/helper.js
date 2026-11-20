// Built from helper/helper.ts by scripts/dev/plugin-ui.mjs: edit the sources, not this file.
(function() {
	// plugins/beta/jellyfin/jf.js
	/** Jellyfin counts time in ticks of 100 ns. */
	const TICKS = 1e7;
	const ticks = (s) => Math.round(Math.max(0, Number(s) || 0) * TICKS);
	/** A player's report (`[media] progress`) → the requests that tell Jellyfin, in order, and the key for the next one.
	*  The first report opens the play session (`/Sessions/Playing`); a pause or a tick is a progress; the end and a
	*  close stop it (Jellyfin marks a film played when it stopped near its end). */
	function reportRequests(report) {
		const key = report.key ?? {};
		if (!key.item) throw new Error("a report with no item (key.item)");
		const base = {
			ItemId: key.item,
			MediaSourceId: key.item,
			PositionTicks: ticks(report.at),
			PlayMethod: "DirectPlay",
			CanSeek: true
		};
		const out = [];
		const stopping = report.state === "closed" || report.state === "ended";
		if (!key.started && !stopping) out.push(["/Sessions/Playing", base]);
		if (stopping) out.push(["/Sessions/Playing/Stopped", base]);
		else out.push(["/Sessions/Playing/Progress", {
			...base,
			IsPaused: report.state === "paused",
			EventName: report.state === "paused" ? "Pause" : "TimeUpdate"
		}]);
		return {
			requests: out,
			key: stopping ? { item: key.item } : {
				item: key.item,
				started: true
			}
		};
	}
	// plugins/beta/jellyfin/helper/helper.ts
	const serverOf = (p) => String(p.settings?.server ?? "").trim().replace(/\/+$/, "");
	atlas.methods({ progress: async (params) => {
		const server = serverOf(params);
		if (!server || !params.secrets?.token) return { skipped: "no Jellyfin address or token (Settings → Plugins → Jellyfin)" };
		const { requests, key } = reportRequests(params);
		for (const [path, body] of requests) await atlas.fetch(`${server}${path}`, {
			method: "POST",
			body,
			headers: { "X-Emby-Token": { secret: "token" } }
		});
		return { key };
	} });
})();
