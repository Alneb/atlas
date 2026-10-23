# The catalog's capture probe

A thousand-odd real captures run through the catalog's `preview` on a scratch vault, each checked against the kind
(and folder) it must become: the regression test for "capture anything and have it filed right".

- `build_corpus.py` builds `corpus1000.json` from public sources (Wikipedia category members with known kinds, a
  public Letterboxd member's films, IMDb links and bare ids, arXiv, Crossref DOIs, AniList/MAL, YouTube and YouTube
  Music, MusicBrainz's streaming links, Hacker News links, ISBNs, plain thoughts, links inside sentences);
  `fill_corpus.py` tops up thin categories. `corpus.py` is the first, hand-made 59.
- `setup.sh` (run in a scratch folder) makes `vault/` with every catalog plugin, the catalog's helper the dev build.
- Serve it: `ATLAS_NO_BROWSER=1 target/debug/atlas serve vault --port 7799`, then `python3 run1000.py` (resumable:
  `results1000.jsonl`, one line per capture) and `python3 run1000.py report` (by source, then by what went wrong).
  To rerun only the failures, keep the lines without `problems` and run again.

Each capture's verdict: plain text must not be catalogued; anything else must be the expected kind (`a|b` = either),
in the expected folder, with a real title (not "Untitled", a site name, a bot check).

Results (2026-10-17): first pass 780/1172; Wikipedia's 429s (320), arXiv's (22) and an Open Library
outage were most of it → `atlas.fetch` (paced, Retry-After), Wikipedia's one query-API request, title qualifiers,
wider wordings → **1143/1172 (97.5 %)**. What is left is mostly the corpus being stricter than the pages (a page in
"Manga series" describing its anime, an album page that redirects to its band). Wikipedia rate-limits a whole address
after a burst: run with a contact in Settings → Catalog · Wikipedia, and expect slow progress on its rows.
