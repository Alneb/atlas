// TubeArchivist: the `archive` tool (the catalog's link for videos). The request goes out through Atlas's core, which
// adds the token and, behind a gate, the kept sign-in; the helper never holds either. Tests: helper.test.ts.
import type { Params } from "atlas-helper";

async function archive(params: Params) {
  const settings = params.settings ?? {};
  const base = String(settings.address ?? "").trim().replace(/\/+$/, "");
  const vid = (params.ids as Record<string, string> | undefined)?.youtube;
  if (!base) return { fields: {}, skipped: "no TubeArchivist address in Settings → TubeArchivist" };
  if (!vid) return { fields: {}, skipped: "not a YouTube video" };
  if (settings.auto === false && !(params.options as Record<string, unknown> | undefined)?.archive) {
    return { fields: {}, skipped: "archiving is switched off (Settings → TubeArchivist)" };
  }
  const token = Boolean(await atlas.secret("token"));
  const res = await atlas.fetchResponse({
    url: `${base}/api/download/`,
    method: "POST",
    headers: { ...(token ? { Authorization: { secret: "token", prefix: "Token " } } : {}), "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ data: [{ youtube_id: vid, status: "pending" }] }),
  });
  if (res.signin) return { signin: res.signin };
  if (!res.ok) throw new Error(`TubeArchivist answered ${res.status}: ${String(res.text ?? "").slice(0, 200)}`);
  return { fields: { tubearchivist: `${base}/video/${vid}/` } };
}

atlas.methods({ archive });
