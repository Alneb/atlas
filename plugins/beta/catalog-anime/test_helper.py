"""`python3 test_helper.py`: AniList's and MangaDex's answers (cut down, in their real shapes)."""
import unittest

import helper

BERSERK = {"data": {"Media": {"id": 30002, "idMal": 2, "status": "RELEASING", "chapters": None, "volumes": None, "genres": ["Action", "Adventure", "Drama", "Fantasy", "Horror", "Psychological"],
           "description": "His name is Guts, the Black Swordsman.<br><br>\n(Source: Dark Horse)", "title": {"romaji": "Berserk", "english": "Berserk", "native": "ベルセルク"},
           "startDate": {"year": 1989}, "coverImage": {"extraLarge": "https://s4.anilist.co/b30002.jpg"},
           "staff": {"edges": [{"role": "Story & Art", "node": {"name": {"full": "Kentarou Miura"}}}, {"role": "Translator (English)", "node": {"name": {"full": "Someone"}}}]}}}}


class Anime(unittest.TestCase):
    def test_a_manga_with_its_author_original_title_and_status(self):
        asked = []
        r = helper.lookup_with(lambda q, v: asked.append(v) or BERSERK, None, {"kind": "manga", "ids": {"anilist": "30002"}})
        self.assertEqual(asked, [{"type": "MANGA", "id": 30002}])
        f = r["fields"]
        self.assertEqual((f["title"], f["original_title"], f["language"], f["author"], f["year"], f["publication"]), ("Berserk", "ベルセルク", "ja", "Kentarou Miura", 1989, "ongoing"))
        self.assertEqual(f["description"], "His name is Guts, the Black Swordsman.", "markup and the source line dropped")
        self.assertEqual(r["ids"], {"anilist": "30002", "myanimelist": "2"})

    def test_a_mangadex_title_is_found_by_the_links_mangadex_keeps(self):
        dex = {"data": {"attributes": {"links": {"al": "30002", "mal": "2"}}}}
        asked = []
        helper.lookup_with(lambda q, v: asked.append(v) or BERSERK, lambda u: dex, {"kind": "manga", "ids": {"mangadex": "801513ba-a712-498c-8f57-cae55b38cc92"}})
        self.assertEqual(asked[0]["id"], 30002)
        self.assertIn("skipped", helper.lookup_with(None, lambda u: {"data": {"attributes": {"links": {}}}}, {"kind": "manga", "ids": {"mangadex": "x"}}))


if __name__ == "__main__":
    unittest.main()
