#!/usr/bin/env python3
"""Claude usage for the status bar: the Claude Code account Atlas's Claude runs as (its `.credentials.json`; every
account on this computer on request) and what Anthropic's usage endpoint says of it — the same request as `claude-acc usage` and the session hooks
(~/.claude/hooks/usagelib.py). The access token is read from the file at each look and never kept or sent
anywhere else. Answers are cached for 90 s per account (the bar asks every couple of minutes, an agent may ask
too). One JSON object per line (docs/guides/PLUGIN-API.md, "helper")."""
import glob
import json
import os
import sys
import time
import tomllib
import urllib.request

URL = "https://api.anthropic.com/api/oauth/usage"
TTL = 90
cache = {}  # credentials path → (time, answer)
good = {}   # credentials path → (time, the last answer that was read): shown, dated, when a look fails


def accounts():
    """(name, credentials path) of every account: $CLAUDE_CONFIG_DIR, ~/.claude (default) and, when claude-switch is
    installed, its accounts (~/.claude-switch/accounts/<name>/) — shape-based, so a new account appears by itself."""
    found, seen = [], set()
    def add(name, path):
        real = os.path.realpath(path)
        if os.path.isfile(path) and real not in seen:
            seen.add(real)
            found.append((name, path))
    if os.environ.get("CLAUDE_CONFIG_DIR"):
        add(os.path.basename(os.environ["CLAUDE_CONFIG_DIR"].rstrip("/")) or "claude", os.path.join(os.environ["CLAUDE_CONFIG_DIR"], ".credentials.json"))
    add("default", os.path.expanduser("~/.claude/.credentials.json"))
    for path in sorted(glob.glob(os.path.expanduser("~/.claude-switch/**/.credentials.json"), recursive=True)):
        add(os.path.basename(os.path.dirname(path)), path)
    return found


def email_of(path):
    """The account's address, as Claude Code keeps it beside the credentials: `<dir>/.claude.json`, or for the
    default `~/.claude` the `~/.claude.json` next to it. None when neither says."""
    folder = os.path.dirname(path)
    for f in (os.path.join(folder, ".claude.json"), folder.rstrip("/") + ".json"):
        try:
            with open(f, encoding="utf-8") as h:
                mail = (json.load(h).get("oauthAccount") or {}).get("emailAddress")
            if mail:
                return mail
        except (OSError, ValueError):
            continue
    return None


def in_use():
    """The config folder of the account Atlas's Claude sessions run as: this plugin's Account setting (its settings
    file), else the vault's older `[terminal] claude_account`, else $CLAUDE_CONFIG_DIR, else ~/.claude — the account
    the cell is about (it used to show whichever account had used the most)."""
    def read(*parts):
        try:
            with open(os.path.join(os.environ.get("ATLAS_ROOT", "."), ".atlas", *parts), "rb") as f:
                return tomllib.load(f)
        except (OSError, tomllib.TOMLDecodeError):
            return {}
    chosen = str(read("plugin-settings", f"{os.environ.get('ATLAS_PLUGIN_ID', 'claude')}.toml").get("account") or "").strip()
    chosen = chosen or (read("config.toml").get("terminal") or {}).get("claude_account")
    folder = chosen or os.environ.get("CLAUDE_CONFIG_DIR") or "~/.claude"
    return os.path.realpath(os.path.expanduser(folder))


def limits(data):
    """The limits as a list [{kind, label, percent, resets_at, weekly}], read from `limits[]` (any kind the API
    adds), else from the older `five_hour` / `seven_day` blocks."""
    out = []
    for lim in data.get("limits") or []:
        if isinstance(lim, dict) and lim.get("percent") is not None:
            kind = str(lim.get("kind") or lim.get("group") or "limit")
            weekly = "week" in kind.lower() or "seven_day" in kind.lower()
            label = lim.get("label") or lim.get("title") or ("week" if weekly else "session (5 h)" if kind == "session" else kind.replace("_", " "))
            out.append({"kind": kind, "label": label, "percent": float(lim["percent"]), "resets_at": lim.get("resets_at"), "weekly": weekly})
    if not out:
        for key, label, weekly in (("five_hour", "session (5 h)", False), ("seven_day", "week", True), ("seven_day_opus", "week, Opus", True)):
            blk = data.get(key) or {}
            if blk.get("utilization") is not None:
                out.append({"kind": key, "label": label, "percent": float(blk["utilization"]), "resets_at": blk.get("resets_at"), "weekly": weekly})
    return out


def shared(path, fresh):
    """The session hooks' copy of this account's answer (~/.claude/hooks/usagelib.py caches it per account in /tmp)
    when younger than `fresh` s → (data, its time) or None: the same numbers are not asked for twice (the endpoint
    answers 429 Too Many Requests to a second poller)."""
    f = "/tmp/claude_usage_5h_" + "".join(ch if ch.isalnum() else "_" for ch in path)[-60:] + ".json"
    try:
        at = os.path.getmtime(f)
        if time.time() - at < fresh:
            with open(f, encoding="utf-8") as h:
                raw = json.load(h).get("raw")
            if isinstance(raw, dict):
                return raw, at
    except (OSError, ValueError, AttributeError):
        pass
    return None


def ask(path):
    with open(path, encoding="utf-8") as f:
        tok = (json.load(f).get("claudeAiOauth") or {}).get("accessToken")
    if not tok:
        raise RuntimeError("not signed in (no access token)")
    req = urllib.request.Request(URL, headers={"Authorization": f"Bearer {tok}", "anthropic-beta": "oauth-2025-04-20", "Accept": "application/json", "User-Agent": "atlas-claude-usage"})
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read().decode("utf-8", "replace"))


def shape(name, folder, data):
    extra = data.get("extra_usage") or {}
    return {"name": name, "folder": folder, "limits": limits(data), "credits": bool(extra.get("is_enabled")) and not extra.get("spend_limit_reached")}


def look(path, name, folder):
    """One account's answer: the hooks' fresh copy, else asked; on a failure (offline, 429) the last numbers known,
    with their age in minutes as `stale`, else the reason as `error`."""
    try:
        got = shared(path, TTL)
        data, at = got if got else (ask(path), time.time())
        good[path] = (at, shape(name, folder, data))
        return good[path][1]
    except Exception as e:  # noqa: BLE001
        late = shared(path, 6 * 3600)
        last = max(filter(None, [good.get(path), late and (late[1], shape(name, folder, late[0]))]), key=lambda x: x[0], default=None)
        if last:
            return {**last[1], "stale": int((time.time() - last[0]) / 60)}
        return {"name": name, "folder": folder, "limits": [], "credits": False, "error": f"{type(e).__name__}: {e}"}


def usage(p):
    """→ {"accounts": [{name, folder, current, limits, credits, error?}]}: only the account Atlas's Claude runs as
    (`in_use`), or with {"all": true} every account
    found. `name` is the account's email when Claude Code has it, else its folder; one that cannot be read says why."""
    current = in_use()
    found = accounts()
    if not p.get("all"):
        mine = os.path.join(current, ".credentials.json")
        # the other accounts are optional (claude-switch may not be installed): the current one is asked even if unlisted
        found = [a for a in found if os.path.realpath(os.path.dirname(a[1])) == current] or [
            ("default" if current == os.path.realpath(os.path.expanduser("~/.claude")) else os.path.basename(current), mine)]
    out = []
    for folder, path in found:
        name = email_of(path) or folder
        if not os.path.isfile(path):
            out.append({"name": name, "folder": folder, "limits": [], "credits": False, "current": True, "error": f"not signed in (no {path})"})
            continue
        at, answer = cache.get(path, (0, None))
        if answer is None or time.time() - at > TTL:
            answer = look(path, name, folder)
            cache[path] = (time.time() if not answer.get("error") and not answer.get("stale") else time.time() - TTL + 60, answer)  # a failure: again in a minute
        out.append({**answer, "current": os.path.realpath(os.path.dirname(path)) == current})
    return {"accounts": out}


def tilde(path):
    home = os.path.expanduser("~")
    return "~" + path[len(home):] if path == home or path.startswith(home + "/") else path


def commands(_p):
    """Suggestions for the Command setting: every `claude` on PATH (one per real file) with its version, a wrapper
    script said as such, and `claude-acc run <account>` per account when the switcher sits beside one."""
    import subprocess
    from concurrent.futures import ThreadPoolExecutor
    found, seen = [], set()
    for d in os.environ.get("PATH", "").split(os.pathsep):
        c = os.path.join(d, "claude")
        if os.path.isfile(c) and os.path.realpath(c) not in seen:
            seen.add(os.path.realpath(c))
            found.append(c)

    def script(c):
        try:
            with open(c, "rb") as f:
                return f.read(2) == b"#!"
        except OSError:
            return False

    def version(c):
        if script(c):
            return "wrapper script"
        try:
            out = subprocess.run([c, "--version"], capture_output=True, text=True, timeout=4).stdout
            return out.splitlines()[0].strip() if out.strip() else None
        except (OSError, subprocess.SubprocessError):
            return None

    with ThreadPoolExecutor() as pool:  # `--version` takes a few hundred ms each
        versions = list(pool.map(version, found))
    out = [{"value": "claude", "label": "claude — first on PATH"}]
    out += [{"value": tilde(c), "label": f"{tilde(c)} — {v}" if v else tilde(c)} for c, v in zip(found, versions)]
    acc = next((os.path.join(os.path.dirname(c), "claude-acc") for c in found if os.path.isfile(os.path.join(os.path.dirname(c), "claude-acc"))), None)
    if acc:
        try:
            listed = subprocess.run([acc, "list"], capture_output=True, text=True, timeout=3).stdout
        except (OSError, subprocess.SubprocessError):
            listed = ""
        # lines like "    personal": skip the header and the "~/.claude/ (standard)" entry
        for name in (l.strip() for l in listed.splitlines()[1:]):
            if name and "/" not in name and " " not in name:
                out.append({"value": f"claude-acc run {name}", "label": f"claude-acc run {name} — account {name}"})
    return out


def account_folders(_p):
    """Suggestions for the Account setting: the configuration folders holding credentials (the accounts the usage
    cell finds), each with its address; empty = Claude Code's own ~/.claude."""
    out = [{"value": "", "label": "Default (~/.claude)"}]
    for name, path in accounts():
        folder = os.path.dirname(path)
        if os.path.realpath(folder) == os.path.realpath(os.path.expanduser("~/.claude")):
            continue
        mail = email_of(path)
        out.append({"value": tilde(folder), "label": f"{name} — {mail}" if mail else name})
    return out


METHODS = {"usage": usage, "commands": commands, "account_folders": account_folders}


def serve():
    for line in sys.stdin:
        req = json.loads(line)
        try:
            answer = {"id": req["id"], "result": METHODS[req["method"]](req.get("params") or {})}
        except Exception as e:  # noqa: BLE001
            answer = {"id": req["id"], "error": f"{type(e).__name__}: {e}"}
        print(json.dumps(answer), flush=True)


if __name__ == "__main__":
    serve()
