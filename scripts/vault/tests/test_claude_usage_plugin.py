"""The Claude usage plugin's helper (plugins/beta/claude/usage.py): accounts found by shape, limits read
from `limits[]` or the older blocks, an unreadable account said, answers cached. No network: `ask` is replaced."""
import importlib.util, io, json, os, shutil, subprocess, sys, tempfile, unittest
from pathlib import Path
from unittest import mock

USAGE = Path(__file__).parents[3] / "plugins/beta/claude/usage.py"
MAIN = USAGE.with_name("main.js")


def load():
    spec = importlib.util.spec_from_file_location("usage", USAGE)
    m = importlib.util.module_from_spec(spec)
    with mock.patch.object(sys, "stdin", io.StringIO("")):
        spec.loader.exec_module(m)
    return m


class UsageTest(unittest.TestCase):
    def setUp(self):
        self.home = Path(tempfile.mkdtemp())
        for d in (".claude", ".claude-switch/accounts/personal", ".claude-switch/accounts/work"):
            (self.home / d).mkdir(parents=True)
            (self.home / d / ".credentials.json").write_text(json.dumps({"claudeAiOauth": {"accessToken": f"tok-{d}"}}))
        self.env = mock.patch.dict(os.environ, {"HOME": str(self.home)}, clear=False)
        self.env.start()
        os.environ.pop("CLAUDE_CONFIG_DIR", None)
        self.m = load()

    def tearDown(self):
        self.env.stop()

    def test_every_account_is_found_by_its_credentials(self):
        self.assertEqual([n for n, _ in self.m.accounts()], ["default", "personal", "work"])

    def test_limits_from_the_list_or_the_old_blocks_and_an_error_per_account(self):
        answers = {
            "default": {"limits": [{"kind": "session", "percent": 88, "resets_at": "2026-10-15T10:19:59+00:00"}, {"kind": "weekly_all", "percent": 41}], "extra_usage": {"is_enabled": False}},
            "personal": {"five_hour": {"utilization": 12.0, "resets_at": None}, "seven_day": {"utilization": 30.0}},
        }
        def ask(path):
            name = "default" if "/.claude/" in path else Path(path).parent.name
            if name not in answers:
                raise RuntimeError("not signed in (no access token)")
            return answers[name]
        with mock.patch.object(self.m, "ask", side_effect=ask) as asked:
            got = {a["name"]: a for a in self.m.usage({"all": True})["accounts"]}
            self.m.usage({"all": True})
        self.assertEqual([(l["label"], l["percent"], l["weekly"]) for l in got["default"]["limits"]], [("session (5 h)", 88.0, False), ("week", 41.0, True)])
        self.assertEqual([(l["label"], l["percent"]) for l in got["personal"]["limits"]], [("session (5 h)", 12.0), ("week", 30.0)])
        self.assertIn("not signed in", got["work"]["error"])
        self.assertEqual(asked.call_count, 3, "the second look within 90 s is answered from the cache")

    def test_an_account_is_named_by_its_email_when_claude_code_has_it(self):
        # the default keeps it in ~/.claude.json beside ~/.claude; a switch account in its own folder
        (self.home / ".claude.json").write_text(json.dumps({"oauthAccount": {"emailAddress": "me@example.org"}}))
        (self.home / ".claude-switch/accounts/personal/.claude.json").write_text(json.dumps({"oauthAccount": {"emailAddress": "me@uni.example.org"}}))
        with mock.patch.object(self.m, "ask", return_value={"limits": []}):
            got = [(a["name"], a["folder"]) for a in self.m.usage({"all": True})["accounts"]]
        self.assertEqual(got, [("me@example.org", "default"), ("me@uni.example.org", "personal"), ("work", "work")])

    def test_the_account_atlas_runs_claude_as_is_the_current_one(self):
        # "claude usage is detecting the wrong account": the vault's [terminal] claude_account, not the busiest
        vault = self.home / "vault"
        (vault / ".atlas").mkdir(parents=True)
        (vault / ".atlas/config.toml").write_text('[terminal]\nclaude_account = "~/.claude-switch/accounts/work"\n')
        with mock.patch.dict(os.environ, {"ATLAS_ROOT": str(vault)}), mock.patch.object(self.m, "ask", return_value={"limits": []}):
            got = {a["folder"]: a["current"] for a in self.m.usage({"all": True})["accounts"]}
            only = [a["folder"] for a in self.m.usage({})["accounts"]]
        self.assertEqual(got, {"default": False, "personal": False, "work": True})
        self.assertEqual(only, ["work"], "the user: \"it should just give it to you for the current one\"")
        with mock.patch.dict(os.environ, {"ATLAS_ROOT": str(self.home / "none")}):
            self.assertEqual(self.m.in_use(), os.path.realpath(self.home / ".claude"), "no setting: ~/.claude")

    def test_the_hooks_copy_is_used_and_a_refusal_shows_the_last_numbers_known(self):
        # the endpoint answers 429 to a second poller: the session hooks' cached answer is read instead of asking
        path = str(self.home / ".claude/.credentials.json")
        hook = Path("/tmp/claude_usage_5h_" + "".join(ch if ch.isalnum() else "_" for ch in path)[-60:] + ".json")
        hook.write_text(json.dumps({"raw": {"limits": [{"kind": "session", "percent": 33}]}}))
        self.addCleanup(hook.unlink)
        def ask(p):
            if p == path:
                raise AssertionError("asked although the hooks had it")
            raise RuntimeError("HTTP Error 429: Too Many Requests")
        with mock.patch.object(self.m, "ask", side_effect=ask):
            got = {a["folder"]: a for a in self.m.usage({"all": True})["accounts"]}
        self.assertEqual([l["percent"] for l in got["default"]["limits"]], [33.0])
        self.assertIn("429", got["work"]["error"], "never read: the reason")
        # once read, a later refusal keeps the numbers, dated
        self.m.cache.clear()
        os.utime(hook, (0, 0))  # the hooks' copy is old now
        with mock.patch.object(self.m, "ask", side_effect=RuntimeError("HTTP Error 429: Too Many Requests")):
            got = {a["folder"]: a for a in self.m.usage({})["accounts"]}
        self.assertEqual(([l["percent"] for l in got["default"]["limits"]], got["default"]["stale"]), ([33.0], 0))

    def test_without_claude_switch_only_the_current_account_is_asked(self):
        # "it should not expect them": no ~/.claude-switch at all, and a configured folder that has no sign-in
        shutil.rmtree(self.home / ".claude-switch")
        with mock.patch.object(self.m, "ask", return_value={"limits": [{"kind": "session", "percent": 5}]}) as asked:
            got = self.m.usage({})["accounts"]
        self.assertEqual(([a["folder"] for a in got], asked.call_count), (["default"], 1))
        vault = self.home / "vault"
        (vault / ".atlas").mkdir(parents=True)
        (vault / ".atlas/config.toml").write_text('[terminal]\nclaude_account = "~/elsewhere"\n')
        with mock.patch.dict(os.environ, {"ATLAS_ROOT": str(vault)}), mock.patch.object(self.m, "ask", side_effect=AssertionError("asked")):
            got = self.m.usage({})["accounts"]
        self.assertEqual(len(got), 1)
        self.assertIn("not signed in", got[0]["error"])


@unittest.skipUnless(shutil.which("node"), "needs node to run main.js")
class NoticeTest(unittest.TestCase):
    """main.js's notice past "Warn from": once per 5-hour window (it used to
    show up too often). The endpoint's resets_at moves by a fraction of a second on every look, and the key used to hold it."""

    def test_once_per_window_across_jitter_restarts_and_stale_numbers(self):
        harness = Path(tempfile.mkdtemp()) / "sim.mjs"
        harness.write_text('''
const store = {};
globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } };
const { register } = await import(process.argv[2]);
const counts = [], toasts = [];
let answer, cmd;
const atlas = { shell: { statusItem: () => ({ set: () => {} }) }, plugin: { settings: { warn: 80, every: 0 } },
  toast: (t) => t.startsWith("Claude:") && toasts.push(t), registerCommand: (c) => { cmd = c; }, helper: { call: async () => answer } };
const acct = (pct, reset, extra = {}) => ({ accounts: [{ name: "me", folder: "personal", current: true, ...extra,
  limits: [{ kind: "session", label: "session (5 h)", percent: pct, resets_at: reset, weekly: false }] }] });
const look = async () => { cmd.run(); await new Promise((r) => setTimeout(r, 5)); };
const end = new Date(Date.now() + 3 * 3600e3).toISOString().replace("Z", "");
let stop = register(atlas);
for (let i = 0; i < 10; i++) { answer = acct(85 + i, `${end}${String(i).padStart(3, "0")}+00:00`); await look(); }
counts.push(toasts.length);                                   // ten looks, the reset time jittering
stop(); stop = register(atlas); await look(); counts.push(toasts.length);   // Atlas restarted, same window
answer = acct(2, null); await look(); answer = acct(90, new Date(Date.now() + 5 * 3600e3).toISOString()); await look();
counts.push(toasts.length);                                   // a new window
answer = acct(97, new Date(Date.now() - 60e3).toISOString(), { stale: 400 }); store["atlas.claude.warned"] = "{}";
stop(); stop = register(atlas); await look(); counts.push(toasts.length);   // numbers hours old
answer = { accounts: [{ ...acct(99, null).accounts[0], current: false }] }; await look(); counts.push(toasts.length); // another account
stop();
console.log(JSON.stringify(counts));
''')
        out = subprocess.run(["node", str(harness), MAIN.as_uri()], capture_output=True, text=True, timeout=30)
        self.assertEqual(out.returncode, 0, out.stderr)
        self.assertEqual(json.loads(out.stdout), [1, 1, 2, 2, 2])


if __name__ == "__main__":
    unittest.main()
