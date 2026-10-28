// Linkwarden for the catalog: the `save` tool. The request goes out through Atlas's core (`/api/plugins/<id>/fetch`),
// which adds the token from the secret store — the helper never holds it — and keeps to the manifest's `net`.
// Tests: helper.test.ts.
import type { Params } from "atlas-helper";

type Ids = Record<string, string>;

// the best address a thing's IDs give, in this order
const FROM_IDS: [string, (id: string) => string][] = [
  ["doi", (id) => `https://doi.org/${id}`], ["arxiv", (id) => `https://arxiv.org/abs/${id}`],
  ["youtube", (id) => `https://www.youtube.com/watch?v=${id}`], ["imdb", (id) => `https://www.imdb.com/title/${id}/`],
];

/** The address to save: the thing's own link, else the best one its IDs give, else where it came from. */
export function linkOf(ids: Ids, props: Record<string, string>): string | null {
  if (ids.url) return ids.url;
  for (const [key, make] of FROM_IDS) if (ids[key]) return make(ids[key]);
  return props.source || null;
}

async function save(params: Params) {
  const settings = params.settings ?? {};
  const base = String(settings.address ?? "").trim().replace(/\/+$/, "");
  if (!base) return { fields: {}, skipped: "no Linkwarden address in Settings → Catalog · Linkwarden" };
  const ids = (params.ids ?? {}) as Ids, props = (params.props ?? {}) as Record<string, string>;
  const url = linkOf(ids, props);
  if (!url) return { fields: {}, skipped: "nothing to link to" };
  const options = (params.options ?? {}) as { tags?: string[]; collection?: string };
  const tags = [...new Set([...((settings.tags as string[] | undefined) ?? []), ...(options.tags ?? [])])];
  const body = {
    url,
    name: props.title || url,
    description: props.description || "",
    tags: tags.map((name) => ({ name })),
    collection: { name: options.collection || params.library || "Atlas" },
  };
  // the token is put in by the core; none set (a Linkwarden behind the sign-in in front): no header
  const token = Boolean(await atlas.secret("token"));
  const res = await atlas.fetchResponse({
    url: `${base}/api/v1/links`,
    method: "POST",
    headers: { ...(token ? { Authorization: { secret: "token", prefix: "Bearer " } } : {}), "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (res.signin) return { signin: res.signin }; // a gate in front (Authelia…): Atlas has offered the sign-in
  if (res.status === 409) return { fields: {}, already: true }; // already there: the note keeps pointing at it
  if (!res.ok) throw new atlas.AtlasError(`Linkwarden answered ${res.status}: ${String(res.text ?? "").slice(0, 200)}`, res.status);
  const id = JSON.parse(res.text || "{}").response?.id;
  return { fields: id !== undefined && id !== null ? { linkwarden: `${base}/links/${id}` } : {} };
}

atlas.methods({ save });
