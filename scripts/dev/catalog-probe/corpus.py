#!/usr/bin/env python3
"""Runs captures through the catalog's preview on :7799 and prints kind / where / title against what is expected."""
import json, sys, urllib.request, concurrent.futures as cf

# (capture text, expected kind, expected folder prefix or None)
CORPUS = [
    ("https://youtu.be/dQw4w9WgXcQ?si=abc", "video", "Videos"),
    ("https://www.youtube.com/watch?v=jNQXAC9IVRw&t=10s", "video", "Videos"),
    ("https://www.youtube.com/shorts/aqz-KE-bpKQ", "video", "Videos"),
    ("https://m.youtube.com/watch?v=9bZkp7q19f0&feature=share", "video", "Videos"),
    ("https://music.youtube.com/watch?v=fJ9rUzIMcZQ&si=xyz", "song", "Music"),
    ("check this out https://youtu.be/kJQP7kiw5Fk lol", "video", "Videos"),
    ("https://www.youtube.com/playlist?list=PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSU", "article", None),
    ("https://www.youtube.com/@veritasium", "article", None),
    ("https://letterboxd.com/film/dune-part-two/", "movie", "Films"),
    ("https://www.imdb.com/title/tt0816692/", "movie", "Films"),
    ("https://www.imdb.com/title/tt0903747/?ref_=nv_sr_srsg_0", "show", "Series"),
    ("https://www.themoviedb.org/movie/438631-dune", "movie", "Films"),
    ("tt1375666", "movie", "Films"),
    ("Dune 2021", "movie", "Films"),
    ("https://doi.org/10.1038/nature14539", "paper", "refs/papers"),
    ("10.1103/PhysRevLett.116.061102", "paper", "refs/papers"),
    ("https://arxiv.org/abs/1706.03762", "paper", "refs/papers"),
    ("https://arxiv.org/pdf/2303.08774v3", "paper", "refs/papers"),
    ("arXiv:2106.09685", "paper", "refs/papers"),
    ("https://www.biorxiv.org/content/10.1101/2020.03.22.002386v3", "paper", "refs/papers"),
    ("https://www.nature.com/articles/s41586-021-03819-2", "paper", "refs/papers"),
    ("https://journals.aps.org/prl/abstract/10.1103/PhysRevLett.116.061102", "paper", "refs/papers"),
    ("https://en.wikipedia.org/wiki/Quantum_entanglement", "article", None),
    ("https://github.com/rust-lang/rust", "article", None),
    ("https://news.ycombinator.com/item?id=38512345", "article", None),
    ("https://www.reddit.com/r/rust/comments/1b2c3d4/some_post/", "article", None),
    ("https://stackoverflow.com/questions/11227809/why-is-processing-a-sorted-array-faster-than-processing-an-unsorted-array", "article", None),
    ("https://blog.rust-lang.org/2024/11/28/Rust-1.83.0.html", "article", None),
    ("https://www.bbc.com/news/science-environment-56837908", "article", None),
    ("https://radiohead.bandcamp.com/album/kid-a-mnesia", "album", "Music"),
    ("https://musicbrainz.org/release-group/b1392450-e666-3926-a536-22c65f834433", "album", "Music"),
    ("https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC", "song", "Music"),
    ("https://open.spotify.com/album/6dVIqQ8qmQ5GBnJ9shOYGE", "album", "Music"),
    ("https://www.goodreads.com/book/show/234225.Dune", "book", "Books"),
    ("ISBN 978-0441172719", "book", "Books"),
    ("9780441172719", "book", "Books"),
    ("https://openlibrary.org/works/OL893415W/Dune", "book", "Books"),
    ("https://mangadex.org/title/801513ba-a712-498c-8f57-cae55b38cc92/berserk", "manga", "Manga"),
    ("https://anilist.co/manga/30002/Berserk/", "manga", "Manga"),
    ("https://www.google.com/maps/place/Eiffel+Tower/@48.8583701,2.2944813,17z", "article", None),
    ("https://www.amazon.com/dp/B08N5WRWNW", "article", None),
    ("https://twitter.com/rustlang/status/1234567890", "article", None),
    ("https://www.instagram.com/p/Cxyz123abc/", "article", None),
    ("https://www.allrecipes.com/recipe/10813/best-chocolate-chip-cookies/", "article", None),
    ("https://podcasts.apple.com/us/podcast/lex-fridman-podcast/id1434243584", "article", None),
    ("https://www.ted.com/talks/sir_ken_robinson_do_schools_kill_creativity", "video", "Videos"),
    ("https://vimeo.com/76979871", "video", "Videos"),
    ("https://en.wikipedia.org/wiki/Beau_Is_Afraid", "movie", "Films"),
    ("https://en.wikipedia.org/wiki/Harakiri_(1962_film)", "movie", "Films"),
    ("https://es.wikipedia.org/wiki/La_bola_negra_(pel%C3%ADcula)", "movie", "Films"),
    ("https://en.wikipedia.org/wiki/Kid_A", "album", "Music"),
    ("https://en.wikipedia.org/wiki/Dune_(novel)", "book", "Books"),
    ("https://en.wikipedia.org/wiki/Breaking_Bad", "show", "Series"),
    ("https://letterboxd.com/film/the-realm-2018/", "movie", "Films"),
    ("ISBN 9780805382914", "science_book", "Books/Science"),
    ("https://www.youtube.com/watch?v=dQw4w9WgXcQ", "video", "Videos"),
    ("buy milk tomorrow", None, None),
    ("[] call the dentist", None, None),
    ("idea: a plugin that files captures by the hour of the lecture", None, None),
]

def ask(tool, text):
    req = urllib.request.Request(f"http://127.0.0.1:7799/api/plugins/catalog/tools/{tool}", data=json.dumps({"text": text}).encode(),
                                 headers={"x-atlas": "1", "content-type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=150) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        return {"error": f"HTTP {e.code}: {e.read().decode()[:300]}"}
    except Exception as e:
        return {"error": f"{type(e).__name__}: {e}"}

def one(case):
    text, want_kind, want_folder = case
    p = ask("preview", text)
    if not isinstance(p, dict):
        p = {"error": f"answer {p!r}"}
    kind = (p.get("candidate") or {}).get("kind")
    path = p.get("path") or ""
    title = ((p.get("merged") or {}).get("fields") or {}).get("title")
    ok_kind = kind == want_kind
    ok_folder = want_folder is None or path.startswith(want_folder)
    return {"text": text, "want": want_kind, "kind": kind, "path": path, "title": title, "ok": ok_kind and ok_folder,
            "error": p.get("error"), "candidates": p.get("candidates"), "steps": [s.get("explanation") for s in p.get("steps", []) if s.get("stage") != "load"], "raw": p}

if __name__ == "__main__":
    only = sys.argv[1:]
    cases = [c for c in CORPUS if not only or any(o in c[0] for o in only)]
    with cf.ThreadPoolExecutor(2) as ex:
        res = list(ex.map(one, cases))
    json.dump(res, open("results.json", "w"), indent=1, ensure_ascii=False)
    for r in res:
        mark = "OK " if r["ok"] else "BAD"
        print(f"{mark} {r['text'][:60]:60} want={r['want']!s:8} got={r['kind']!s:8} → {r['path'][:60]}  {('ERR '+r['error'][:120]) if r['error'] else ''}")
    print(sum(r["ok"] for r in res), "/", len(res), "as expected")
