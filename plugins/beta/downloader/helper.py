"""Downloader: the `send` tool. One request, shaped by the settings, through Atlas's core (the token and the kept
sign-in are added there). Kinds not listed in the settings are left alone."""
import json
import os
import urllib.parse

ME = os.environ.get("ATLAS_PLUGIN_ID", "downloader")


def fill(template, values, quote):
    out = str(template)
    for k, v in values.items():
        out = out.replace("{" + k + "}", quote(str(v or "")))
    return out


def send_with(fetch, has_token, params):
    s = params.get("settings") or {}
    kind = params.get("kind") or ""
    if kind not in (s.get("kinds") or ["song"]):
        return {"fields": {}, "skipped": f"{kind} is not sent (Settings → Downloader → Kinds to send)"}
    ids, props = params.get("ids") or {}, params.get("props") or {}
    url = ids.get("url") or props.get("source")
    if not url or not str(s.get("address") or "").strip():
        return {"fields": {}, "skipped": "no address to send, or no download service set"}
    values = {"url": url, "kind": kind, "title": props.get("title"), "artist": props.get("artist"), "id": ids.get("youtube") or ""}
    method = str(s.get("method") or "POST").upper()
    body = fill(s.get("body") or '{"url": "{url}"}', values, lambda v: json.dumps(v)[1:-1]) if method != "GET" else None
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if has_token and str(s.get("header") or "").strip():
        headers[s["header"].strip()] = {"secret": "token"}
    req = {"url": fill(s["address"].strip(), values, lambda v: urllib.parse.quote(v, safe="")), "method": method, "headers": headers}
    if body is not None:
        json.loads(body)  # a body that is not JSON is a settings mistake, said before anything is sent
        req["body"] = body
    res = fetch(req)
    if res.get("signin"):
        return {"signin": res["signin"]}
    if not res.get("ok"):
        raise RuntimeError(f"the download service answered {res.get('status')}: {str(res.get('text', ''))[:200]}")
    return {"fields": {"downloaded": "requested"}}


if __name__ == "__main__":
    import atlas_plugin as atlas

    @atlas.method
    def send(params):
        return send_with(lambda req: atlas.post(f"/api/plugins/{ME}/fetch", req), bool(atlas.secret("token")), params)

    atlas.serve()
