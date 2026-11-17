// Jellyfin's helper: the app's player reports where you are (`[media] progress`, every 15 s, on pause, at the end and
// on close — on the phone with no page open), told to Jellyfin's play session so its "continue watching" and played
// marks stay right. The requests come from jf.js's `reportRequests`; the core puts the token in (X-Emby-Token).
// Built into ../helper.js by `node scripts/dev/plugin-ui.mjs plugins/beta/jellyfin`.
import type { Params } from "atlas-helper";
// @ts-ignore — plain JavaScript shared with the page
import { reportRequests } from "../jf.js";

const serverOf = (p: Params) => String(p.settings?.server ?? "").trim().replace(/\/+$/, "");

atlas.methods({
  progress: async (params) => {
    const server = serverOf(params);
    if (!server || !params.secrets?.token) return { skipped: "no Jellyfin address or token (Settings → Plugins → Jellyfin)" };
    const { requests, key } = reportRequests(params) as { requests: [string, object][]; key: object };
    for (const [path, body] of requests)
      await atlas.fetch(`${server}${path}`, { method: "POST", body, headers: { "X-Emby-Token": { secret: "token" } } });
    return { key };
  },
});
