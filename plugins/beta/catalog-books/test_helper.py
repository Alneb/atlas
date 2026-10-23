"""`python3 test_helper.py`: Open Library's answers (cut down, in their real shapes) as the catalog sees them."""
import unittest

import helper

OL = "https://openlibrary.org"
ANSWERS = {
    f"{OL}/isbn/9780441172719.json": {"title": "Dune", "publishers": ["Ace"], "publish_date": "Aug 01, 1990", "number_of_pages": 535,
                                      "works": [{"key": "/works/OL893415W"}], "covers": [12345], "isbn_13": ["9780441172719"]},
    f"{OL}/works/OL893415W.json": {"title": "Dune", "first_publish_date": "1965", "authors": [{"author": {"key": "/authors/OL79034A"}}],
                                   "description": {"type": "/type/text", "value": "Set on the desert planet Arrakis…"},
                                   "subjects": ["Science fiction", "Accessible book", "nyt:mass-market-paperback=2021-11-07", "Fiction, science fiction, general", "Arrakis (Imaginary place)"]},
    f"{OL}/authors/OL79034A.json": {"name": "Frank Herbert"},
}


class Books(unittest.TestCase):
    def test_an_isbn_gives_the_work_its_author_and_the_editions_details(self):
        r = helper.lookup_with(ANSWERS.get, {"kind": "book", "ids": {"isbn": "9780441172719"}})
        f = r["fields"]
        self.assertEqual((f["title"], f["author"], f["year"], f["pages"], f["publisher"]), ("Dune", "Frank Herbert", 1965, 535, "Ace"))
        self.assertEqual(f["genres"], ["Science Fiction", "Arrakis (Imaginary Place)"], "Open Library's bookkeeping subjects left out")
        self.assertEqual((f["description"], f["cover"]), ("Set on the desert planet Arrakis…", "https://covers.openlibrary.org/b/id/12345-L.jpg"))
        self.assertEqual(r["ids"], {"openlibrary": "OL893415W"})

    def test_a_work_id_alone_and_a_goodreads_link_that_waits_for_its_page(self):
        f = helper.lookup_with(ANSWERS.get, {"kind": "book", "ids": {"openlibrary": "OL893415W"}})["fields"]
        self.assertEqual((f["title"], f["year"]), ("Dune", 1965))
        self.assertEqual(helper.lookup_with(ANSWERS.get, {"kind": "book", "ids": {"goodreads": "234225"}}), {"later": True})
        self.assertIn("skipped", helper.lookup_with(lambda u: None, {"kind": "book", "ids": {"isbn": "9780000000000"}}))


class ScienceBooks(unittest.TestCase):
    def test_science_by_its_subjects_never_science_fiction(self):
        self.assertTrue(helper.is_science(["Quantum theory", "Physics -- Textbooks"]))
        self.assertTrue(helper.is_science(["Mathematical physics"]))
        self.assertFalse(helper.is_science(["Science fiction", "Arrakis (Imaginary place)"]))
        self.assertFalse(helper.is_science(["Fiction, science fiction, general", "Physics"]), "a novel about a physicist is a novel")
        self.assertFalse(helper.is_science(["Cooking"]))

    def test_a_science_book_is_said_to_be_one(self):
        answers = dict(ANSWERS)
        answers[f"{OL}/works/OL893415W.json"] = dict(ANSWERS[f"{OL}/works/OL893415W.json"], title="Modern Quantum Mechanics", subjects=["Quantum theory", "Textbooks"])
        self.assertEqual(helper.lookup_with(answers.get, {"kind": "book", "ids": {"isbn": "9780441172719"}}).get("kind"), "science_book")
        self.assertNotIn("kind", helper.lookup_with(ANSWERS.get, {"kind": "book", "ids": {"isbn": "9780441172719"}}))


if __name__ == "__main__":
    unittest.main()
