"""`python3 test_helper.py` (offline) · `--live` (asks YouTube's oEmbed)."""
import json
import re
import sys
import tomllib
import unittest
import urllib.request

import helper

with open("plugin.toml", "rb") as f:
    PATTERNS = [(re.compile(p["pattern"].replace("(?i)", ""), re.I), p["kind"]) for p in tomllib.load(f)["contributes"]["catalog"]["recognize"]]


def recognise(text):
    return [(k, m.group(1)) for rx, k in PATTERNS for m in [rx.search(text)] if m]


class YouTube(unittest.TestCase):
    def test_every_link_shape_is_recognised_once_and_music_is_a_song(self):
        cases = {
            "https://www.youtube.com/watch?v=bkMKtf2V6Js&si=abc": [("video", "bkMKtf2V6Js")],
            "https://youtu.be/bkMKtf2V6Js?si=tracking": [("video", "bkMKtf2V6Js")],
            "https://m.youtube.com/watch?feature=share&v=bkMKtf2V6Js": [("video", "bkMKtf2V6Js")],
            "https://www.youtube.com/shorts/aBcDeFgHiJk": [("video", "aBcDeFgHiJk")],
            "https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=RDAMVM": [("song", "dQw4w9WgXcQ")],
            "see youtube.com/watch?v=dQw4w9WgXcQ": [("video", "dQw4w9WgXcQ")],
        }
        for text, want in cases.items():
            self.assertEqual(recognise(text), want, text)

    def test_a_song_takes_its_artist_from_the_topic_channel_and_the_address_is_clean(self):
        r = helper.lookup_with(lambda u: {"title": "Paranoid Android", "author_name": "Radiohead - Topic"}, {"kind": "song", "ids": {"youtube": "fHiGbolFFGw"}})
        self.assertEqual(r["ids"], {"youtube": "fHiGbolFFGw", "url": "https://music.youtube.com/watch?v=fHiGbolFFGw"})
        self.assertEqual((r["fields"]["artist"], r["fields"]["title"]), ("Radiohead", "Paranoid Android"))
        gone = helper.lookup_with(lambda u: None, {"kind": "video", "ids": {"youtube": "x" * 11}})
        self.assertIn("skipped", gone)
        self.assertEqual(gone["ids"]["url"], "https://www.youtube.com/watch?v=xxxxxxxxxxx")


if __name__ == "__main__":
    if "--live" in sys.argv:
        get = lambda u: json.load(urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "Atlas"}), timeout=15))
        print(json.dumps(helper.lookup_with(get, {"kind": "video", "ids": {"youtube": "bkMKtf2V6Js"}}), ensure_ascii=False))
    else:
        unittest.main()
