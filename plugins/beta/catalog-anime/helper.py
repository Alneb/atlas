"""AniList for the catalog: `lookup` finds a manga or an anime by its AniList or MyAnimeList id (a MangaDex title by the
links MangaDex keeps) and answers the catalog's fields. Requests go through Atlas's core; the logic takes its
transport, so test_helper.py runs offline."""
import json
import os
import re

ME = os.environ.get("ATLAS_PLUGIN_ID", "catalog-anime")
ANILIST = "https://graphql.anilist.co"
MANGADEX = "https://api.mangadex.org"

QUERY = """query ($id: Int, $mal: Int, $type: MediaType) {
  Media(id: $id, idMal: $mal, type: $type) {
    id idMal siteUrl status chapters volumes episodes genres description(asHtml: false)
    title { romaji english native } startDate { year } coverImage { extraLarge large }
    staff(perPage: 6, sort: RELEVANCE) { edges { role node { name { full } } } }
    studios(isMain: true) { nodes { name } }
  }
}"""

STATUS = {"FINISHED": "finished", "RELEASING": "ongoing", "NOT_YET_RELEASED": "not yet out", "CANCELLED": "cancelled", "HIATUS": "on hiatus"}


def plain(text):
    """AniList's description without its markup (`<br>`, `<i>`, "(Source: …)")."""
    t = re.sub(r"<br\s*/?>", "\n", text or "")
    t = re.sub(r"<[^>]+>", "", t)
    t = re.sub(r"\n*\(Source:[^)]*\)\s*$", "", t.strip())
    return re.sub(r"\n{3,}", "\n\n", t).strip() or None


def one_or_list(names):
    names = [n for n in dict.fromkeys(names) if n]
    return (names[0] if len(names) == 1 else names) or None


def fields_of(kind, m):
    title = m.get("title") or {}
    authors = [e["node"]["name"]["full"] for e in (m.get("staff") or {}).get("edges") or [] if re.search(r"story|art|original", e.get("role") or "", re.I)]
    f = {
        "title": title.get("english") or title.get("romaji"),
        "original_title": title.get("native"),
        "language": "ja" if title.get("native") else None,
        "year": (m.get("startDate") or {}).get("year"),
        "publication": STATUS.get(m.get("status")),
        "genres": (m.get("genres") or [])[:5] or None,
        "description": plain(m.get("description")),
        "cover": (m.get("coverImage") or {}).get("extraLarge") or (m.get("coverImage") or {}).get("large"),
    }
    if kind == "manga":
        f.update(author=one_or_list(authors), chapters=m.get("chapters"), volumes=m.get("volumes"))
    else:
        f.update(studio=one_or_list([n.get("name") for n in ((m.get("studios") or {}).get("nodes") or [])]), episodes=m.get("episodes"))
    if f["original_title"] == f["title"]:
        f["original_title"] = None
    return {k: v for k, v in f.items() if v not in (None, "", [])}


def lookup_with(graphql, get, params):
    kind = params.get("kind") or "manga"
    ids = dict(params.get("ids") or {})
    if ids.get("mangadex") and not ids.get("anilist") and not ids.get("myanimelist"):
        links = ((((get(f"{MANGADEX}/manga/{ids['mangadex']}") or {}).get("data") or {}).get("attributes") or {}).get("links")) or {}
        ids.update({k: v for k, v in (("anilist", links.get("al")), ("myanimelist", links.get("mal"))) if v})
    var = {"type": "MANGA" if kind == "manga" else "ANIME"}
    if ids.get("anilist"):
        var["id"] = int(ids["anilist"])
    elif ids.get("myanimelist"):
        var["mal"] = int(ids["myanimelist"])
    else:
        return {"fields": {}, "skipped": "no AniList or MyAnimeList id (MangaDex names none for this title)"}
    m = ((graphql(QUERY, var) or {}).get("data") or {}).get("Media")
    if not m:
        return {"fields": {}, "skipped": "AniList does not know it"}
    out_ids = {"anilist": str(m["id"])}
    if m.get("idMal"):
        out_ids["myanimelist"] = str(m["idMal"])
    return {"ids": out_ids, "fields": fields_of(kind, m)}


if __name__ == "__main__":
    import atlas_plugin as atlas

    def fetch(url, method="GET", body=None):
        res = atlas.post(f"/api/plugins/{ME}/fetch", {"url": url, "method": method, "body": body, "headers": {"Accept": "application/json", "Content-Type": "application/json", "User-Agent": "Atlas/0.1 (personal notes app; catalog-anime)"}, "timeout_secs": 20})
        if res.get("status") == 404:
            return None
        if not res.get("ok"):
            raise atlas.AtlasError(f"{url} answered {res.get('status')}")
        return json.loads(res.get("text") or "null")

    @atlas.method
    def lookup(params):
        return lookup_with(lambda q, v: fetch(ANILIST, "POST", json.dumps({"query": q, "variables": v})), fetch, params)

    atlas.serve()
