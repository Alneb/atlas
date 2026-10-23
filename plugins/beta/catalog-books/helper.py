"""Open Library for the catalog: `lookup` finds a book by ISBN (an edition, then its work) or by its Open Library id, and
answers the catalog's fields. Requests go through Atlas's core; the logic takes its transport, so test_helper.py runs
offline on cut-down copies of Open Library's answers."""
import os
import re

ME = os.environ.get("ATLAS_PLUGIN_ID", "catalog-books")
OL = "https://openlibrary.org"


def year_of(text):
    """'1965', 'August 1990', 'Jun 01, 1990' → the year."""
    m = re.search(r"\b(1[5-9]\d\d|20\d\d)\b", str(text or ""))
    return int(m.group(1)) if m else None


def text_of(v):
    """Open Library's descriptions are a string or `{type, value}`."""
    if isinstance(v, dict):
        v = v.get("value")
    return v.strip() if isinstance(v, str) and v.strip() else None


def one_or_list(names):
    names = [n for n in names if n]
    return (names[0] if len(names) == 1 else names) or None


def subjects(work):
    """A few readable subjects as genres: not Open Library's bookkeeping ("Accessible book", "nyt:…", "Fiction, general")."""
    out = []
    for s in work.get("subjects") or []:
        if not isinstance(s, str) or ":" in s or "," in s or s.lower() in ("accessible book", "protected daisy", "in library", "large type books", "fiction"):
            continue
        t = s.strip().title()
        if t not in out:
            out.append(t)
    return out[:5] or None


SCIENCE = re.compile(r"\b(physics|mathematic|algebra|calculus|geometry|topology|analysis \(mathematics\)|chemistry|biology|biochemistry|neuroscience|"
                     r"astronomy|astrophysics|cosmology|quantum|relativity|statistic|probability|computer science|programming|"
                     r"engineering|thermodynamics|mechanics|electromagnet|optics|textbooks?|sciences?)\b", re.I)


def is_science(subjects):
    """Subjects that say physics, mathematics, a science or a textbook — and none that say fiction ("Science fiction",
    "Fiction, science fiction") — make a science book."""
    subjects = [s for s in subjects or [] if isinstance(s, str)]
    if any(re.search(r"\bfiction\b", s, re.I) and not re.search(r"non-?fiction", s, re.I) for s in subjects):
        return False
    return any(SCIENCE.search(s) for s in subjects)


def lookup_with(get, params):
    ids = params.get("ids") or {}
    isbn, work_id, edition_id = ids.get("isbn"), ids.get("openlibrary"), ids.get("ol_edition")
    edition = None
    if isbn:
        edition = get(f"{OL}/isbn/{isbn}.json")
    elif edition_id:
        edition = get(f"{OL}/books/{edition_id}.json")
    if edition and not work_id:
        work_id = ((edition.get("works") or [{}])[0].get("key") or "").rsplit("/", 1)[-1] or None
    if not work_id and not edition:
        # a Goodreads link: the page (catalog-web) names the ISBN, then this is asked again
        return {"later": True} if ids.get("goodreads") and not isbn else {"fields": {}, "skipped": "Open Library does not know this book"}
    work = get(f"{OL}/works/{work_id}.json") if work_id else {}
    work = work or {}
    authors = []
    for a in (work.get("authors") or [])[:4]:
        key = ((a.get("author") or {}).get("key") or "")
        author = get(f"{OL}{key}.json") if key else None
        authors.append((author or {}).get("name"))
    if not any(authors) and edition:
        authors = [(get(f"{OL}{a.get('key')}.json") or {}).get("name") for a in (edition.get("authors") or [])[:4] if a.get("key")]
    covers = (edition or {}).get("covers") or work.get("covers") or []
    cover = next((f"https://covers.openlibrary.org/b/id/{c}-L.jpg" for c in covers if isinstance(c, int) and c > 0), None)
    edition = edition or {}
    fields = {
        "title": work.get("title") or edition.get("title"),
        "author": one_or_list(authors),
        "year": year_of(work.get("first_publish_date")) or year_of(edition.get("publish_date")),
        "pages": edition.get("number_of_pages"),
        "publisher": (edition.get("publishers") or [None])[0],
        "genres": subjects(work),
        "description": text_of(work.get("description")) or text_of(edition.get("description")),
        "cover": cover,
    }
    out_ids = {}
    if work_id:
        out_ids["openlibrary"] = work_id
    isbns = (edition.get("isbn_13") or []) + (edition.get("isbn_10") or [])
    if isbns and not isbn:
        out_ids["isbn"] = isbns[0]
    out = {"ids": out_ids, "fields": {k: v for k, v in fields.items() if v not in (None, "", [])}}
    if is_science(work.get("subjects")):
        out["kind"] = "science_book"
    elif params.get("kind") == "science_book":
        out["kind"] = "book"
    return out


if __name__ == "__main__":
    import atlas_plugin as atlas

    @atlas.method
    def lookup(params):
        return lookup_with(atlas.fetch_json, params)

    atlas.serve()
