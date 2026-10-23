"""MusicBrainz for the catalog: `lookup` finds an album (release group), a song (recording) or an artist by its id, by
the link it was captured from (MusicBrainz keeps links to Spotify, Bandcamp, Apple Music… on its entries), or by the
artist and title a page gave (`hints`), and answers the catalog's fields. Requests go through Atlas's core; the logic
takes its transport, so test_helper.py runs offline."""
import os
import re
import urllib.parse

ME = os.environ.get("ATLAS_PLUGIN_ID", "catalog-music")
API = "https://musicbrainz.org/ws/2"
COVERS = "https://coverartarchive.org"
SURE = 90  # a search hit below this score is not filed: a wrong album is worse than none

ENTITY = {"album": "release-group", "song": "recording", "artist": "artist"}
INC = {"album": "artist-credits+genres+releases+media", "song": "artist-credits+genres+releases+release-groups", "artist": "genres"}


def artists(credit):
    """MusicBrainz's artist credit → one name, or several as a list."""
    names = [c.get("name") or (c.get("artist") or {}).get("name") for c in credit or []]
    names = [n for n in names if n]
    return (names[0] if len(names) == 1 else names) or None


def year_of(date):
    return int(date[:4]) if isinstance(date, str) and date[:4].isdigit() else None


def genres(entity):
    gs = sorted(entity.get("genres") or [], key=lambda g: -g.get("count", 0))
    return [g["name"].title() for g in gs[:5]] or None


def ms(length):
    if not length:
        return None
    s = int(length) // 1000
    return f"{s // 60}:{s % 60:02d}"


def clean_title(title):
    """What a video or a shop calls a song → the song's name: "(Official Video Remastered)", "[Lyrics]" and the like
    dropped, and an "Artist - " before it."""
    t = re.sub(r"\s*[\(\[][^)\]]*\b(official|video|audio|lyrics?|visuali[sz]er|remaster(ed)?|hd|4k|mv)\b[^)\]]*[\)\]]", "", title or "", flags=re.I)
    return re.sub(r"^.{1,60}?\s[-–—]\s", "", t).strip() or (title or "").strip()


def clean_artist(name):
    """A channel's name → the artist's: "Queen - Topic", "QueenVEVO", "Queen Official" → "Queen"; a VEVO channel glues
    the words together ("RickAstleyVEVO"), so they are parted again at their capitals ("Rick Astley")."""
    raw = str(name or "").strip()
    vevo = re.search(r"VEVO$", raw, re.I) is not None
    n = re.sub(r"\s*-\s*Topic$|VEVO$|\s+Official$|\s+Official Channel$", "", raw, flags=re.I).strip()
    if vevo and " " not in n:
        n = re.sub(r"(?<=[a-z])(?=[A-Z])", " ", n)
    return n or None


def first_album(releases):
    """A song's album: the earliest official release whose group is a studio album (not a live one or a compilation)."""
    def studio(r):
        rg = r.get("release-group") or {}
        return rg.get("primary-type") == "Album" and not rg.get("secondary-types") and r.get("status") == "Official"
    dated = sorted((r for r in releases or [] if studio(r)), key=lambda r: r.get("date") or "9999")
    return dated[0].get("title") if dated else None


def fields_of(kind, e):
    if kind == "album":
        tracks = next((sum(m.get("track-count", 0) for m in r.get("media") or []) for r in e.get("releases") or [] if r.get("media")), None)
        return {"title": e.get("title"), "artist": artists(e.get("artist-credit")), "year": year_of(e.get("first-release-date")),
                "genres": genres(e), "tracks": tracks or None, "cover": f"{COVERS}/release-group/{e['id']}/front-500"}
    if kind == "song":
        return {"title": e.get("title"), "artist": artists(e.get("artist-credit")), "album": first_album(e.get("releases")),
                "year": year_of(e.get("first-release-date")), "duration": ms(e.get("length")), "genres": genres(e)}
    return {"title": e.get("name"), "genres": genres(e), "country": e.get("country"), "description": e.get("disambiguation") or None}


def by_link(get, kind, url):
    """The entity MusicBrainz has linked to this address (a Spotify album, a Bandcamp page), if any."""
    if not url or "musicbrainz.org" in url:
        return None
    r = get(f"{API}/url?resource={urllib.parse.quote(url, safe='')}&inc=release-group-rels+release-rels+recording-rels+artist-rels&fmt=json") or {}
    want = ENTITY[kind]
    for rel in r.get("relations") or []:
        if want in rel:
            return rel[want]["id"]
        if kind == "album" and "release" in rel:
            rg = (get(f"{API}/release/{rel['release']['id']}?inc=release-groups&fmt=json") or {}).get("release-group")
            if rg:
                return rg["id"]
    return None


def by_search(get, kind, hints):
    """The best hit for the artist and title a page gave; only a sure one (score ≥ SURE)."""
    title = clean_title(hints.get("title") or "")
    artist = clean_artist(hints.get("artist") if isinstance(hints.get("artist"), str) else (hints.get("artist") or [None])[0]) or clean_artist(hints.get("channel"))
    if not title or (kind == "song" and not artist):
        return None  # a song's name alone matches covers and karaoke: not without its artist
    field = {"album": "releasegroup", "song": "recording", "artist": "artist"}[kind]
    q = f'{field}:"{title}"' + (f' AND artist:"{artist}"' if artist and kind != "artist" else "")
    r = get(f"{API}/{ENTITY[kind]}?query={urllib.parse.quote(q)}&limit=50&fmt=json") or {}
    sure = [h for h in r.get(ENTITY[kind] + "s") or [] if int(h.get("score", 0)) >= SURE]
    if kind == "song":
        # a famous song has dozens of recordings (live, remasters, covers): the one with this very name, out first
        exact = [h for h in sure if (h.get("title") or "").casefold() == title.casefold() and not h.get("disambiguation")]
        sure = sorted(exact or sure, key=lambda h: h.get("first-release-date") or "9999")
    return sure[0]["id"] if sure else None


def lookup_with(get, params):
    kind = params.get("kind") or "album"
    if kind not in ENTITY:
        return {"fields": {}, "skipped": f"MusicBrainz has no {kind}s"}
    ids, hints = params.get("ids") or {}, params.get("hints") or {}
    mbid = ids.get("musicbrainz")
    if not mbid and ids.get("mb_release") and kind == "album":
        mbid = ((get(f"{API}/release/{ids['mb_release']}?inc=release-groups&fmt=json") or {}).get("release-group") or {}).get("id")
    mbid = mbid or by_link(get, kind, params.get("url")) or by_search(get, kind, hints)
    if not mbid:
        # nothing to go on yet: asked again once the page (catalog-web) has said the artist and title
        return {"later": True} if not hints.get("title") else {"fields": {}, "skipped": "MusicBrainz has no sure match"}
    e = get(f"{API}/{ENTITY[kind]}/{mbid}?inc={INC[kind]}&fmt=json")
    if not e:
        return {"fields": {}, "skipped": f"MusicBrainz has no {ENTITY[kind]} {mbid}"}
    fields = fields_of(kind, e)
    return {"ids": {"musicbrainz": mbid}, "fields": {k: v for k, v in fields.items() if v not in (None, "", [])}}


if __name__ == "__main__":
    import atlas_plugin as atlas

    def core_get(url):
        # MusicBrainz asks for one request a second and a User-Agent saying who asks; 400 is its "no such id"
        return atlas.fetch_json(url, headers={"User-Agent": "Atlas/0.1 (personal notes app; catalog-music)"}, every=1.0, missing=(400, 404))

    @atlas.method
    def lookup(params):
        return lookup_with(core_get, params)

    atlas.serve()
