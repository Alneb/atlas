"""The SDK's line protocol against a real helper process, the core played by the test (helper.rs)."""
import json
import os
import subprocess
import sys
import unittest

HELPER = """
import atlas_plugin as atlas

@atlas.method
def outer(params):
    return atlas.get("/a")

@atlas.method
def inner(params):
    return atlas.get("/b")

atlas.serve()
"""


class Protocol(unittest.TestCase):
    def setUp(self):
        env = {**os.environ, "PYTHONPATH": os.path.dirname(os.path.abspath(__file__))}
        self.p = subprocess.Popen([sys.executable, "-u", "-c", HELPER], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, env=env)

    def tearDown(self):
        self.p.stdin.close()
        self.p.wait(timeout=5)
        self.p.stdout.close()

    def send(self, obj):
        self.p.stdin.write(json.dumps(obj) + "\n")
        self.p.stdin.flush()

    def read(self):
        return json.loads(self.p.stdout.readline())

    def test_an_outer_calls_reply_arriving_during_a_nested_call_waits_for_it(self):
        # weather on the Boox: fill_today asked /api/today, which made the log, whose log_made came to the same helper;
        # today's reply then arrived during log_made's own call and was taken for a request ("no method None")
        self.send({"id": 1, "method": "outer"})
        self.assertEqual(self.read()["call"], 1)
        self.send({"id": 2, "method": "inner"})
        self.assertEqual(self.read()["call"], 2)
        self.send({"reply": 1, "status": 200, "body": "A"})
        self.send({"reply": 2, "status": 200, "body": "B"})
        self.assertEqual(self.read(), {"id": 2, "result": "B"})
        self.assertEqual(self.read(), {"id": 1, "result": "A"})


if __name__ == "__main__":
    unittest.main()
