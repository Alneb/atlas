"""Offline tests of the Syncthing helper: the folder found by path, the key read from the config, one scan per path."""
import unittest
import urllib.error

from helper import folder_of, key_from_config, scan_with


class Scan(unittest.TestCase):
    def test_the_deepest_folder_holding_the_vault(self):
        folders = [{"id": "home", "path": "/home/u"}, {"id": "work", "path": "/home/u/Work/"}, {"id": "other", "path": "/home/u/Workx"}]
        self.assertEqual(folder_of(folders, "/home/u/Work"), ("work", ""))
        self.assertEqual(folder_of(folders, "/home/u/Work/sub"), ("work", "sub"))
        self.assertEqual(folder_of(folders, "/srv/elsewhere"), None)

    def test_the_key_from_syncthings_config(self):
        cfg = {"/c.xml": "<gui><apikey>abc123</apikey></gui>"}
        read = lambda p: cfg.get("/c.xml") if p.endswith("config.xml") and "state" in p else None
        self.assertEqual(key_from_config(read), "abc123")
        self.assertEqual(key_from_config(lambda p: None), None)

    def test_each_changed_path_scanned_in_the_vaults_folder_and_the_cache_never(self):
        asked = []

        def request(method, url, key):
            asked.append((method, url, key))
            return [{"id": "work", "path": "/home/u/Work"}] if url.endswith("/rest/config/folders") else None

        out = scan_with(request, lambda p: None, "/home/u/Work", {"paths": ["notes/a b.md", ".atlas/cache/x"], "secrets": {"api_key": "k"}, "settings": {}})
        self.assertEqual(out, {"folder": "work", "scanned": 1})
        self.assertEqual(asked[-1], ("POST", "http://127.0.0.1:8384/rest/db/scan?folder=work&sub=notes%2Fa+b.md", "k"))

    def test_no_folder_no_key_or_no_syncthing_running_is_skipped_quietly(self):
        # the vault syncs to the server and phones, which have no Syncthing: a quiet skip, not an error per batch
        self.assertIn("skipped", scan_with(lambda m, u, k: [], lambda p: None, "/v", {"paths": ["a.md"], "secrets": {"api_key": "k"}}))
        self.assertIn("skipped", scan_with(lambda m, u, k: [], lambda p: None, "/v", {"paths": ["a.md"]}))

        def refused(method, url, key):
            raise urllib.error.URLError(ConnectionRefusedError(111, "Connection refused"))
        self.assertIn("not running", scan_with(refused, lambda p: None, "/v", {"paths": ["a.md"], "secrets": {"api_key": "k"}})["skipped"])

    def test_a_wrong_key_still_fails(self):
        def forbidden(method, url, key):
            raise urllib.error.HTTPError(url, 403, "Forbidden", {}, None)
        with self.assertRaises(urllib.error.HTTPError):
            scan_with(forbidden, lambda p: None, "/v", {"paths": ["a.md"], "secrets": {"api_key": "wrong"}})


if __name__ == "__main__":
    unittest.main()
