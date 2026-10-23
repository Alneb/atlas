"""Audiobookshelf for the catalog: `lookup` finds a book's audiobook on the user's server (by its Audiobookshelf id,
its ISBN, else its exact title) and `sync` files the server's book libraries as book notes. Requests go through
Atlas's core with the user's API token; the logic takes its transport, so test_helper.py runs offline on cut-down
copies of Audiobookshelf's answers (its API: /api/libraries, /api/libraries/<id>/items, …/search, /api/items/<id>)."""
import json
import os
import time
import urllib.parse

ME = os.environ.get("ATLAS_PLUGIN_ID", "catalog-audiobookshelf")
STATE = f".atlas/cache/{ME}.json"
PER_RUN = 30  # books filed per sync run: a first run over a big library spreads over a few runs
RUN_SECONDS = 240  # and never longer than this (the tool's timeout is 300 s)


def duration(seconds):
    """3725.4 → "1h 02m": the catalog's legible listening time."""
    if not seconds:
        return None
    m = int(round(float(seconds) / 60))
    return f"{m // 60}h {m % 60:02d}m" if m >= 60 else f"{m}m"


def names(v):
    """Authors or narrators, expanded (`[{name}]`, `["…"]`) or minified (`"A, B"`) → one name, or a list."""
    if isinstance(v, str):
        items = [n.strip() for n in v.split(",")]
    else:
        items = [(n.get("name") if isinstance(n, dict) else n) for n in v or []]
    items = [n for n in items if isinstance(n, str) and n.strip()]
    return (items[0] if len(items) == 1 else items) or None


def book_of(item, server):
    """A library item → the catalog's {ids, fields}: the audiobook's own details and the link to it."""
    media = item.get("media") or {}
    m = media.get("metadata") or {}
    year = str(m.get("publishedYear") or "")[:4]
    fields = {
        "title": m.get("title"),
        "author": names(m.get("authors") or m.get("authorName")),
        "narrator": names(m.get("narrators") or m.get("narratorName")),
        "year": int(year) if year.isdigit() else None,
        "publisher": m.get("publisher"),
        "genres": [g for g in m.get("genres") or [] if isinstance(g, str)] or None,
        "description": m.get("description"),
        "duration": duration(media.get("duration")),
        "audiobook": f"{server}/item/{item['id']}",
    }
    ids = {"audiobookshelf": item["id"]}
    isbn = "".join(c for c in str(m.get("isbn") or "") if c.isdigit() or c in "Xx")
    if len(isbn) in (10, 13):
        ids["isbn"] = isbn
    return {"ids": ids, "fields": {k: v for k, v in fields.items() if v not in (None, "", [])}}


def book_libraries(get):
    return [lib["id"] for lib in (get("/api/libraries") or {}).get("libraries") or [] if lib.get("mediaType", "book") == "book"]


def find(get, ids, hints):
    """The item for this book: by its id; else a search per library, kept only on the same ISBN or the same title."""
    if ids.get("audiobookshelf"):
        return get(f"/api/items/{ids['audiobookshelf']}?expanded=1")
    isbn, title = ids.get("isbn"), (hints.get("title") or "").strip()
    for lib in book_libraries(get):
        for q in [x for x in (isbn, title) if x]:
            hits = (get(f"/api/libraries/{lib}/search?q={urllib.parse.quote(q)}&limit=10") or {}).get("book") or []
            for hit in hits:
                item = hit.get("libraryItem") or {}
                m = (item.get("media") or {}).get("metadata") or {}
                same_isbn = isbn and "".join(c for c in str(m.get("isbn") or "") if c.isdigit() or c in "Xx") == isbn
                same_title = title and str(m.get("title") or "").casefold() == title.casefold()
                if same_isbn or same_title:
                    return item
    return None


def lookup_with(get, params):
    server = str((params.get("settings") or {}).get("server") or "").rstrip("/")
    if not server or not (params.get("secrets") or {}).get("token"):
        return {"fields": {}, "skipped": "no Audiobookshelf server or token set (Settings → Catalog · Audiobookshelf)"}
    item = find(get, params.get("ids") or {}, params.get("hints") or {})
    if not item:
        return {"fields": {}, "skipped": "not on your Audiobookshelf"}
    return book_of(item, server)


def items_page(get, lib, page, limit=50):
    """One page of a library's items, and whether there are more."""
    r = get(f"/api/libraries/{lib}/items?limit={limit}&page={page}") or {}
    results = r.get("results") or []
    return results, (page + 1) * limit < int(r.get("total") or 0)


def sync_with(get, add, load, save, params, clock=time.monotonic):
    """Files every book of the server's book libraries, PER_RUN at most a run: what is new, or newly finished.
    `done`: item id → what was sent, so a run sends only what changed."""
    settings = params.get("settings") or {}
    server = str(settings.get("server") or "").rstrip("/")
    if not server or not (params.get("secrets") or {}).get("token"):
        return {"summary": "no Audiobookshelf server or token set (Settings → Catalog · Audiobookshelf)", "filed": 0}
    shelf = str(settings.get("finished") if settings.get("finished") is not None else "[[read]]").strip()
    finished = {p.get("libraryItemId") for p in (get("/api/me") or {}).get("mediaProgress") or [] if p.get("isFinished")}
    state = load() or {}
    done = state.setdefault("done", {})
    started, filed, failed, more = clock(), 0, [], False
    for lib in book_libraries(get):
        page, has_more = 0, True
        while has_more and filed < PER_RUN and clock() - started < RUN_SECONDS:
            items, has_more = items_page(get, lib, page)
            page += 1
            for item in items:
                if filed >= PER_RUN or clock() - started >= RUN_SECONDS:
                    more = True
                    break
                own = {"status": shelf} if shelf and item["id"] in finished else {}
                sent = {"own": own}
                if done.get(item["id"]) == sent and not params.get("all"):
                    continue
                book = book_of(item, server)
                try:
                    add({"text": book["fields"].get("title") or book["fields"]["audiobook"], "kind": "book", "ids": book["ids"], "own": own})
                    done[item["id"]] = sent
                    filed += 1
                except Exception as e:  # one book failing never stops the others; said in the summary
                    failed.append(f"{book['fields'].get('title', item['id'])}: {e}")
        more = more or has_more
    save(state)
    summary = f"{filed} audiobook{'s' if filed != 1 else ''} filed from Audiobookshelf" + (", more next run" if more else "") + (f"; {len(failed)} failed ({failed[0]})" if failed else "")
    return {"summary": summary, "filed": filed, "failed": failed}


if __name__ == "__main__":
    import atlas_plugin as atlas

    def transport(params):
        server = str((params.get("settings") or {}).get("server") or "").rstrip("/")
        token = (params.get("secrets") or {}).get("token") or ""
        return lambda path: atlas.fetch_json(f"{server}{path}", headers={"Authorization": f"Bearer {token}"})

    def load():
        try:
            return json.loads(atlas.read(STATE))
        except atlas.AtlasError:
            return {}

    @atlas.method
    def lookup(params):
        return lookup_with(transport(params), params)

    @atlas.method
    def sync(params):
        return sync_with(transport(params), lambda body: atlas.post("/api/plugins/catalog/tools/add", body),
                         load, lambda s: atlas.write(STATE, json.dumps(s, indent=1)), params)

    atlas.serve()
