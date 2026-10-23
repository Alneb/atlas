"""The SSH plugin's helper (plugins/stable/ssh/engine, the `atlas-ssh` binary; session.py before 0.7.0): `terminal`, the agent's "open me an ssh
terminal" (ssh_terminal); and the Files pane's sftp calls (sftp.py), against the machine's own sftp-server
started by a stand-in ssh on a local folder. The helper asks the page for a tab (a `tab` event) and answers only once the
page says the tab is open (`tab_opened`); with no page answering it fails instead of claiming a tab.
A stand-in ssh (ATLAS_SSH_BIN) keeps it off the network; HOME is a temporary folder, so no real config.
Long-lived sessions (`open` / `run` / `read`) against a stand-in ssh that runs a local shell.
Run: cargo build -p atlas-ssh && python3 -m unittest discover -s scripts/vault/tests -p 'test_ssh*'
(ATLAS_SSH_HELPER: another build of the helper)."""
import json, os, queue, shutil, subprocess, sys, tempfile, threading, time, unittest
from pathlib import Path

HELPER = Path(os.environ.get("ATLAS_SSH_HELPER") or Path(__file__).parents[3] / "target/debug/atlas-ssh")
# `ssh -O check` (is a connection up?) says no; `ssh -G` (the config) says nothing; anything else is fine
FAKE_SSH = """#!/bin/sh
for a in "$@"; do [ "$a" = "-O" ] && exit 255; done
exit 0
"""


# For the Files pane: the connection is "up" once the file `up` exists; until then a BatchMode ssh is refused. The sftp subsystem runs the local sftp-server in $ROOT.
FAKE_SFTP_SSH = """#!/bin/sh
dir=$(dirname "$0")
sub=""
for a in "$@"; do
  case "$a" in -O) [ -e "$dir/up" ] && exit 0; exit 255 ;; -G) exit 0 ;; -s) sub=1 ;; BatchMode=yes) [ -e "$dir/up" ] || exit 255 ;; esac
  last="$a"
done
if [ -n "$sub" ]; then
  for s in /usr/libexec/openssh/sftp-server /usr/lib/openssh/sftp-server /usr/lib/ssh/sftp-server; do [ -x "$s" ] && exec "$s" -d "$dir/remote"; done
  exit 1
fi
exit 0
"""
SFTP_SERVER = next((s for s in ("/usr/libexec/openssh/sftp-server", "/usr/lib/openssh/sftp-server", "/usr/lib/ssh/sftp-server") if os.access(s, os.X_OK)), None)


class Helper:
    """The helper as Atlas runs it: JSON lines in, answers and events out."""

    def __init__(self, tab_wait, fake_ssh=FAKE_SSH):
        self.dir = tempfile.mkdtemp()
        fake = os.path.join(self.dir, "ssh")
        Path(fake).write_text(fake_ssh)
        os.chmod(fake, 0o755)
        self.vault = os.path.join(self.dir, "vault")
        os.makedirs(self.vault)
        env = {**os.environ, "HOME": self.dir, "ATLAS_SSH_BIN": fake, "ATLAS_SSH_TAB_WAIT": str(tab_wait), "ATLAS_PLUGIN_CACHE": os.path.join(self.dir, "cache"), "ATLAS_ROOT": self.vault}
        self.proc = subprocess.Popen([str(HELPER)], cwd=self.vault, env=env, stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
        self.ids = 100
        self.lines = queue.Queue()
        threading.Thread(target=lambda: [self.lines.put(json.loads(l)) for l in self.proc.stdout], daemon=True).start()

    def call(self, method, **params):
        """One call and its answer (events in between are skipped)."""
        self.ids += 1
        self.send(self.ids, method, {"host": "iq", "settings": {}, **params})
        return self.next(lambda l, i=self.ids: l.get("id") == i)

    def send(self, id, method, params):
        self.proc.stdin.write(json.dumps({"id": id, "method": method, "params": params}) + "\n")
        self.proc.stdin.flush()

    def next(self, want):
        """The next line `want` accepts (the host watcher's `connections` events come and go)."""
        while True:
            line = self.lines.get(timeout=20)
            if want(line):
                return line

    def close(self):
        self.proc.kill()
        self.proc.wait()
        self.proc.stdin.close()
        self.proc.stdout.close()


# For sessions: connected already; a session's `ssh -T … iq` is a local shell reading its stdin.
FAKE_SHELL_SSH = """#!/bin/sh
for a in "$@"; do case "$a" in -O|-G) exit 0 ;; esac; done
exec sh
"""


class SessionTest(unittest.TestCase):
    """atlas mcp's ssh_open / ssh_run / ssh_read: one shell kept between calls."""

    def setUp(self):
        self.h = Helper(tab_wait=2, fake_ssh=FAKE_SHELL_SSH)
        self.addCleanup(self.h.close)

    def ok(self, method, **params):
        answer = self.h.call(method, **params)
        self.assertIn("result", answer, answer)
        return answer["result"]

    def test_a_shell_keeps_its_folder_and_variables_and_a_long_command_is_read_later(self):
        self.assertEqual(self.ok("open"), {"session": "iq", "host": "iq"})
        self.assertEqual(self.ok("open")["reused"], True)
        self.assertEqual(self.ok("run", session="iq", command=f"cd {self.h.dir} && X=42"), {"output": "", "exit": 0})
        r = self.ok("run", session="iq", command='pwd; echo "x=$X"; ls nowhere')
        self.assertTrue(r["output"].startswith(f"{self.h.dir}\nx=42\n"), r)
        self.assertIn("nowhere", r["output"], "the shell's errors come in the same output")
        self.assertNotEqual(r["exit"], 0)
        slow = self.ok("run", session="iq", command="echo first; sleep 2; echo second", timeout=0.5)
        self.assertEqual((slow["output"], slow["running"]), ("first\n", True))
        self.assertIn("still running", self.h.call("run", session="iq", command="true")["error"])
        self.assertEqual(self.ok("read", session="iq", wait=5), {"output": "second\n", "exit": 0})
        listed = self.ok("sessions")
        self.assertEqual([(s["session"], s["alive"], s["running"]) for s in listed], [("iq", True, False)])
        self.assertIn("echo first", Path(self.h.dir, "cache/sessions/iq.log").read_text(), "everything is logged")
        # the shell went away: the next call opens a new one, and says so
        self.ok("send", session="iq", text="exit")
        for _ in range(50):  # the shell takes a moment to end
            if not self.ok("sessions")[0]["alive"]:
                break
            time.sleep(0.1)
        again = self.ok("run", session="iq", command="echo back")
        self.assertEqual((again["output"], again["exit"]), ("back\n", 0))
        self.assertIn("new shell", again["reconnected"])
        self.assertEqual(self.ok("close", session="iq"), {"closed": "iq"})
        self.assertIn("no session", self.h.call("run", session="iq", command="true")["error"])


class TerminalTest(unittest.TestCase):
    def setUp(self):
        self.h = Helper(tab_wait=2)
        self.addCleanup(self.h.close)

    def test_the_page_opens_the_tab_and_only_then_the_agent_hears_it_is_open(self):
        self.h.send(1, "terminal", {"host": "iq", "settings": {}})
        ev = self.h.next(lambda l: l.get("event") == "tab")["data"]
        self.assertEqual((ev["host"], ev["title"]), ("iq", "iq"))
        self.assertIn("ControlMaster=auto", ev["command"], "the tab shares the one connection per host")
        self.assertTrue(ev["command"].endswith(" iq"), ev["command"])
        self.h.send(2, "tab_opened", {"id": ev["id"], "ok": True})
        answer = self.h.next(lambda l: l.get("id") == 1)
        self.assertEqual(answer["result"]["opened"], "iq")
        self.assertFalse(answer["result"]["connected"], "not connected: the user logs in in that tab")

    def test_a_command_runs_in_the_tab_under_its_own_title(self):
        self.h.send(1, "terminal", {"host": "iq", "command": "htop", "settings": {}})
        ev = self.h.next(lambda l: l.get("event") == "tab")["data"]
        self.assertEqual(ev["title"], "iq: htop")
        self.assertIn(" -t ", ev["command"])
        self.assertTrue(ev["command"].endswith(" iq htop"), ev["command"])
        self.h.send(2, "tab_opened", {"id": ev["id"], "ok": True})
        self.assertIn("result", self.h.next(lambda l: l.get("id") == 1))

    def test_no_window_or_a_failed_tab_is_an_error_not_a_claimed_tab(self):
        self.h.send(1, "terminal", {"host": "iq", "settings": {}})
        self.h.next(lambda l: l.get("event") == "tab")  # asked, and nobody answers
        self.assertIn("no Atlas window opened the tab", self.h.next(lambda l: l.get("id") == 1)["error"])
        self.h.send(2, "terminal", {"host": "iq", "settings": {}})
        ev = self.h.next(lambda l: l.get("event") == "tab")["data"]
        self.h.send(3, "tab_opened", {"id": ev["id"], "ok": False})
        self.assertIn("could not open a terminal", self.h.next(lambda l: l.get("id") == 2)["error"])
        self.h.send(4, "terminal", {"settings": {}})
        self.assertIn("host", self.h.next(lambda l: l.get("id") == 4)["error"])


@unittest.skipUnless(SFTP_SERVER and shutil.which("sftp"), "needs sftp and sftp-server (openssh)")
class FilesTest(unittest.TestCase):
    """The explorer's calls (main.js `atlas.files.source`): a real sftp client and server, over a pipe, on a local folder."""

    def setUp(self):
        self.h = Helper(tab_wait=2, fake_ssh=FAKE_SFTP_SSH)
        self.addCleanup(self.h.close)
        self.remote = Path(self.h.dir, "remote")
        (self.remote / "data run").mkdir(parents=True)
        (self.remote / "data run/out [1].txt").write_text("E = -1.25\n")
        (self.remote / "notes.md").write_text("# remote\n")
        (self.remote / "blob.bin").write_bytes(b"\0\1\2")
        (self.remote / "to-notes").symlink_to("notes.md")

    def ok(self, method, **params):
        answer = self.h.call(method, **params)
        self.assertIn("result", answer, answer)
        return answer["result"]

    def test_a_host_that_asks_for_2fa_opens_the_login_tab_and_the_pane_calls_again(self):
        self.h.send(1, "files_list", {"host": "iq", "settings": {}})
        login = self.h.next(lambda l: l.get("event") == "login")["data"]  # the page opens the login tab on this
        self.assertEqual(self.h.next(lambda l: l.get("id") == 1)["result"]["waiting_for_login"], "iq")
        self.assertEqual(login["host"], "iq")
        self.assertIn("explorer", Path(login["command"].split(" ", 1)[1].strip("'")).read_text(), "the tab says who asked")
        Path(self.h.dir, "up").touch()  # the user answered in that tab: the shared connection is up
        listing = self.ok("files_list")
        self.assertEqual(listing["path"], str(self.remote))
        self.assertEqual(sorted((e["name"], e["type"]) for e in listing["entries"]), [("blob.bin", "file"), ("data run", "dir"), ("notes.md", "file"), ("to-notes", "link")])
        mtime = next(e["mtime"] for e in listing["entries"] if e["name"] == "notes.md")
        self.assertLess(abs(mtime - (self.remote / "notes.md").stat().st_mtime), 120, "sftp's date, in seconds (to the minute)")

    def test_connect_only_logs_in_the_tab_closes_and_no_shell_is_left_open(self):
        self.h.send(1, "connect", {"host": "iq", "settings": {}})
        login = self.h.next(lambda l: l.get("event") == "login")["data"]
        self.assertEqual(self.h.next(lambda l: l.get("id") == 1)["result"]["waiting_for_login"], "iq")
        script = Path(login["command"].split(" ", 1)[1].strip("'")).read_text()
        self.assertIn("you (Connect)", script)
        self.assertIn(" true; do", script, "the tab runs `ssh … true` and ends: no login shell stays open")
        Path(self.h.dir, "up").touch()  # the user answered: connected
        self.assertEqual(self.ok("connect"), {"connected": "iq"})
        self.assertEqual(self.ok("sessions"), [], "no shell was opened for it")

    def test_browse_open_download_upload_and_change_files(self):
        Path(self.h.dir, "up").touch()
        root = str(self.remote)
        sub = self.ok("files_list", path=f"{root}/data run")
        self.assertEqual([(e["name"], e["size"]) for e in sub["entries"]], [("out [1].txt", 10)], "spaces and glob characters in names")
        self.assertEqual(self.ok("files_list", path=f"{root}/to-notes"), {"not_dir": True, "path": f"{root}/to-notes"}, "a link to a file: opened as a file")
        # opened from a local copy, binary or not; a save goes back, unless the file there changed meanwhile
        copy = self.ok("files_edit", host="iq", path=f"{root}/data run/out [1].txt")["local"]
        self.assertEqual(copy, f".atlas/remote/ssh/iq{root}/data run/out [1].txt")
        self.assertEqual(Path(self.h.vault, copy).read_text(), "E = -1.25\n")
        blob = self.ok("files_edit", host="iq", path=f"{root}/blob.bin")["local"]
        self.assertEqual(Path(self.h.vault, blob).read_bytes(), b"\0\1\2")
        Path(self.h.vault, copy).write_text("E = -1.5\n")
        self.assertEqual(self.ok("files_save", host="iq", local=copy)["saved"], f"iq:{root}/data run/out [1].txt")
        self.assertEqual((self.remote / "data run/out [1].txt").read_text(), "E = -1.5\n")
        (self.remote / "data run/out [1].txt").write_text("E = -1.75, from someone else\n")
        self.assertIn("changed on iq", self.ok("files_save", host="iq", local=copy)["message"])
        self.ok("files_save", host="iq", local=copy, force=True)
        self.assertEqual((self.remote / "data run/out [1].txt").read_text(), "E = -1.5\n")
        # download into a vault folder, twice: the second gets a number, nothing is overwritten
        self.assertEqual(self.ok("files_get", path=f"{root}/notes.md", folder="notes/remote")["saved"], "notes/remote/notes.md")
        self.assertEqual(self.ok("files_get", path=f"{root}/notes.md", folder="notes/remote")["saved"], "notes/remote/notes 2.md")
        self.assertEqual(self.ok("files_get", path=f"{root}/data run", folder="runs", dir=True)["saved"], "runs/data run")
        self.assertEqual(Path(self.h.vault, "runs/data run/out [1].txt").read_text(), "E = -1.5\n")
        self.assertIn("not a folder of this vault", self.h.call("files_get", path=f"{root}/notes.md", folder="../outside")["error"])
        # upload: a name already there is replaced only when asked
        Path(self.h.vault, "plan.md").write_text("the plan\n")
        self.assertEqual(self.ok("files_put", local="plan.md", folder=root), {"uploaded": f"{root}/plan.md"})
        Path(self.h.vault, "plan.md").write_text("the plan, v2\n")
        self.assertEqual(self.ok("files_put", local="plan.md", folder=root), {"exists": f"{root}/plan.md"})
        self.assertEqual((self.remote / "plan.md").read_text(), "the plan\n")
        self.ok("files_put", local="plan.md", folder=root, replace=True)
        self.assertEqual((self.remote / "plan.md").read_text(), "the plan, v2\n")
        # create, rename (never over another file), delete (a folder only when empty)
        self.ok("files_mkdir", path=f"{root}/new folder")
        self.assertIn("already exists", self.h.call("files_rename", **{"from": f"{root}/plan.md", "to": f"{root}/notes.md"})["error"])
        self.ok("files_rename", **{"from": f"{root}/plan.md", "to": f"{root}/new folder/plan*.md"})
        self.assertTrue((self.remote / "new folder/plan*.md").exists())
        self.assertIn("only an empty folder", self.h.call("files_delete", path=f"{root}/new folder", dir=True)["error"])
        self.ok("files_delete", path=f"{root}/new folder/plan*.md")
        self.ok("files_delete", path=f"{root}/new folder", dir=True)
        self.assertFalse((self.remote / "new folder").exists())


if __name__ == "__main__":
    unittest.main()
