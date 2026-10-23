import json, random, re, sys
sys.argv=[sys.argv[0]]
exec(open("build_corpus.py").read().split("corpus = []")[0])  # helpers only
corpus = json.load(open("corpus1000.json"))
def add(texts, kind, folder, source):
    for t in texts: corpus.append({"text": t, "kind": kind, "folder": folder, "source": source})
    print(f"{source}: {len(texts)}")
for lang, cat, n, kind, folder in [
    ("en", "Category:1975 films", 30, "movie", "Films"), ("en", "Category:2003 films", 30, "movie", "Films"),
    ("en", "Category:1997 albums", 40, "album", "Music"), ("en", "Category:Anime series based on manga", 30, "anime", "Anime"),
    ("en", "Category:Musical groups established in 1991", 30, "artist", "Music"), ("en", "Category:2010 singles", 40, "song", "Music"),
    ("en", "Category:Quantum mechanics", 25, "article", None), ("en", "Category:Prefectures in France", 15, "article", None),
    ("en", "Category:1965 novels", 25, "book", "Books"),
]:
    add(wiki_category(lang, cat, n), kind, folder, f"wikipedia {cat}")
html = open("../pages/ytplaylist.html", encoding="utf-8", errors="replace").read()
vids = list(dict.fromkeys(re.findall(r'"videoId":"([\w-]{11})"', html)))
add([random.choice([f"https://www.youtube.com/watch?v={v}", f"https://youtu.be/{v}?si=Xy12", f"https://m.youtube.com/watch?v={v}&feature=share", f"https://www.youtube.com/watch?v={v}&t=42s"]) for v in vids[:60]], "video", "Videos", "youtube")
add([f"https://music.youtube.com/watch?v={v}&si=abc" for v in vids[60:80]], "song", "Music", "youtube music")
films = open("../pages/films.html").read()
slugs = list(dict.fromkeys(re.findall(r'data-item-slug="([\w-]+)"', films)))[:70]
add([random.choice([f"https://letterboxd.com/film/{s}/", f"letterboxd.com/film/{s}", f"https://letterboxd.com/davidehrlich/film/{s}/"]) for s in slugs], "movie", "Films", "letterboxd")
json.dump(corpus, open("corpus1000.json", "w"), indent=0, ensure_ascii=False)
print("TOTAL", len(corpus))
