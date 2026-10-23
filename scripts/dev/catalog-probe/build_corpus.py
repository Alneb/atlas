#!/usr/bin/env python3
"""Builds corpus1000.json: ~1000 real captures of every kind, each with the kind it must become (None: left alone,
"*": any kind, only a sane title). Sources: Wikipedia categories, a public Letterboxd member's films, arXiv, Crossref,
AniList, YouTube, MusicBrainz's streaming links, Hacker News, known IMDb ids and ISBNs, plain thoughts, and links
wrapped in sentences. Polite: one request at a time, a User-Agent saying who asks."""
import json
import random
import re
import time
import urllib.parse
import urllib.request

UA = {"User-Agent": "Atlas/0.1 (personal notes app; catalog test corpus)", "Accept": "application/json"}
random.seed(17)


def get(url, data=None, headers=None, raw=False):
    time.sleep(0.4)
    req = urllib.request.Request(url, data=data, headers={**UA, **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            body = r.read().decode("utf-8", "replace")
            return body if raw else json.loads(body)
    except Exception as e:
        print("  skip", url[:90], e)
        return None


def wiki_category(lang, cat, n):
    r = get(f"https://{lang}.wikipedia.org/w/api.php?action=query&list=categorymembers&cmtitle={urllib.parse.quote(cat)}&cmlimit=500&cmnamespace=0&format=json") or {}
    titles = [m["title"] for m in (r.get("query") or {}).get("categorymembers", []) if not m["title"].startswith(("List of", "Lista de"))]
    random.shuffle(titles)
    return [f"https://{lang}.wikipedia.org/wiki/{urllib.parse.quote(t.replace(' ', '_'), safe='()_,')}" for t in titles[:n]]


corpus = []


def add(texts, kind, folder, source):
    for t in texts:
        corpus.append({"text": t, "kind": kind, "folder": folder, "source": source})
    print(f"{source}: {len(texts)}")


# Wikipedia: pages about things, by category (the kind is the category's)
for lang, cat, n, kind, folder in [
    ("en", "Category:2019 films", 100, "movie", "Films"),
    ("en", "Category:1970s drama films", 40, "movie", "Films"),
    ("es", "Categoría:Películas de España", 30, "movie", "Films"),
    ("en", "Category:2010s American drama television series", 60, "show", "Series"),
    ("en", "Category:2016 albums", 80, "album", "Music"),
    ("en", "Category:1990s debut albums", 30, "album", "Music"),
    ("en", "Category:1990 novels", 50, "book", "Books"),
    ("en", "Category:Manga series", 30, "manga", "Manga"),
    ("en", "Category:Anime television series", 30, "anime", "Anime"),
    ("en", "Category:Physics textbooks", 20, "book|science_book", "Books"),
    ("en", "Category:English rock music groups", 30, "artist", "Music"),
    ("en", "Category:2010 songs", 40, "song", "Music"),
    ("en", "Category:Quantum mechanics", 25, "article", None),
    ("en", "Category:Cities in France", 15, "article", None),
]:
    add(wiki_category(lang, cat, n), kind, folder, f"wikipedia {cat}")

# Letterboxd: a public member's watched films, as film links in three shapes
page = get("https://letterboxd.com/davidehrlich/films/page/2/", raw=True, headers={"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) Atlas/0.1.0"}) or ""
slugs = list(dict.fromkeys(re.findall(r'data-item-slug="([\w-]+)"', page)))[:70]
add([random.choice([f"https://letterboxd.com/film/{s}/", f"letterboxd.com/film/{s}", f"https://letterboxd.com/davidehrlich/film/{s}/"]) for s in slugs], "movie", "Films", "letterboxd")

# IMDb: well-known films, as links and bare ids
IMDB = ["tt0111161", "tt0068646", "tt0468569", "tt0071562", "tt0050083", "tt0108052", "tt0167260", "tt0110912", "tt0120737", "tt0060196",
        "tt0109830", "tt0137523", "tt1375666", "tt0167261", "tt0080684", "tt0133093", "tt0099685", "tt0073486", "tt0047478", "tt0114369",
        "tt0317248", "tt0102926", "tt0038650", "tt0118799", "tt0120815", "tt0816692", "tt0245429", "tt0120689", "tt0076759", "tt6751668",
        "tt0054215", "tt0021749", "tt0095327", "tt0056058", "tt7095482", "tt0087843", "tt0082971", "tt0209144", "tt0364569", "tt0253474",
        "tt0057012", "tt0086190", "tt0105236", "tt0119698", "tt0095765"]
add([f"https://www.imdb.com/title/{t}/" for t in IMDB[:30]], "movie", "Films", "imdb link")
add(IMDB[30:], "movie", "Films", "imdb bare id")

# arXiv: recent papers in a few fields, in the three shapes people paste
ids = []
for cat in ["cond-mat.str-el", "quant-ph", "hep-th", "cs.LG", "astro-ph.CO", "math.AP"]:
    x = get(f"http://export.arxiv.org/api/query?search_query=cat:{cat}&max_results=10&sortBy=submittedDate", raw=True) or ""
    ids += re.findall(r"<id>http://arxiv\.org/abs/(\d{4}\.\d{4,5})v\d+</id>", x)
add([random.choice([f"https://arxiv.org/abs/{i}", f"https://arxiv.org/pdf/{i}v1", f"arXiv:{i}", f"https://arxiv.org/abs/{i}v2"]) for i in ids[:60]], "paper", "refs/papers", "arxiv")

# Crossref: journal articles by DOI, bare and as links
r = get("https://api.crossref.org/works?sample=60&filter=type:journal-article") or {}
dois = [i["DOI"] for i in (r.get("message") or {}).get("items", [])]
add([random.choice([f"https://doi.org/{d}", d, f"doi:{d}", f"https://dx.doi.org/{d}"]) for d in dois], "paper", "refs/papers", "crossref doi")

# AniList and MyAnimeList: popular manga and anime
for typ, kind, folder in [("MANGA", "manga", "Manga"), ("ANIME", "anime", "Anime")]:
    q = {"query": "query($t:MediaType){Page(perPage:25){media(type:$t,sort:POPULARITY_DESC){id idMal}}}", "variables": {"t": typ}}
    r = get("https://graphql.anilist.co", data=json.dumps(q).encode(), headers={"Content-Type": "application/json"}) or {}
    media = ((r.get("data") or {}).get("Page") or {}).get("media") or []
    add([random.choice([f"https://anilist.co/{kind}/{m['id']}/", f"https://myanimelist.net/{kind}/{m['idMal']}"]) if m.get("idMal") else f"https://anilist.co/{kind}/{m['id']}/" for m in media], kind, folder, f"anilist {kind}")

# YouTube: videos from a big public playlist, in every link shape; some as YouTube Music songs
html = get("https://www.youtube.com/playlist?list=PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSU", raw=True, headers={"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) Atlas/0.1.0"}) or ""
vids = list(dict.fromkeys(re.findall(r'"videoId":"([\w-]{11})"', html)))
add([random.choice([f"https://www.youtube.com/watch?v={v}", f"https://youtu.be/{v}?si=Xy12", f"https://m.youtube.com/watch?v={v}&feature=share", f"https://www.youtube.com/watch?v={v}&t=42s"]) for v in vids[:60]], "video", "Videos", "youtube")
add([f"https://music.youtube.com/watch?v={v}&si=abc" for v in vids[60:80]], "song", "Music", "youtube music")

# MusicBrainz: albums' links on streaming and shop sites (Spotify, Bandcamp, Apple Music, Deezer, Tidal)
links = []
r = get("https://musicbrainz.org/ws/2/release-group?query=primarytype:album%20AND%20firstreleasedate:[1965%20TO%202024]%20AND%20tag:rock&limit=40&fmt=json") or {}
for rg in (r.get("release-groups") or [])[:40]:
    time.sleep(1.1)
    rel = get(f"https://musicbrainz.org/ws/2/release?release-group={rg['id']}&inc=url-rels&limit=5&fmt=json") or {}
    for release in rel.get("releases") or []:
        urls = [x["url"]["resource"] for x in release.get("relations") or [] if re.search(r"spotify\.com/album|bandcamp\.com/album|music\.apple\.com|deezer\.com/(\w+/)?album|tidal\.com", x.get("url", {}).get("resource", ""))]
        if urls:
            links.append(urls[0])
            break
add(links, "album", "Music", "musicbrainz streaming links")

# Hacker News: whatever people link (web pages mostly; any kind is fine, a sane title is the check)
top = get("https://hacker-news.firebaseio.com/v0/topstories.json") or []
hn = []
for i in top[:90]:
    item = get(f"https://hacker-news.firebaseio.com/v0/item/{i}.json") or {}
    if item.get("url"):
        hn.append(item["url"])
add(hn[:60], "*", None, "hacker news links")

# ISBNs: novels and physics books, with and without the word
ISBN = ["9780441172719", "9780316769488", "9780061120084", "9780451524935", "9780743273565", "9780547928227", "9780140449136", "9780679783268",
        "9780805382914", "9780131118928", "9781108422413", "9780691145587", "9780201657029", "9780486661728", "9780521880688", "9780738200620",
        "9788420412146", "9788433920225", "9788497592208", "9780307474728"]
add([random.choice([f"ISBN {i}", i, f"ISBN-13: {i[:3]}-{i[3:4]}-{i[4:7]}-{i[7:12]}-{i[12:]}", f"isbn:{i}"]) for i in ISBN], "book|science_book", "Books", "isbn")

# plain thoughts, tasks and notes: never catalogued, never searched
PLAIN = ["buy milk tomorrow", "[] call the dentist", "idea: a plugin that files captures by the hour of the lecture", "remember to email Alex about the DMFT draft",
         "meeting at 10:30 in room D3-2041", "the self-energy diverges at low T, check the Matsubara cutoff", "2026-10-21 deadline for the abstract",
         "#idea a better way to plot spectral functions", "- [ ] renew passport", "Dune was better the second time", "feeling tired today",
         "phone: 819-555-0134", "pay rent", "temperature 10.5 K, field 2.3 T", "ask about the 10/2 seminar", "version 1.83 of rust is out",
         "read chapter 3 of Altland–Simons", "who directed Harakiri?", "pizza with Marta on Friday", "tt is a nice ligature",
         "the ratio was 10.2/3.4", "gym 18:00", "rewatch the lecture on Green's functions", "Q: why does the DOS have a peak at 0?",
         "todo: fix the plotting script", "lunch", "Spotify playlist for running", "watch something by Kobayashi", "ISBN missing in the bib",
         "arXiv later", "the movie last night was great", "list: eggs, flour, sugar", "call mom", "book flights to Montreal",
         "write the methods section", "conference in March", "🎉 paper accepted", "ok", "thoughts on the bath correction: it scales as U^2",
         "Recordar: comprar pan", "llamar al médico mañana", "idée: un plugin pour les cours", "Dentist at 3pm Thursday",
         "check whether doi works offline", "music for focus", "hash 9f2c1e0a7b", "note to self: be kind", "weekly review", "send the slides"]
add(PLAIN, None, None, "plain thoughts")

# links inside sentences, as people share them
sample = random.sample([c for c in corpus if c["kind"] not in (None, "*") and c["text"].startswith("http")], 50)
for c in sample:
    t = random.choice(["check this out {u} !!", "{u}\n\nso good", "(see {u})", "watch later: {u}", "From a friend — {u}", "{u} via the phone"]).format(u=c["text"])
    corpus.append({**c, "text": t, "source": "link in a sentence"})
print("sentence-wrapped: 50")

json.dump(corpus, open("corpus1000.json", "w"), indent=0, ensure_ascii=False)
print("TOTAL", len(corpus))
