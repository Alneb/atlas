# SPDX-License-Identifier: MIT OR Apache-2.0  (the plugin SDK: crates/atlas-plugin/LICENSE-MIT and LICENSE-APACHE; Atlas itself is AGPL-3.0-or-later)
"""Atlas, from a plugin's own Python helper (docs/guides/PLUGIN-API.md, "Calling Atlas back").

A helper talks to the core over its own pipe: the core's requests arrive on stdin, the answers go to stdout — and the
helper's calls back go the same way (`{"call": n, "verb", "path", "body"}` out, `{"reply": n, "status", "body"}` in).
The core runs each call through the vault's own API in-process, so every file, note and search operation happens in
the core, on the machine serving the vault: no socket, no port, no key. Only the standard library is used.

    import atlas_plugin as atlas

    @atlas.method
    def tidy(params):                       # a method the core (a tool, a page) calls
        text = atlas.read("notes/Inbox.md")
        atlas.write("notes/Inbox.md", text.strip() + "\n")
        return {"lines": text.count("\n")}

    atlas.serve()                           # the helper's loop, until Atlas closes stdin

The core writes this file to <vault>/.atlas/cache/sdk/python/ and puts that folder first on the helper's PYTHONPATH.
Calls work in a helper (`[helper] run`), not in a data script (its stdout is its result).
"""
import json
import re
import os
import sys
import threading
import time
import urllib.parse
from collections import deque

__all__ = [
    "AtlasError", "call", "get", "post", "put", "read", "write", "files", "tree", "search", "today",
    "capture", "secret", "set_secret", "fetch", "fetch_json", "event", "method", "serve",
]


class AtlasError(Exception):
    """The core said no (its own reason, with the HTTP-style status of the API)."""

    def __init__(self, why, status=None):
        super().__init__(why)
        self.status = status


_next = 0
_pending = deque()  # the core's requests that arrived while a call waited for its reply, before serve() started
_table = None  # the methods, once serve() runs: a request arriving during a call is then answered at once
_replies = {}  # replies to an outer call that arrived while a nested one waited: kept for that call, never a request


def _send(obj):
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.stdout.flush()


def _line():
    line = sys.stdin.readline()
    if not line:
        raise AtlasError("Atlas closed the pipe")
    return line


def call(verb, path, body=None, query=None):
    """One call to the core's API: `path` as the pages use it ("/api/file"); the JSON answer, or AtlasError."""
    global _next
    if query:
        path += "?" + urllib.parse.urlencode({k: v for k, v in query.items() if v is not None})
    _next += 1
    n = _next
    _send({"call": n, "verb": verb, "path": path, "body": body})
    while True:
        msg = _replies.pop(n, None)
        if msg is None:
            raw = _line()
            try:
                msg = json.loads(raw)
            except ValueError:
                continue
        if isinstance(msg, dict) and "reply" in msg and msg["reply"] != n:
            _replies[msg["reply"]] = msg  # an outer call's: it reads it once this nested one returns
            continue
        if isinstance(msg, dict) and msg.get("reply") == n:
            status, answer = msg.get("status", 500), msg.get("body")
            if not 200 <= status < 300:
                why = answer.get("error") if isinstance(answer, dict) else answer
                raise AtlasError(f"{verb} {path}: {why}", status)
            return answer
        # a request for this helper while it waits: answered now, nested — it may be what this call waits on (a sync
        # asking the catalog, which asks this helper's lookup); before serve() it waits its turn
        if _table is not None:
            _answer(raw)
        else:
            _pending.append(raw)


def get(api_path, /, **query):
    """GET `api_path` with `query` as its parameters (`get("/api/file", path="a.md")`: a parameter may be named path)."""
    return call("GET", api_path, query=query)


def post(path, body=None):
    return call("POST", path, body if body is not None else {})


def put(path, body):
    return call("PUT", path, body)


# ---- files and notes ------------------------------------------------------------------------------------------------

def read(path):
    """A text file of the vault (a path relative to its top), as text."""
    return get("/api/file", path=path)["text"]


def write(path, text):
    """Writes a text file of the vault (made with its folders when new); the open tabs follow."""
    return put("/api/file", {"path": path, "text": text})


def files(index=False):
    """Every file's path; `index=True`: only what search indexes (no ignored folders)."""
    return get("/api/files", index="true" if index else None)


def tree(folder=""):
    """One folder's entries: [{name, path, kind: "dir" | "file", …}]."""
    return get("/api/tree", path=folder)


def search(q, case=False, word=False, regex=False):
    """Full-text search: {"files": […], "lines": [{path, line, text}, …]}."""
    return get("/api/search", q=q, case="true" if case else None, word="true" if word else None, regex="true" if regex else None)


def today():
    """Today: the open tasks due, the log."""
    return get("/api/today")


def capture(text):
    """A capture, as the capture box makes it (`[] …` a to-do, `@tomorrow` a date)."""
    return post("/api/capture", {"text": text})


# ---- this plugin's secrets (kept outside the vault; a program reads only its own plugin's) --------------------------

def _plugin():
    pid = os.environ.get("ATLAS_PLUGIN_ID")
    if not pid:
        raise AtlasError("ATLAS_PLUGIN_ID is not set: this program was not started by Atlas")
    return pid


def secret(name):
    """This plugin's secret `name`, or None when it is not set."""
    return get(f"/api/plugins/{_plugin()}/secrets/{urllib.parse.quote(name)}").get("value")


def set_secret(name, value):
    put(f"/api/plugins/{_plugin()}/secrets/{urllib.parse.quote(name)}", {"value": value})


# ---- the web, through the core (the plugin's `net` hosts only) -----------------------------------------------------

_last = {}  # host → when it was last asked (pacing)
_pace = threading.Lock()
BUSY = (429, 502, 503, 504)


def fetch(url, *, method="GET", headers=None, body=None, timeout=20, every=0.0, missing=(404,), waits=(2, 6)):
    """A page's text through the core's fetch: None for a `missing` status (404: not there), an AtlasError for any
    other failure. Polite and patient: at most one request to a host every `every` seconds (MusicBrainz asks 1,
    arXiv 3), and a busy answer (429, 50x) or a dropped connection is tried again after each of `waits` seconds
    (a busy answer's own Retry-After instead, up to 30 s)."""
    host = urllib.parse.urlsplit(url).hostname or ""
    req = {"url": url, "method": method, "headers": headers or {}, "timeout_secs": timeout}
    if body is not None:
        req["body"] = body
    pause = 0
    for attempt in range(len(waits) + 1):
        time.sleep(pause)
        if every:
            with _pace:
                time.sleep(max(0.0, every - (time.monotonic() - _last.get(host, 0.0))))
                _last[host] = time.monotonic()
        try:
            res = post(f"/api/plugins/{_plugin()}/fetch", req)
        except AtlasError as e:
            if "error sending request" in str(e) and attempt < len(waits):
                pause = waits[attempt]
                continue  # the site dropped the connection: once more after a pause
            raise
        status = res.get("status")
        if status in BUSY and attempt < len(waits):
            # the site's own Retry-After (seconds), within reason; else the next of `waits`
            asked = str((res.get("headers") or {}).get("retry-after") or "")
            pause = min(float(asked), 30.0) if asked.replace(".", "", 1).isdigit() else waits[attempt]
            continue
        if status in missing:
            return None
        if not res.get("ok"):
            raise AtlasError(f"{host} answered {status}", status)
        return res.get("text") or ""
    return None  # not reached: the last attempt returns or raises


def fetch_json(url, *, headers=None, **kw):
    """`fetch` of a JSON answer, parsed (None for a missing one)."""
    text = fetch(url, headers={"Accept": "application/json", **(headers or {})}, **kw)
    return None if text is None else json.loads(text or "null")


def attach_pdf(key, url, source, *, headers=None, timeout=120):
    """For a papers PDF source (`[contributes.catalog-papers] pdf_sources`): downloads `url` into this plugin's cache at
    `pdf/<key>.pdf`, where the catalog-papers helper takes it when the source answers `{"attached": True}` (or
    `{"file": <the path>}`). True when the address gave a PDF; False otherwise, so the source can try its next one. It
    attaches nothing itself: the helper that asked is waiting for this source's answer."""
    name = "pdf/" + re.sub(r"[^\w.-]", "_", str(key)) + ".pdf"
    res = post(f"/api/plugins/{_plugin()}/fetch", {"url": url, "headers": headers or {}, "timeout_secs": timeout, "save_to": name})
    if not res.get("ok") or not res.get("saved"):
        return False
    try:
        with open(os.path.join(os.environ.get("ATLAS_ROOT", "."), res["saved"]), "rb") as f:
            return f.read(4) == b"%PDF"
    except OSError:
        return False


# ---- the helper's side of the protocol ------------------------------------------------------------------------------

_methods = {}


def method(fn=None, name=None):
    """Registers a helper method (`@atlas.method`, or `@atlas.method(name="x")`): fn(params) → a JSON-able result."""
    def add(f):
        _methods[name or f.__name__] = f
        return f
    return add(fn) if fn is not None else add


def event(name, data=None):
    """An event for the page's `atlas.helper.on(name, …)`."""
    _send({"event": name, "data": data})


def serve(methods=None):
    """The helper's loop: one request per line on stdin, its answer on stdout. `methods`: a dict, or an object whose
    public functions are the methods; by default the ones registered with @method. Returns when stdin closes."""
    table = dict(_methods)
    if isinstance(methods, dict):
        table.update(methods)
    elif methods is not None:
        table.update({k: getattr(methods, k) for k in dir(methods) if not k.startswith("_") and callable(getattr(methods, k))})
    global _table
    _table = table
    while True:
        line = _pending.popleft() if _pending else sys.stdin.readline()
        if not line:
            return  # Atlas closed stdin
        _answer(line)


def _answer(line):
    """Runs one request line from the core against the methods and sends its answer."""
    line = line.strip()
    if not line:
        return
    try:
        req = json.loads(line)
    except ValueError:
        print(f"atlas_plugin: not JSON: {line[:200]}", file=sys.stderr)
        return
    rid, name = req.get("id"), req.get("method")
    fn = (_table or {}).get(name)
    if fn is None:
        _send({"id": rid, "error": f"no method {name!r} (has: {', '.join(sorted(_table or {})) or 'none'})"})
        return
    try:
        _send({"id": rid, "result": fn(req.get("params") or {})})
    except AtlasError as e:
        _send({"id": rid, "error": str(e)})
    except Exception as e:  # the helper stays up; the caller gets the reason
        _send({"id": rid, "error": f"{type(e).__name__}: {e}"})
