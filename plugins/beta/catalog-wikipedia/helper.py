"""Wikipedia for the catalog: `recognize` reads a Wikipedia page's one-line description to say what the page is about,
and the page's external links for the identifiers other sources use — both in ONE small request to the MediaWiki
query API (Wikipedia rate-limits bursts; a whole page's HTML per capture was ~1 MB). Requests go through Atlas's core;
the logic takes its transport, so test_helper.py runs offline."""
import os
import re
import urllib.parse

ME = os.environ.get("ATLAS_PLUGIN_ID", "catalog-wikipedia")
PAGE = re.compile(r"https?://([a-z]{2,3}(?:-[a-z]+)?)\.(?:m\.)?wikipedia\.org/wiki/([^\s?#]+)", re.I)

# a description's words → the kind, in English, Spanish and French; first match wins, so specific before general
KINDS = [
    (r"\b(anime|animated (tv |television )?series|original (video|net) animation|serie de anime|OVA)\b", "anime"),
    (r"\b(manga|manhwa|manhua|gekiga)\b", "manga"),
    (r"\b(television|tv|web) (series|miniseries|sitcom|drama|soap opera|program(me)?|show|anthology)|\bsoap opera\b|\bserie de (televisión|tv)|"
     r"\bminiserie|\bsérie télévisée|\bsitcom\b|\btelenovela\b", "show"),
    (r"\b(\d{4} )?(\w+ )?(films?|movies?|documentar(y|ies)|short film)\b|\bpel[ií]culas?\b|\bcortometraje\b|\bdocumental\b|\bfilm (de|réalisé)", "movie"),
    # a group by its music ("hip hop group", "dance music group", "song and dance troupe"), before "song" and "album"
    # can take it; a bare "group" is not one ("ethnic group")
    (r"\b(hip[- ]hop|rap|pop|rock|punk|metal|folk|dance|electronic|indie|vocal|a cappella|jazz|reggae|soul|r&b|country|techno|"
     r"house|eurodance|music|musical|song and dance) (group|ensemble|collective|duo|trio|troupe|act|project)\b", "artist"),
    (r"\b(studio |live |compilation |debut |tribute )?albums?\b|\b[áa]lbum\b|\bep by\b|\bmixtape\b", "album"),
    (r"\b(songs?|single)\b|\bcanci[oó]n\b|\bsencillo\b|\bchanson\b", "song"),
    (r"\b(novels?|novellas?|books?|memoirs?|non-fiction book|textbooks?|treatise|monograph|short stor(y|ies)|"
     r"anthology of)\b|\bnovelas?\b|\blibros?\b|\broman\b", "book"),
    (r"\b(band|musical group|musician|singer|rapper|composer|dj|boy band|girl group)\b|\bgrupo musical\b|\bbanda\b|\bcantante\b|\bgroupe\b", "artist"),
]
# the page's links that name the thing elsewhere (its infobox and "External links"), per kind: a film page also cites
# books (their ISBNs), an album page links its artist — only the thing's own identifiers are taken
IDS = {
    "movie": [(r"imdb\.com/title/(tt\d{6,10})", "imdb"), (r"letterboxd\.com/film/([\w-]+)", "letterboxd"), (r"themoviedb\.org/movie/(\d+)", "tmdb")],
    "show": [(r"imdb\.com/title/(tt\d{6,10})", "imdb"), (r"themoviedb\.org/tv/(\d+)", "tmdb")],
    "album": [(r"musicbrainz\.org/release-group/([0-9a-f-]{36})", "musicbrainz")],
    "song": [],
    "artist": [(r"musicbrainz\.org/artist/([0-9a-f-]{36})", "musicbrainz")],
    "book": [(r"openlibrary\.org/works/(OL\d+W)", "openlibrary")],
    "manga": [(r"anilist\.co/manga/(\d+)", "anilist"), (r"myanimelist\.net/manga/(\d+)", "myanimelist")],
    "anime": [(r"anilist\.co/anime/(\d+)", "anilist"), (r"myanimelist\.net/anime/(\d+)", "myanimelist")],
}


def kind_of(description):
    d = description or ""
    for pattern, kind in KINDS:
        if re.search(pattern, d, re.I):
            return kind
    return None


def qualifier(title):
    """A page title's own disambiguation, "Apollo 11 (2019 film)" → "2019 film": Wikipedia's naming says the kind."""
    m = re.search(r"\(([^()]+)\)$", urllib.parse.unquote(title).replace("_", " ").strip())
    return m.group(1) if m else None


def query_url(lang, title):
    """The page's short description and its external links (IMDb, Letterboxd, MusicBrainz…), redirects followed."""
    t = urllib.parse.quote(urllib.parse.unquote(title), safe="")
    return (f"https://{lang}.wikipedia.org/w/api.php?action=query&prop=description%7Cextlinks&titles={t}"
            "&ellimit=500&redirects=1&format=json&formatversion=2")


def recognize_with(get_json, params):
    m = PAGE.search(str(params.get("url") or params.get("text") or ""))
    if not m:
        return {"candidates": []}
    lang, title = m.group(1).lower(), m.group(2)
    try:
        pages = ((get_json(query_url(lang, title)) or {}).get("query") or {}).get("pages") or [{}]
        page = pages[0] if not pages[0].get("missing") else {}
    except Exception:
        # busy or unreachable: the title's qualifier alone still files "X (2019 film)" right; anything else waits for a retry
        if not kind_of(qualifier(title)):
            raise
        page = {}
    summary = {"title": page.get("title"), "description": page.get("description")}
    # the title's qualifier is Wikipedia's own naming ("(Narsha song)", "(1975 film)"): surer than a description that
    # mentions the album a song is from or the series a film was cut from
    kind = kind_of(qualifier(title)) or kind_of(summary.get("description"))
    if not kind:
        return {"candidates": []}  # not a thing the catalog files: it stays a web page
    html = "\n".join(str(e.get("url") or "") for e in page.get("extlinks") or [])
    ids = {"url": m.group(0)}
    for pattern, name in IDS[kind]:
        found = re.search(pattern, html, re.I)
        if found and name not in ids:
            ids[name] = found.group(1)
    label = summary.get("title") or urllib.parse.unquote(title).replace("_", " ")
    return {"candidates": [{"kind": kind, "ids": ids, "label": f"{label} — {summary.get('description') or qualifier(title)}"}]}


if __name__ == "__main__":
    import atlas_plugin as atlas

    def get_json(url, contact=""):
        # Wikimedia asks programs to say who to contact; without that it throttles hard. Two a second at most.
        who = f"; {contact}" if contact else ""
        return atlas.fetch_json(url, headers={"User-Agent": f"Atlas/0.1 (personal notes app{who}) catalog-wikipedia"}, every=0.5)

    @atlas.method
    def recognize(params):
        contact = str((params.get("settings") or {}).get("contact") or "").strip()
        return recognize_with(lambda u: get_json(u, contact), params)

    atlas.serve()
