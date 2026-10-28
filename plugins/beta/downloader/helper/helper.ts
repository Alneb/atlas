// Downloader: the `send` tool. One request, shaped by the settings, through Atlas's core (the token and the kept
// sign-in are added there). Kinds not listed in the settings are left alone. Tests: helper.test.ts.
import type { Params } from "atlas-helper";

/** `{name}` in a template replaced by each value, put through `quote` (JSON-escaped in a body, URL-escaped in an address). */
function fill(template: string, values: Record<string, unknown>, quote: (v: string) => string): string {
  return Object.entries(values).reduce((out, [k, v]) => out.replaceAll(`{${k}}`, quote(String(v ?? ""))), template);
}

/** A value inside a JSON string: its escapes, without the quotes. */
const jsonInner = (v: string) => JSON.stringify(v).slice(1, -1);
/** Every reserved character escaped (an address's query part). */
const urlPart = (v: string) => atlas.url.quote(v, "");

async function send(params: Params) {
  const s = params.settings ?? {};
  const kind = String(params.kind ?? "");
  if (!((s.kinds as string[] | undefined) ?? ["song"]).includes(kind)) {
    return { fields: {}, skipped: `${kind} is not sent (Settings → Downloader → Kinds to send)` };
  }
  const ids = (params.ids ?? {}) as Record<string, string>, props = (params.props ?? {}) as Record<string, string>;
  const url = ids.url || props.source;
  const address = String(s.address ?? "").trim();
  if (!url || !address) return { fields: {}, skipped: "no address to send, or no download service set" };
  const values = { url, kind, title: props.title, artist: props.artist, id: ids.youtube ?? "" };
  const method = String(s.method || "POST").toUpperCase();
  const headers: Record<string, string | { secret: string }> = { "Content-Type": "application/json", Accept: "application/json" };
  const header = String(s.header ?? "").trim();
  if (header && Boolean(await atlas.secret("token"))) headers[header] = { secret: "token" };
  const req: { url: string; method: string; headers: typeof headers; body?: string } = { url: fill(address, values, urlPart), method, headers };
  if (method !== "GET") {
    req.body = fill(String(s.body || '{"url": "{url}"}'), values, jsonInner);
    JSON.parse(req.body); // a body that is not JSON is a settings mistake, said before anything is sent
  }
  const res = await atlas.fetchResponse(req);
  if (res.signin) return { signin: res.signin };
  if (!res.ok) throw new Error(`the download service answered ${res.status}: ${String(res.text ?? "").slice(0, 200)}`);
  return { fields: { downloaded: "requested" } };
}

atlas.methods({ send });
