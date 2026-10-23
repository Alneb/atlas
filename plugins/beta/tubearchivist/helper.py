"""TubeArchivist: the `archive` tool (the catalog's link for videos). The request goes out through Atlas's core, which
adds the token and, behind a gate, the kept sign-in; this program never holds either."""
import json
import os

ME = os.environ.get("ATLAS_PLUGIN_ID", "tubearchivist")


def archive_with(fetch, has_token, params):
    settings = params.get("settings") or {}
    base = str(settings.get("address") or "").strip().rstrip("/")
    vid = (params.get("ids") or {}).get("youtube")
    if not base:
        return {"fields": {}, "skipped": "no TubeArchivist address in Settings → TubeArchivist"}
    if not vid:
        return {"fields": {}, "skipped": "not a YouTube video"}
    if settings.get("auto") is False and not (params.get("options") or {}).get("archive"):
        return {"fields": {}, "skipped": "archiving is switched off (Settings → TubeArchivist)"}
    res = fetch({
        "url": f"{base}/api/download/",
        "method": "POST",
        "headers": {**({"Authorization": {"secret": "token", "prefix": "Token "}} if has_token else {}), "Content-Type": "application/json", "Accept": "application/json"},
        "body": json.dumps({"data": [{"youtube_id": vid, "status": "pending"}]}),
    })
    if res.get("signin"):
        return {"signin": res["signin"]}
    if not res.get("ok"):
        raise RuntimeError(f"TubeArchivist answered {res.get('status')}: {str(res.get('text', ''))[:200]}")
    return {"fields": {"tubearchivist": f"{base}/video/{vid}/"}}


if __name__ == "__main__":
    import atlas_plugin as atlas

    @atlas.method
    def archive(params):
        return archive_with(lambda req: atlas.post(f"/api/plugins/{ME}/fetch", req), bool(atlas.secret("token")), params)

    atlas.serve()
