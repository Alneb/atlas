"""Linkwarden for the catalog: the `save` tool. The request goes out through Atlas's core (`/api/plugins/<id>/fetch`),
which adds the token from the secret store — this program never holds it — and keeps to the manifest's `net`."""
import json
import os

import atlas_plugin as atlas

ME = os.environ.get("ATLAS_PLUGIN_ID", "catalog-linkwarden")


def link_of(params):
    """The address to save: the thing's own link, else the best one its IDs give."""
    ids = params.get("ids") or {}
    props = params.get("props") or {}
    if ids.get("url"):
        return ids["url"]
    for key, fmt in (("doi", "https://doi.org/{}"), ("arxiv", "https://arxiv.org/abs/{}"), ("youtube", "https://www.youtube.com/watch?v={}"), ("imdb", "https://www.imdb.com/title/{}/")):
        if ids.get(key):
            return fmt.format(ids[key])
    return props.get("source") or None


@atlas.method
def save(params):
    settings = params.get("settings") or {}
    base = str(settings.get("address") or "").strip().rstrip("/")
    if not base:
        return {"fields": {}, "skipped": "no Linkwarden address in Settings → Catalog · Linkwarden"}
    url = link_of(params)
    if not url:
        return {"fields": {}, "skipped": "nothing to link to"}
    options = params.get("options") or {}
    props = params.get("props") or {}
    tags = list(dict.fromkeys([*(settings.get("tags") or []), *(options.get("tags") or [])]))
    body = {
        "url": url,
        "name": props.get("title") or url,
        "description": props.get("description") or "",
        "tags": [{"name": t} for t in tags],
        "collection": {"name": options.get("collection") or params.get("library") or "Atlas"},
    }
    res = atlas.post(f"/api/plugins/{ME}/fetch", {
        "url": f"{base}/api/v1/links",
        "method": "POST",
        # the token is put in by the core; none set (a Linkwarden behind the sign-in in front): no header
        "headers": {**({"Authorization": {"secret": "token", "prefix": "Bearer "}} if atlas.secret("token") else {}), "Content-Type": "application/json", "Accept": "application/json"},
        "body": json.dumps(body),
    })
    if res.get("signin"):  # a gate in front (Authelia…): Atlas has offered the sign-in; the catalog reports it
        return {"signin": res["signin"]}
    if res.get("status") == 409:  # already there: not an error, the note simply keeps pointing at it
        return {"fields": {}, "already": True}
    if not res.get("ok"):
        raise atlas.AtlasError(f"Linkwarden answered {res.get('status')}: {res.get('text', '')[:200]}")
    link_id = (json.loads(res.get("text") or "{}").get("response") or {}).get("id")
    return {"fields": {"linkwarden": f"{base}/links/{link_id}"} if link_id is not None else {}}


atlas.serve()
