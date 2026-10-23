"""TMDB for the catalog: `search` (words → candidates to pick from) and `details` (an id → the note's fields). With the
API token set, TMDB's API; without one, themoviedb.org's own pages, which say the same (the page's JSON-LD, its crew
and cast lists, its search results). Requests go through Atlas's core; the logic takes its transport, so
test_helper.py runs it offline."""
import html
import json
import os
import re
import urllib.parse

ME = os.environ.get("ATLAS_PLUGIN_ID", "catalog-tmdb")
API = "https://api.themoviedb.org/3"
IMG = "https://image.tmdb.org/t/p/w500"


def year_of(date):
    return int(date[:4]) if date and date[:4].isdigit() else None


def split_year(text):
    """'Dune 2021' → ('Dune', 2021); a year alone is a title ('1917')."""
    m = re.match(r"^(.*\S)\s*\(?((?:19|20)\d{2})\)?$", text.strip())
    return (m.group(1), int(m.group(2))) if m else (text.strip(), None)


def entry(ids, kind):
    """Which TMDB page an id names: ("movie" | "tv", number). Bare for the kind's own; a series listed as a film
    (Letterboxd's miniseries) is `tv/<number>`."""
    path, _, number = str(ids.get("tmdb") or "").rpartition("/")
    return (path if path in ("movie", "tv") else ("tv" if kind == "show" else "movie")), number


def ref(path, number, kind):
    """`entry` the other way: the id as the note keeps it."""
    return number if path == ("tv" if kind == "show" else "movie") else f"{path}/{number}"


def search_with(get, params):
    text = str(params.get("text") or "").strip()
    if not text or re.match(r"^https?://", text):
        return {"candidates": []}
    title, year = split_year(text)
    lang = (params.get("settings") or {}).get("language") or "en-US"
    r = get(f"{API}/search/multi?include_adult=false&language={lang}&query={urllib.parse.quote(title)}") or {}
    out = []
    for x in r.get("results") or []:
        kind = {"movie": "movie", "tv": "show"}.get(x.get("media_type"))
        if not kind:
            continue
        y = year_of(x.get("release_date") or x.get("first_air_date"))
        if year and y and abs(y - year) > 1:
            continue
        name = x.get("title") or x.get("name")
        out.append({"kind": kind, "ids": {"tmdb": str(x["id"])}, "label": f"{name} ({y or '?'}){' · series' if kind == 'show' else ''}", "cover": IMG + x["poster_path"] if x.get("poster_path") else None})
    return {"candidates": out[:8]}


SITE = "https://www.themoviedb.org"
# the page names the original language in words; the catalog speaks codes ("es": a vault keeping Spanish originals)
LANGS = {"English": "en", "Spanish": "es", "French": "fr", "German": "de", "Italian": "it", "Portuguese": "pt", "Japanese": "ja",
         "Korean": "ko", "Chinese": "zh", "Mandarin": "zh", "Cantonese": "cn", "Russian": "ru", "Swedish": "sv", "Danish": "da",
         "Norwegian": "no", "Dutch": "nl", "Polish": "pl", "Turkish": "tr", "Persian": "fa", "Hindi": "hi", "Catalan": "ca",
         "Basque": "eu", "Galician": "gl", "Arabic": "ar", "Greek": "el", "Hebrew": "he", "Czech": "cs", "Hungarian": "hu",
         "Romanian": "ro", "Finnish": "fi", "Thai": "th", "Icelandic": "is", "Irish": "ga", "Ukrainian": "uk"}


def _ld(page):
    for m in re.finditer(r'<script type="application/ld\+json">(.*?)</script>', page, re.S):
        try:
            o = json.loads(re.sub(r"/\*.*?\*/", "", m.group(1), flags=re.S))
        except ValueError:
            continue
        if isinstance(o, dict) and o.get("@type") in ("Movie", "TVSeries"):
            return o
    return {}


def _iso_minutes(d):
    m = re.fullmatch(r"PT(?:(\d+)H)?(?:(\d+)M)?", str(d or ""))
    return int(m.group(1) or 0) * 60 + int(m.group(2) or 0) if m and (m.group(1) or m.group(2)) else None


def _fact(page, name):
    m = re.search(rf"<strong>(?:<bdi>)?{name}(?:</bdi>)?</strong>\s*([^<]+)", page)
    return html.unescape(m.group(1)).strip() if m else None


def page_fields(page, kind):
    """A themoviedb.org film or series page (in some language) → the catalog's fields."""
    ld = _ld(page)
    if not ld:
        return None
    crew = [(html.unescape(n).strip(), roles) for n, roles in re.findall(r'<li class="profile">\s*<p><a [^>]*>([^<]+)</a></p>\s*<p class="character">([^<]+)</p>', page)]
    scroller = page[page.find("people scroller"):] if "people scroller" in page else ""
    cast = [html.unescape(n).strip() for n in re.findall(r'<p><a href="/person/[^"]*">([^<]+)</a></p>\s*<p class="character">', scroller)[:6]]
    date = ((ld.get("releasedEvent") or [{}])[0] or {}).get("startDate") or ld.get("startDate") or ""
    lang = LANGS.get(_fact(page, "Original Language") or "")
    fields = {
        "title": html.unescape(ld.get("name") or "") or None,
        "original_title": _fact(page, "Original Title") or _fact(page, "Original Name"),
        "year": year_of(date),
        "description": html.unescape(ld.get("description") or "") or None,
        "genres": [g for g in ld.get("genre") or [] if isinstance(g, str)] or None,
        "cast": cast or None,
        "cover": ld.get("image"),
        "duration": runtime(_iso_minutes(ld.get("duration"))),
        "language": lang,
    }
    role = "Creator" if kind == "show" else "Director"
    who = one_or_list([n for n, roles in crew if role in [r.strip() for r in roles.split(",")]])
    fields["creator" if kind == "show" else "director"] = who
    if kind == "show" and ld.get("numberOfSeasons"):
        fields["seasons"] = ld["numberOfSeasons"]
    if fields["original_title"] == fields["title"]:
        fields["original_title"] = None
    return {k: v for k, v in fields.items() if v not in (None, "", [])}


def site_details_with(get_text, params):
    """`details` without a token: the film's or series' page. A film whose original language the vault keeps
    (`languages`) has its synopsis and genres read again from the page in that language."""
    ids = params.get("ids") or {}
    kind = params.get("kind") or "movie"
    path, tmdb = entry(ids, kind)
    if not tmdb:
        return {"fields": {}, "skipped": "no TMDB id (an IMDb id goes through Letterboxd without a TMDB token)"}
    lang = (params.get("settings") or {}).get("language") or "en-US"
    page = get_text(f"{SITE}/{path}/{tmdb}?language={lang}")
    fields = page_fields(page or "", kind) if page else None
    if not fields:
        return {"fields": {}, "skipped": f"themoviedb.org has no {path} {tmdb}"}
    wanted = [str(x).lower() for x in params.get("languages") or []]
    original = fields.get("language")
    if original and original in wanted and not lang.lower().startswith(original):
        local = page_fields(get_text(f"{SITE}/{path}/{tmdb}?language={original}") or "", kind) or {}
        for k in ("description", "genres"):
            if local.get(k):
                fields[k] = local[k]
    return {"kind": kind, "ids": {"tmdb": ref(path, tmdb, kind)}, "fields": fields}


def search_page(page, kind):
    """themoviedb.org's search results → [(id, title, year)]."""
    out = []
    path = "tv" if kind == "show" else "movie"
    for card in page.split("comp:media-card")[1:]:
        m = re.search(rf'href="/{path}/(\d+)[^"]*"[^>]*>\s*<h2[^>]*>\s*<span>([^<]+)</span>', card)
        if not m:
            continue
        date = re.search(r'class="release_date[^"]*">\s*([^<]+)', card)
        y = re.search(r"\b(1[89]\d\d|20\d\d)\b", date.group(1)) if date else None
        out.append((m.group(1), html.unescape(m.group(2)).strip(), int(y.group(1)) if y else None))
    return out


def site_search_with(get_text, params):
    """`search` without a token: the site's film and series results for the words (a year narrows them)."""
    text = str(params.get("text") or "").strip()
    if not text or re.match(r"^https?://", text):
        return {"candidates": []}
    title, year = split_year(text)
    lang = (params.get("settings") or {}).get("language") or "en-US"
    out = []
    for kind, path in (("movie", "movie"), ("show", "tv")):
        for tmdb, name, y in search_page(get_text(f"{SITE}/search/{path}?query={urllib.parse.quote(title)}&language={lang}") or "", kind)[:6]:
            if year and y and abs(y - year) > 1:
                continue
            out.append({"kind": kind, "ids": {"tmdb": tmdb}, "label": f"{name} ({y or '?'}){' · series' if kind == 'show' else ''}"})
    return {"candidates": out[:8]}


def runtime(minutes):
    """166 → '2h 46m': how a person says it (the catalog's `duration`)."""
    if not minutes:
        return None
    return f"{minutes // 60}h {minutes % 60:02d}m" if minutes >= 60 else f"{minutes}m"


def one_or_list(names):
    return (names[0] if len(names) == 1 else names) or None


def details_with(get, params):
    """An id → the film's or series' fields in the catalog's words (title, year, director, cast, genres, duration,
    language, original_title, description, cover). A film whose original language the vault keeps (`languages`) is
    asked again in that language, so its synopsis and genres read as the film does."""
    ids = params.get("ids") or {}
    kind = params.get("kind") or "movie"
    lang = (params.get("settings") or {}).get("language") or "en-US"
    path, tmdb = entry(ids, kind)
    if not tmdb and ids.get("imdb"):
        found = get(f"{API}/find/{ids['imdb']}?external_source=imdb_id") or {}
        hit = (found.get("movie_results") or [None])[0] or (found.get("tv_results") or [None])[0]
        if hit:
            tmdb, kind = str(hit["id"]), "show" if hit in (found.get("tv_results") or []) else "movie"
            path = "tv" if kind == "show" else "movie"
    if not tmdb:
        return {"fields": {}, "skipped": "no TMDB or IMDb id TMDB knows"}
    d = get(f"{API}/{path}/{tmdb}?language={lang}&append_to_response=credits,external_ids")
    if not d:
        return {"fields": {}, "skipped": f"TMDB has no {path} {tmdb}"}
    original_lang = d.get("original_language")
    wanted = [str(x).lower() for x in params.get("languages") or []]
    if original_lang and original_lang in wanted and not lang.lower().startswith(original_lang):
        local = get(f"{API}/{path}/{tmdb}?language={original_lang}") or {}
        for k in ("overview", "genres"):
            if local.get(k):
                d[k] = local[k]
    ext = d.get("external_ids") or {}
    crew = (d.get("credits") or {}).get("crew") or []
    fields = {
        "title": d.get("title") or d.get("name"),
        "original_title": d.get("original_title") or d.get("original_name"),
        "year": year_of(d.get("release_date") or d.get("first_air_date")),
        "description": d.get("overview") or None,
        "genres": [g["name"] for g in d.get("genres") or []] or None,
        "cast": [c["name"] for c in ((d.get("credits") or {}).get("cast") or [])[:6]] or None,
        "cover": IMG + d["poster_path"] if d.get("poster_path") else None,
        "duration": runtime(d.get("runtime")),
        "language": original_lang,
    }
    if kind == "show":
        fields["creator"] = one_or_list([c["name"] for c in d.get("created_by") or []])
        fields["seasons"] = d.get("number_of_seasons")
    else:
        fields["director"] = one_or_list([c["name"] for c in crew if c.get("job") == "Director"])
    if fields["original_title"] == fields["title"]:
        fields["original_title"] = None
    out_ids = {"tmdb": ref(path, tmdb, kind)}
    for k, src in (("imdb", "imdb_id"), ("tvdb", "tvdb_id")):
        if ext.get(src):
            out_ids[k] = str(ext[src])
    return {"kind": kind, "ids": out_ids, "fields": {k: v for k, v in fields.items() if v not in (None, "", [])}}


if __name__ == "__main__":
    import atlas_plugin as atlas

    def core_text(url):
        # the core's own User-Agent: the site answers it (a browser-like one made from a program is refused)
        return atlas.fetch(url)

    def has_token():
        try:
            return bool(atlas.secret("token"))
        except atlas.AtlasError:
            return False

    def core_get(url):
        res = atlas.post(f"/api/plugins/{ME}/fetch", {"url": url, "headers": {"Authorization": {"secret": "token", "prefix": "Bearer "}, "Accept": "application/json"}, "timeout_secs": 20})
        if res.get("status") == 404:
            return None
        if res.get("status") == 401:
            raise atlas.AtlasError("TMDB refused the token: set the API Read Access Token in Settings → Catalog · TMDB")
        if not res.get("ok"):
            raise atlas.AtlasError(f"TMDB answered {res.get('status')}")
        return json.loads(res.get("text") or "{}")

    # the API with a token (faster, IMDb/TVDB ids too); the website without one
    @atlas.method
    def search(params):
        return search_with(core_get, params) if has_token() else site_search_with(core_text, params)

    @atlas.method
    def details(params):
        return details_with(core_get, params) if has_token() else site_details_with(core_text, params)

    atlas.serve()
