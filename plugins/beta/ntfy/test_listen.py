"""listen.py `send` against a stand-in ntfy server: the text as the body of one POST to /<topic>, the title in the
address (UTF-8: an emoji fits, which an HTTP header could not carry), the token as a bearer. Run: python3 -m unittest"""
import http.server
import threading
import unittest
import urllib.parse

import listen


class Stand(http.server.BaseHTTPRequestHandler):
    got = []

    def do_POST(self):
        body = self.rfile.read(int(self.headers.get("content-length") or 0)).decode()
        Stand.got.append({"path": self.path, "auth": self.headers.get("authorization"), "body": body})
        self.send_response(403 if "closed" in self.path else 200)
        self.end_headers()
        self.wfile.write(b"{}")

    def log_message(self, *_):
        pass


class SendTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = http.server.HTTPServer(("127.0.0.1", 0), Stand)
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()
        cls.url = f"http://127.0.0.1:{cls.server.server_port}/"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def test_a_message_goes_to_the_topic_with_its_title_and_token(self):
        Stand.got.clear()
        r = listen.send({"text": "buy milk ✓", "title": "Lectures été 📚", "settings": {"server": self.url, "topic": "my phone"}, "secrets": {"token": "tk"}})
        self.assertEqual(r, {"sent": True})
        path, query = Stand.got[0]["path"].split("?")
        self.assertEqual(path, "/my%20phone")
        self.assertEqual(urllib.parse.parse_qs(query)["title"], ["Lectures été 📚"])
        self.assertEqual((Stand.got[0]["auth"], Stand.got[0]["body"]), ("Bearer tk", "buy milk ✓"))

    def test_no_token_no_header_and_the_server_s_refusal_said(self):
        Stand.got.clear()
        listen.send({"text": "x", "settings": {"server": self.url, "topic": "t"}})
        self.assertIsNone(Stand.got[0]["auth"])
        with self.assertRaisesRegex(RuntimeError, "answered 403"):
            listen.send({"text": "x", "settings": {"server": self.url, "topic": "closed"}})

    def test_a_missing_topic_or_text_is_said_before_anything_is_sent(self):
        with self.assertRaisesRegex(RuntimeError, "set the topic"):
            listen.send({"text": "x", "settings": {"server": self.url}})
        with self.assertRaisesRegex(RuntimeError, "nothing to send"):
            listen.send({"text": "  ", "settings": {"server": self.url, "topic": "t"}})


if __name__ == "__main__":
    unittest.main()
