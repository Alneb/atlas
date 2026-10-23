"""`python3 test_helper.py`: the request the settings make, and what is left alone."""
import json
import unittest

import helper


class Downloader(unittest.TestCase):
    def test_a_song_is_sent_as_the_settings_shape_it_and_other_kinds_are_left_alone(self):
        sent = []
        s = {"address": "https://dl.example.org/add", "body": '{"url": "{url}", "format": "mp3", "name": "{artist} - {title}"}', "kinds": ["song"], "header": "X-Api-Key"}
        p = {"kind": "song", "settings": s, "ids": {"youtube": "fHiGbolFFGw", "url": "https://music.youtube.com/watch?v=fHiGbolFFGw"}, "props": {"title": 'Say "hi"', "artist": "Radiohead"}}
        r = helper.send_with(lambda req: sent.append(req) or {"ok": True, "status": 200}, True, p)
        self.assertEqual(r, {"fields": {"downloaded": "requested"}})
        self.assertEqual(sent[0]["headers"]["X-Api-Key"], {"secret": "token"})
        self.assertEqual(json.loads(sent[0]["body"]), {"url": "https://music.youtube.com/watch?v=fHiGbolFFGw", "format": "mp3", "name": 'Radiohead - Say "hi"'})
        self.assertIn("skipped", helper.send_with(lambda req: self.fail("sent"), True, {**p, "kind": "video"}))
        self.assertEqual(helper.send_with(lambda req: {"signin": {"kind": "door"}}, False, p), {"signin": {"kind": "door"}})


if __name__ == "__main__":
    unittest.main()
