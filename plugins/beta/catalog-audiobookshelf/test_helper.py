"""`python3 test_helper.py`: Audiobookshelf's answers (cut down) as the catalog sees them."""
import unittest

import helper

SERVER = "https://abs.example.org"
ITEM = {  # /api/libraries/<id>/items: the minified shape
    "id": "li_dune", "media": {"duration": 76680.5, "metadata": {
        "title": "Dune", "authorName": "Frank Herbert", "narratorName": "Scott Brick, Orlagh Cassidy",
        "publishedYear": "2007", "publisher": "Macmillan Audio", "isbn": "978-1-4272-0103-5", "genres": ["Science Fiction"]}},
}
EXPANDED = {"id": "li_dune", "media": {"duration": 76680.5, "metadata": {"title": "Dune", "authors": [{"id": "a1", "name": "Frank Herbert"}], "narrators": ["Scott Brick"], "isbn": "9781427201035"}}}
SETTINGS = {"settings": {"server": SERVER + "/"}, "secrets": {"token": "t"}}


def server(answers):
    asked = []
    def get(path):
        asked.append(path)
        return answers.get(path.split("?")[0])
    return get, asked


class Audiobookshelf(unittest.TestCase):
    def test_an_item_gives_narrator_listening_time_and_the_link(self):
        b = helper.book_of(ITEM, SERVER)
        self.assertEqual(b["ids"], {"audiobookshelf": "li_dune", "isbn": "9781427201035"})
        self.assertEqual(b["fields"]["narrator"], ["Scott Brick", "Orlagh Cassidy"])
        self.assertEqual((b["fields"]["duration"], b["fields"]["year"], b["fields"]["audiobook"]), ("21h 18m", 2007, f"{SERVER}/item/li_dune"))
        self.assertEqual(helper.book_of(EXPANDED, SERVER)["fields"]["author"], "Frank Herbert")

    def test_a_book_is_found_by_isbn_and_never_by_a_near_title(self):
        get, asked = server({"/api/libraries": {"libraries": [{"id": "L1", "mediaType": "book"}, {"id": "P", "mediaType": "podcast"}]},
                             "/api/libraries/L1/search": {"book": [{"libraryItem": {"id": "x", "media": {"metadata": {"title": "Dune Messiah"}}}}, {"libraryItem": EXPANDED}]}})
        got = helper.lookup_with(get, {**SETTINGS, "kind": "book", "ids": {"isbn": "9781427201035"}})
        self.assertEqual(got["ids"]["audiobookshelf"], "li_dune")
        self.assertFalse(any("/P/" in a for a in asked), "podcast libraries are not asked")
        get, _ = server({"/api/libraries": {"libraries": [{"id": "L1"}]}, "/api/libraries/L1/search": {"book": [{"libraryItem": {"id": "x", "media": {"metadata": {"title": "Dune Messiah"}}}}]}})
        self.assertIn("skipped", helper.lookup_with(get, {**SETTINGS, "kind": "book", "ids": {"isbn": "1"}, "hints": {"title": "Dune"}}))

    def test_without_a_server_nothing_is_asked(self):
        self.assertIn("skipped", helper.lookup_with(None, {"kind": "book", "ids": {"isbn": "9781427201035"}}))

    def test_sync_files_new_and_newly_finished_books_once(self):
        get, _ = server({"/api/libraries": {"libraries": [{"id": "L1", "mediaType": "book"}]},
                         "/api/libraries/L1/items": {"results": [ITEM], "total": 1},
                         "/api/me": {"mediaProgress": [{"libraryItemId": "li_dune", "isFinished": True}]}})
        added, state = [], {}
        run = lambda: helper.sync_with(get, added.append, lambda: state, lambda s: state.update(s), SETTINGS)
        self.assertEqual(run()["filed"], 1)
        self.assertEqual(added[0]["kind"], "book")
        self.assertEqual(added[0]["own"], {"status": "[[read]]"})
        self.assertEqual(added[0]["ids"]["audiobookshelf"], "li_dune")
        self.assertEqual(run()["filed"], 0, "nothing new: nothing sent")


if __name__ == "__main__":
    unittest.main()
