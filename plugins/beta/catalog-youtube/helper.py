"""YouTube for the catalog: `lookup` from a video id (oEmbed through the core's fetch; no key). The page itself, read by
catalog-web, adds what oEmbed lacks (upload date, duration, description)."""
import json
import os
import urllib.parse

ME = os.environ.get("ATLAS_PLUGIN_ID", "catalog-youtube")


def clean_url(vid, kind):
    """The watch address with nothing else: what TubeArchivist or a music downloader is handed."""
    host = "music.youtube.com" if kind == "song" else "www.youtube.com"
    return f"https://{host}/watch?v={vid}"


def from_oembed(o, vid, kind):
    channel = str(o.get("author_name") or "").strip()
    fields = {"title": o.get("title"), "channel": channel or None, "cover": f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg"}
    if kind == "song":
        # YouTube Music's auto-generated channels are "<artist> - Topic"
        fields["artist"] = channel[: -len(" - Topic")] if channel.endswith(" - Topic") else channel or None
        fields.pop("channel")
    return {"ids": {"youtube": vid, "url": clean_url(vid, kind)}, "fields": {k: v for k, v in fields.items() if v}}


def lookup_with(get, params):
    vid = (params.get("ids") or {}).get("youtube")
    if not vid:
        return {"fields": {}, "skipped": "no YouTube id"}
    kind = params.get("kind") or "video"
    o = get("https://www.youtube.com/oembed?format=json&url=" + urllib.parse.quote(f"https://www.youtube.com/watch?v={vid}", safe=""))
    if not o:
        return {"ids": {"youtube": vid, "url": clean_url(vid, kind)}, "fields": {}, "skipped": "YouTube does not show this video (private, removed or age-restricted)"}
    return from_oembed(o, vid, kind)


if __name__ == "__main__":
    import atlas_plugin as atlas

    def core_get(url):
        res = atlas.post(f"/api/plugins/{ME}/fetch", {"url": url, "headers": {"Accept": "application/json"}, "timeout_secs": 15})
        if res.get("status") in (401, 403, 404):
            return None
        if not res.get("ok"):
            raise atlas.AtlasError(f"YouTube answered {res.get('status')}")
        return json.loads(res.get("text") or "{}")

    @atlas.method
    def lookup(params):
        return lookup_with(core_get, params)

    atlas.serve()
