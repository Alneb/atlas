"""`python3 test_helper.py`: MusicBrainz's answers (cut down) as the catalog sees them — offline."""
import unittest

import helper

RG = {"id": "b1392450-e666-3926-a536-22c65f834433", "title": "OK Computer", "first-release-date": "1997-05-21",
      "artist-credit": [{"name": "Radiohead"}], "genres": [{"name": "alternative rock", "count": 9}, {"name": "art rock", "count": 7}],
      "releases": [{"media": [{"track-count": 12}]}]}
REC = {"id": "rec-1", "title": "Never Gonna Give You Up", "length": 213000, "first-release-date": "1987-07-27",
       "artist-credit": [{"name": "Rick Astley"}], "genres": [],
       "releases": [{"title": "Big Tunes", "date": "1990", "status": "Official", "release-group": {"primary-type": "Album", "secondary-types": ["Compilation"]}},
                    {"title": "Whenever You Need Somebody", "date": "1987-11-16", "status": "Official", "release-group": {"primary-type": "Album", "secondary-types": []}}]}


def web(answers):
    asked = []
    def get(url):
        asked.append(url)
        for key, value in answers.items():
            if key in url:
                return value
        return None
    return get, asked


class Music(unittest.TestCase):
    def test_a_videos_name_and_a_channels_name_become_the_songs_and_the_artists(self):
        self.assertEqual(helper.clean_title("Rick Astley - Never Gonna Give You Up (Official Video) [4K Remaster]"), "Never Gonna Give You Up")
        self.assertEqual(helper.clean_title("Bohemian Rhapsody (Remastered 2011)"), "Bohemian Rhapsody")
        self.assertEqual([helper.clean_artist(n) for n in ["Queen - Topic", "RickAstleyVEVO", "Radiohead Official"]], ["Queen", "Rick Astley", "Radiohead"])

    def test_a_songs_album_is_its_first_studio_album_not_a_compilation(self):
        self.assertEqual(helper.first_album(REC["releases"]), "Whenever You Need Somebody")

    def test_an_album_by_its_link_relation_gives_artist_year_tracks_genres_and_cover(self):
        get, asked = web({"/url?resource=": {"relations": [{"release-group": {"id": RG["id"]}}]}, f"/release-group/{RG['id']}": RG})
        r = helper.lookup_with(get, {"kind": "album", "url": "https://open.spotify.com/album/6dVIqQ8qmQ5GBnJ9shOYGE"})
        self.assertEqual(r["ids"], {"musicbrainz": RG["id"]})
        f = r["fields"]
        self.assertEqual((f["title"], f["artist"], f["year"], f["tracks"]), ("OK Computer", "Radiohead", 1997, 12))
        self.assertEqual(f["genres"], ["Alternative Rock", "Art Rock"])
        self.assertTrue(f["cover"].endswith(f"/release-group/{RG['id']}/front-500"))
        self.assertIn("open.spotify.com", asked[0])

    def test_a_song_is_searched_only_with_its_artist_and_the_earliest_exact_title_wins(self):
        get, _ = web({})
        self.assertEqual(helper.lookup_with(get, {"kind": "song", "hints": {"title": "Never Gonna Give You Up"}}), {"fields": {}, "skipped": "MusicBrainz has no sure match"})
        hits = {"recordings": [
            {"id": "live", "title": "Never Gonna Give You Up", "score": 100, "first-release-date": "2010", "disambiguation": "live"},
            {"id": "cover", "title": "Never Gonna Give You Up (cover)", "score": 95, "first-release-date": "1999"},
            {"id": "rec-1", "title": "Never Gonna Give You Up", "score": 100, "first-release-date": "1987-07-27"},
            {"id": "late", "title": "Never Gonna Give You Up", "score": 100, "first-release-date": "2019"}]}
        get, asked = web({"/recording?query=": hits, "/recording/rec-1": REC})
        r = helper.lookup_with(get, {"kind": "song", "hints": {"title": "Rick Astley - Never Gonna Give You Up (Official Video)", "channel": "RickAstleyVEVO"}})
        self.assertEqual(r["ids"], {"musicbrainz": "rec-1"})
        self.assertEqual((r["fields"]["duration"], r["fields"]["album"]), ("3:33", "Whenever You Need Somebody"))
        self.assertIn("artist%3A%22Rick%20Astley%22", asked[0])

    def test_nothing_to_go_on_waits_for_the_page_and_an_unsure_hit_is_not_filed(self):
        get, _ = web({})
        self.assertEqual(helper.lookup_with(get, {"kind": "album"}), {"later": True})
        get, _ = web({"/release-group?query=": {"release-groups": [{"id": "x", "title": "OK Computer", "score": 72}]}})
        self.assertIn("skipped", helper.lookup_with(get, {"kind": "album", "hints": {"title": "OK Computer", "artist": "Radiohead"}}))
        self.assertIn("skipped", helper.lookup_with(get, {"kind": "video"}))


if __name__ == "__main__":
    unittest.main()
