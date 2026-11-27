// Paperless's helper: the agent's tools (`atlas mcp`: paperless_search, paperless_get). An agent finds a document by
// Paperless's own full-text search (its OCR'd text, tags, correspondents) and reads one whole, with no page open.
// The shapes are pl.js's; the core puts the token in (`Authorization: Token …`). Built into ../helper.js by
// `node scripts/dev/plugin-ui.mjs plugins/beta/paperless`.
import type { Params } from "atlas-helper";
// @ts-ignore — plain JavaScript shared with the page
import { forAgent, listPath, namesOf, rowOf } from "../pl.js";

const serverOf = (p: Params) => String(p.settings?.server ?? "").trim().replace(/\/+$/, "");
const auth = { Authorization: { secret: "token", prefix: "Token " }, Accept: "application/json" };

/** The server, or the reason there is none to ask. */
function ready(p: Params): string {
  const server = serverOf(p);
  if (!server) throw new Error("no Paperless address (Settings → Plugins → Paperless)");
  if (!p.secrets?.token) throw new Error("no Paperless API token (Settings → Plugins → Paperless)");
  return server;
}

async function names(server: string) {
  const ask = (l: string) => atlas.fetchJson(`${server}/api/${l}/?page_size=1000`, { headers: auth }).catch(() => ({}));
  const [tags, correspondents, types] = await Promise.all([ask("tags"), ask("correspondents"), ask("document_types")]);
  return { tags: namesOf(tags), correspondents: namesOf(correspondents), types: namesOf(types) };
}

atlas.methods({
  /** The documents Paperless's full-text search finds, best first (at most `limit`, default 20). */
  search: async (p) => {
    const server = ready(p);
    const query = String(p.query ?? "").trim();
    if (!query) throw new Error("say what to search for (query)");
    const limit = Math.min(100, Math.max(1, Number(p.limit) || 20));
    const [answer, n] = await Promise.all([atlas.fetchJson(`${server}${listPath(1, query)}`, { headers: auth, timeout: 30 }), names(server)]);
    const docs = (answer?.results ?? []).slice(0, limit).map((d: unknown) => forAgent(rowOf(d, n), server));
    return { count: Number(answer?.count ?? docs.length), documents: docs };
  },
  /** One document with its whole text (what Paperless's OCR read). */
  get: async (p) => {
    const server = ready(p);
    const id = Number(p.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("say which document (id, a number)");
    const [d, n] = await Promise.all([atlas.fetchJson(`${server}/api/documents/${id}/`, { headers: auth, timeout: 30 }), names(server)]);
    if (!d) throw new Error(`Paperless has no document ${id}`);
    return forAgent(rowOf(d, n), server, true);
  },
});
