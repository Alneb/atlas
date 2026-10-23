"""`python3 test_helper.py`: the request TubeArchivist gets, and what is left alone."""
import unittest

import helper


class TubeArchivist(unittest.TestCase):
    def test_a_video_is_queued_with_the_token_the_core_fills_in_and_the_note_links_the_archive(self):
        sent = []
        r = helper.archive_with(lambda q: sent.append(q) or {"ok": True}, True, {"settings": {"address": "https://tube.example.org/"}, "ids": {"youtube": "bkMKtf2V6Js"}})
        self.assertEqual(r, {"fields": {"tubearchivist": "https://tube.example.org/video/bkMKtf2V6Js/"}})
        self.assertIn('"youtube_id": "bkMKtf2V6Js"', sent[0]["body"])
        self.assertEqual(sent[0]["headers"]["Authorization"], {"secret": "token", "prefix": "Token "})
        self.assertIn("skipped", helper.archive_with(lambda q: self.fail("sent"), True, {"settings": {"address": "https://t"}, "ids": {}}))
        self.assertIn("skipped", helper.archive_with(lambda q: self.fail("sent"), True, {"settings": {"address": "https://t", "auto": False}, "ids": {"youtube": "x"}}))


if __name__ == "__main__":
    unittest.main()
