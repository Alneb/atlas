// Immich's helper: the agent's tool (`atlas mcp`: immich_search) — Immich's smart search (what is in the picture, in
// words: "the whiteboard with the Feynman diagram", "Ana at the beach") answered with when, where and who for each
// photo, so an agent can find one and hand its link back. The shapes are im.js's; the core puts the key in
// (`x-api-key`). Built into ../helper.js by `node scripts/dev/plugin-ui.mjs plugins/beta/immich`.
import type { Params } from "atlas-helper";
// @ts-ignore — plain JavaScript shared with the page
import { forAgent, itemsOf, rowOf, smartBody } from "../im.js";

const serverOf = (p: Params) => String(p.settings?.server ?? "").trim().replace(/\/+$/, "");

atlas.methods({
  search: async (p) => {
    const server = serverOf(p);
    if (!server) throw new Error("no Immich address (Settings → Plugins → Immich)");
    if (!p.secrets?.key) throw new Error("no Immich API key (Settings → Plugins → Immich)");
    const query = String(p.query ?? "").trim();
    if (!query) throw new Error("say what is in the photos to find (query)");
    const answer = await atlas.fetchJson(`${server}/api/search/smart`, { method: "POST", body: smartBody(query, Number(p.limit) || 20), headers: { "x-api-key": { secret: "key" } }, timeout: 60 });
    return { photos: itemsOf(answer).items.map((a: unknown) => forAgent(rowOf(a), server)) };
  },
});
