"""`python3 test_helper.py`: TMDB answers (cut down) as the catalog sees them."""
import unittest

import helper

SEARCH = {"results": [
    {"media_type": "movie", "id": 438631, "title": "Dune", "release_date": "2021-09-15", "poster_path": "/d5.jpg"},
    {"media_type": "movie", "id": 841, "title": "Dune", "release_date": "1984-12-14"},
    {"media_type": "tv", "id": 90228, "name": "Dune: Prophecy", "first_air_date": "2024-11-17"},
    {"media_type": "person", "id": 1, "name": "Someone"},
]}
MOVIE = {"title": "Dune", "original_title": "Dune", "release_date": "2021-09-15", "overview": "Paul…", "genres": [{"name": "Science Fiction"}], "runtime": 155, "poster_path": "/d5.jpg",
         "credits": {"crew": [{"job": "Director", "name": "Denis Villeneuve"}, {"job": "Writer", "name": "Eric Roth"}], "cast": [{"name": "Timothée Chalamet"}, {"name": "Zendaya"}]},
         "external_ids": {"imdb_id": "tt1160419", "wikidata_id": "Q60834962"}}


SITE_PAGE = """<script type="application/ld+json">
/* <![CDATA[ */
{"@context":"https://schema.org","@type":"Movie","name":"The Realm","description":"Manuel, a Spanish politician.","duration":"PT2H12M","genre":["Thriller","Drama"],"image":"https://image.tmdb.org/t/p/w500/x.jpg","releasedEvent":[{"@type":"PublicationEvent","startDate":"2018-09-28"}]}
/* ]]> */
</script>
<ol class="people no_image"><li class="profile">
  <p><a href="/person/1-rodrigo-sorogoyen?language=en-US">Rodrigo Sorogoyen</a></p>
  <p class="character">Director, Writer</p>
</li><li class="profile">
  <p><a href="/person/2-isabel-pena">Isabel Pe&ntilde;a</a></p>
  <p class="character">Writer</p></li></ol>
<ol class="people scroller"><li class="card"><p><a href="/person/3-antonio">Antonio de la Torre</a></p>
  <p class="character">Manuel</p></li></ol>
<p class="wrap"><strong>Original Title</strong> El reino</p>
<p><strong><bdi>Original Language</bdi></strong> Spanish</p>"""
SITE_SEARCH = """<div class="comp:media-card w-full"><a data-media-type="movie" href="/movie/841-dune?language=en-US"><img alt="Dune"></a>
<a class="font-normal" href="/movie/841-dune?language=en-US"><h2 class="font-semibold"><span>Dune</span></h2></a><span class="release_date w-full">February  6, 1985</span></div>
<div class="comp:media-card w-full"><a class="font-normal" href="/movie/438631-dune?language=en-US"><h2 class="font-semibold"><span>Dune</span></h2></a><span class="release_date w-full">September 15, 2021</span></div>"""


class Tmdb(unittest.TestCase):
    def test_words_with_a_year_give_the_matching_films_and_series_to_pick_from(self):
        asked = []
        r = helper.search_with(lambda u: asked.append(u) or SEARCH, {"text": "Dune 2021"})
        self.assertIn("query=Dune", asked[0])
        self.assertEqual([c["ids"]["tmdb"] for c in r["candidates"]], ["438631"], "1984 and 2024 are more than a year away")
        r = helper.search_with(lambda u: SEARCH, {"text": "Dune"})
        self.assertEqual([c["label"] for c in r["candidates"]], ["Dune (2021)", "Dune (1984)", "Dune: Prophecy (2024) · series"])
        self.assertEqual(helper.search_with(lambda u: self.fail("asked"), {"text": "https://x.org"}), {"candidates": []})

    def test_details_in_the_catalogs_words_and_the_other_ids(self):
        r = helper.details_with(lambda u: MOVIE, {"kind": "movie", "ids": {"tmdb": "438631"}})
        self.assertEqual(r["ids"], {"tmdb": "438631", "imdb": "tt1160419"})
        f = r["fields"]
        self.assertEqual((f["director"], f["cast"][0], f["year"], f["cover"], f["duration"]), ("Denis Villeneuve", "Timothée Chalamet", 2021, "https://image.tmdb.org/t/p/w500/d5.jpg", "2h 35m"))
        self.assertNotIn("original_title", f, "the same as the title")

    def test_a_film_in_a_language_the_vault_keeps_is_described_in_it(self):
        realm = dict(MOVIE, title="The Realm", original_title="El reino", original_language="es", overview="A politician…")
        asked = []
        def get(u):
            asked.append(u)
            return {"overview": "Manuel López-Vidal es un político…", "genres": [{"name": "Suspense"}]} if "language=es" in u else realm
        f = helper.details_with(get, {"kind": "movie", "ids": {"tmdb": "517331"}, "languages": ["es"]})["fields"]
        self.assertEqual((f["title"], f["original_title"], f["language"]), ("The Realm", "El reino", "es"), "the engine swaps the titles")
        self.assertEqual((f["description"], f["genres"]), ("Manuel López-Vidal es un político…", ["Suspense"]))
        self.assertEqual(len(asked), 2)

    def test_an_imdb_id_is_found_first(self):
        calls = []
        def get(u):
            calls.append(u)
            return {"movie_results": [{"id": 438631}]} if "/find/" in u else MOVIE
        r = helper.details_with(get, {"kind": "movie", "ids": {"imdb": "tt1160419"}})
        self.assertEqual(r["ids"]["tmdb"], "438631")
        self.assertIn("/find/tt1160419?external_source=imdb_id", calls[0])

    def test_without_a_token_the_website_says_the_same(self):
        f = helper.page_fields(SITE_PAGE, "movie")
        self.assertEqual((f["title"], f["original_title"], f["year"], f["duration"], f["language"]), ("The Realm", "El reino", 2018, "2h 12m", "es"))
        self.assertEqual((f["director"], f["cast"], f["genres"]), ("Rodrigo Sorogoyen", ["Antonio de la Torre"], ["Thriller", "Drama"]))
        self.assertEqual(helper.search_page(SITE_SEARCH, "movie"), [("841", "Dune", 1985), ("438631", "Dune", 2021)])
        got = helper.site_search_with(lambda u: SITE_SEARCH if "/search/movie" in u else "", {"text": "Dune 2021"})
        self.assertEqual([c["ids"]["tmdb"] for c in got["candidates"]], ["438631"], "the year narrows it")
        es = SITE_PAGE.replace("Manuel, a Spanish politician.", "Manuel, un influyente vicesecretario.")
        r = helper.site_details_with(lambda u: es if "language=es" in u else SITE_PAGE, {"kind": "movie", "ids": {"tmdb": "517331"}, "languages": ["es"]})
        self.assertEqual(r["fields"]["description"], "Manuel, un influyente vicesecretario.", "a kept language: its synopsis")

    def test_a_series_listed_as_a_film_is_read_from_its_series_page(self):
        asked = []
        es = SITE_PAGE.replace("Manuel, a Spanish politician.", "Antidisturbios, en español.")
        get = lambda u: asked.append(u) or (es if "language=es" in u else SITE_PAGE)
        r = helper.site_details_with(get, {"kind": "movie", "ids": {"tmdb": "tv/96005"}, "languages": ["es"]})
        self.assertTrue(all("/tv/96005?" in u for u in asked), asked)
        self.assertEqual((r["kind"], r["ids"]["tmdb"], r["fields"]["description"]), ("movie", "tv/96005", "Antidisturbios, en español."))
        api = helper.details_with(lambda u: asked.append(u) or {**MOVIE, "original_language": "es"}, {"kind": "movie", "ids": {"tmdb": "tv/96005"}})
        self.assertIn("/tv/96005?", asked[-1])
        self.assertEqual(api["ids"]["tmdb"], "tv/96005")


if __name__ == "__main__":
    unittest.main()
