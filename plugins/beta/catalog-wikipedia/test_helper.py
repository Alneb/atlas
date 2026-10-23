"""`python3 test_helper.py`: Wikipedia summaries and pages (cut down) as the catalog sees them."""
import unittest

import helper


def wiki(description, links=()):
    """The query API's answer: the page's description and external links."""
    return lambda u: {"query": {"pages": [{"title": "X", "description": description, "extlinks": [{"url": l} for l in links]}]}}


class Wikipedia(unittest.TestCase):
    def test_one_request_asks_the_description_and_links_of_the_decoded_title(self):
        self.assertEqual(helper.query_url("es", "%C2%A1Caigan_las_rosas_blancas%21"),
                         "https://es.wikipedia.org/w/api.php?action=query&prop=description%7Cextlinks&titles=%C2%A1Caigan_las_rosas_blancas%21&ellimit=500&redirects=1&format=json&formatversion=2")

    def test_descriptions_say_what_a_page_is_about_in_several_languages(self):
        for d, kind in [("2023 film by Ari Aster", "movie"), ("Japanese jidaigeki film", "movie"), ("película de 2026 dirigida por Los Javis", "movie"),
                        ("American crime drama TV series", "show"), ("2000 studio album by Radiohead", "album"), ("1965 science fiction novel by Frank Herbert", "book"),
                        ("Japanese manga series", "manga"), ("English rock band", "artist"), ("canción de Rosalía", "song"), ("Physical phenomenon", None),
                        # wordings that were filed as web pages in the 1000-capture run
                        ("Series of Dragonlance novels", "book"), ("2016 American television drama", "show"), ("American daytime television soap opera (since 1973)", "show"),
                        ("1973 treatise by Hawking and Ellis", "book"), ("Collection of gekiga short stories by Yoshihiro Tatsumi", "manga"),
                        ("1995 cyberpunk original video animation series", "anime"), ("2019 Hong Kong documentary by Cheuk Cheung", "movie"),
                        ("cortometraje español de 2002", "movie"), ("Swedish hip hop group", "artist"), ("Dutch dance music group", "artist"),
                        ("American a cappella group", "artist"), ("Taiwanese indigenous song and dance troupe", "artist"), ("Ethnic group in Peru", None), ("1975 Australian television film", "movie"), ("British-born American physicist", None)]:
            self.assertEqual(helper.kind_of(d), kind, d)

    def test_a_film_page_gives_its_own_ids_not_the_books_it_cites(self):
        j = wiki("2023 film by Ari Aster", ["https://www.imdb.com/title/tt13521006/", "https://books.google.com/books?isbn=9781841505510"])
        c = helper.recognize_with(j, {"text": "https://en.wikipedia.org/wiki/Beau_Is_Afraid"})["candidates"][0]
        self.assertEqual((c["kind"], c["ids"]), ("movie", {"url": "https://en.wikipedia.org/wiki/Beau_Is_Afraid", "imdb": "tt13521006"}))

    def test_a_page_about_something_else_stays_a_web_page_and_other_links_are_not_asked(self):
        j = wiki("Physical phenomenon")
        self.assertEqual(helper.recognize_with(j, {"text": "https://en.wikipedia.org/wiki/Quantum_entanglement"}), {"candidates": []})
        self.assertEqual(helper.recognize_with(None, {"text": "https://example.org/wiki/x"}), {"candidates": []})

    def test_a_titles_qualifier_files_it_when_wikipedia_is_busy(self):
        def busy(url):
            raise RuntimeError("Wikipedia answered 429")
        got = helper.recognize_with(busy, {"url": "https://en.wikipedia.org/wiki/Apollo_11_(2019_film)"})["candidates"][0]
        self.assertEqual((got["kind"], got["ids"]), ("movie", {"url": "https://en.wikipedia.org/wiki/Apollo_11_(2019_film)"}))
        self.assertEqual(helper.qualifier("OK_Computer_(album)"), "album")
        self.assertEqual(helper.kind_of(helper.qualifier("Blur_(band)")), "artist")
        j = wiki("2010 single by Narsha from the album Bbi Ri Bba Bba")
        self.assertEqual(helper.recognize_with(j, {"url": "https://en.wikipedia.org/wiki/Bbi_Ri_Bba_Bba_(Narsha_song)"})["candidates"][0]["kind"], "song")
        with self.assertRaises(RuntimeError):  # no qualifier: the error is reported, never filed as a web page
            helper.recognize_with(busy, {"url": "https://en.wikipedia.org/wiki/Arctic_Dogs"})


if __name__ == "__main__":
    unittest.main()

