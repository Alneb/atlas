"""notify.py against a stand-in ntfy server and an in-memory vault: messages filed in a note per source (the first
tag, else the topic), newest first, `unread` counted, a muted source still logged but not loud, nothing filed twice,
the inbox topic captured, and `send` through Apprise or ntfy. Run: python3 -m unittest test_notify"""
import http.server
import json
import os
import sys
import tempfile
import threading
import types
import unittest
import urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
FILES, CAPTURED = {}, []


class AtlasError(Exception):
    def __init__(self, why, status=None):
        super().__init__(why)
        self.status = status


def read(path):
    if path not in FILES:
        raise AtlasError("not found", 404)
    return FILES[path]


sys.modules["atlas_plugin"] = types.SimpleNamespace(
    method=lambda fn=None, name=None: fn, serve=lambda: None, AtlasError=AtlasError,
    read=read, write=lambda p, t: FILES.__setitem__(p, t), capture=lambda t: CAPTURED.append(t),
)
os.environ["ATLAS_PLUGIN_CACHE"] = tempfile.mkdtemp()
sys.path.insert(0, HERE)
import notify  # noqa: E402


class Stand(http.server.BaseHTTPRequestHandler):
    topics, posts = {}, []

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        topic = u.path.strip("/").split("/")[0]
        since = urllib.parse.parse_qs(u.query).get("since", [""])[0]
        msgs = Stand.topics.get(topic, [])
        ids = [m["id"] for m in msgs]
        start = ids.index(since) + 1 if since in ids else 0
        self.send_response(200)
        self.end_headers()
        for m in msgs[start:]:
            self.wfile.write((json.dumps({"event": "message", **m}) + "\n").encode())

    def do_POST(self):
        body = self.rfile.read(int(self.headers.get("content-length") or 0)).decode()
        Stand.posts.append({"path": self.path, "body": body})
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"{}")

    def log_message(self, *_):
        pass


class NotifyTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = http.server.HTTPServer(("127.0.0.1", 0), Stand)
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()
        cls.url = f"http://127.0.0.1:{cls.server.server_port}"

    def settings(self, **kw):
        return {"settings": {"server": self.url, "topics": "server", "folder": "notifications", **kw}, "secrets": {}}

    def test_messages_are_filed_by_source_newest_first_and_never_twice(self):
        Stand.topics["server"] = [
            {"id": "a1", "time": 1761354000, "title": "Backup done", "message": "2.1 GB", "tags": ["backups"], "priority": 3},
            {"id": "a2", "time": 1761354600, "title": "Backup failed", "message": "repository locked\nrestic said so", "tags": ["backups"], "priority": 5, "click": "https://example.org/b"},
            {"id": "a3", "time": 1761354700, "message": "untagged", "priority": 2},
        ]
        r = notify.sync(self.settings())
        self.assertEqual(r["new"], 3)
        note = FILES["notifications/backups.md"]
        self.assertTrue(note.startswith("---\ntype: notifications\nsource: backups\nfrom: ntfy: server\nmuted: false\nunread: 2\n---\n# Backups\n\n"), note)
        self.assertLess(note.index("Backup failed"), note.index("Backup done"), "newest first")
        self.assertIn("🔴 **Backup failed** — repository locked · [open](https://example.org/b) <!-- n=a2 -->\n  > restic said so", note)
        self.assertIn("untagged", FILES["notifications/server.md"], "no tag: the topic is the source")
        self.assertEqual({m["source"] for m in r["loud"]}, {"backups", "server"})
        # again: nothing new, nothing filed twice
        self.assertEqual(notify.sync(self.settings())["new"], 0)
        self.assertEqual(FILES["notifications/backups.md"].count("Backup failed"), 1)
        # a new one later on: on top, unread grows
        Stand.topics["server"].append({"id": "a4", "time": 1761355000, "title": "Backup done", "message": "again", "tags": ["backups"]})
        notify.sync(self.settings())
        note = FILES["notifications/backups.md"]
        self.assertIn("unread: 3", note)
        self.assertLess(note.index("again"), note.index("Backup failed"))

    def test_a_muted_source_is_logged_but_not_loud(self):
        FILES["notifications/updates.md"] = "---\ntype: notifications\nsource: updates\nmuted: true\nunread: 0\n---\n# Updates\n\n"
        Stand.topics["server"] = [{"id": "u1", "time": 1761356000, "title": "jellyfin 10.11", "message": "updated", "tags": ["updates"]}]
        notify._keep_since("server", "")
        os.remove(notify._since_file("server"))
        r = notify.sync(self.settings())
        self.assertIn("jellyfin 10.11", FILES["notifications/updates.md"])
        self.assertFalse([m for m in r["loud"] if m["source"] == "updates"])
        self.assertTrue(notify.muted({"muted": "2999-01-01"}))
        self.assertFalse(notify.muted({"muted": "2000-01-01"}))

    def test_the_inbox_is_captured_and_send_goes_through_apprise_or_ntfy(self):
        Stand.topics["inbox"] = [{"id": "i1", "time": 1761357000, "message": "buy milk"}]
        notify.sync(self.settings(topics="", inbox="inbox"))
        self.assertEqual(CAPTURED[-1], "buy milk")
        Stand.posts.clear()
        self.assertEqual(notify.send({"text": "done", "title": "Job", "settings": {"apprise": f"{self.url}/notify/key"}})["through"], "apprise")
        self.assertEqual(json.loads(Stand.posts[-1]["body"]), {"title": "Job", "body": "done"})
        self.assertEqual(notify.send({"text": "done", "settings": {"server": self.url, "phone_topic": "me"}, "secrets": {}})["through"], "ntfy")
        self.assertTrue(Stand.posts[-1]["path"].startswith("/me?title=Atlas"))


if __name__ == "__main__":
    unittest.main()
