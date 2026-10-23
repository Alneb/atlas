"""Syncthing, scan now: the vault's changed paths → `POST /rest/db/scan?folder=<id>&sub=<path>` on this computer's
Syncthing. The folder holding the vault is found by its path, the API key in Syncthing's own config when none is set.
The logic takes its transport and file reader, so test_helper.py runs offline."""
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request

CONFIGS = ("~/.local/state/syncthing/config.xml", "~/.config/syncthing/config.xml")


def key_from_config(read):
    """The GUI's API key from Syncthing's config.xml (2.x keeps it in ~/.local/state, 1.x in ~/.config)."""
    for c in CONFIGS:
        text = read(os.path.expanduser(c))
        m = text and re.search(r"<apikey>([^<]+)</apikey>", text)
        if m:
            return m.group(1).strip()
    return None


def folder_of(folders, root):
    """(folder id, the vault's path inside it) of the Syncthing folder holding `root`: the deepest one."""
    root = os.path.realpath(root)
    best = None
    for f in folders:
        path = os.path.realpath(os.path.expanduser(f.get("path") or ""))
        if path and (root == path or root.startswith(path.rstrip("/") + "/")) and (best is None or len(path) > len(best[2])):
            best = (f["id"], os.path.relpath(root, path), path)
    return (best[0], "" if best[1] == "." else best[1]) if best else None


def scan_with(request, read, root, params):
    settings, secrets = params.get("settings") or {}, params.get("secrets") or {}
    url = str(settings.get("url") or "http://127.0.0.1:8384").rstrip("/")
    key = secrets.get("api_key") or key_from_config(read)
    # the vault syncs to machines without Syncthing (the server, a phone): nothing to ask there, and nothing to log for
    # every batch of changed files; a key that is set but wrong still fails (an HTTP error)
    if not key:
        return {"skipped": "no Syncthing on this machine (no API key set, none in its config)"}
    folder, inside = str(settings.get("folder") or "").strip(), ""
    if not folder:
        try:
            folders = request("GET", f"{url}/rest/config/folders", key)
        except urllib.error.URLError as e:
            if isinstance(e, urllib.error.HTTPError):
                raise
            return {"skipped": f"Syncthing is not running at {url} ({e.reason})"}
        found = folder_of(folders or [], root)
        if not found:
            return {"skipped": "no Syncthing folder holds this vault"}
        folder, inside = found
    paths = [p for p in params.get("paths") or [] if p and not p.startswith(".atlas/cache/")]
    for p in paths:
        sub = f"{inside}/{p}" if inside else p
        request("POST", f"{url}/rest/db/scan?" + urllib.parse.urlencode({"folder": folder, "sub": sub}), key)
    return {"folder": folder, "scanned": len(paths)}


def http(method, url, key):
    req = urllib.request.Request(url, method=method, headers={"X-API-Key": key})
    with urllib.request.urlopen(req, timeout=10) as r:
        body = r.read()
        return json.loads(body) if body.strip() else None


def read_file(path):
    try:
        with open(path, encoding="utf-8") as f:
            return f.read()
    except OSError:
        return None


if __name__ == "__main__":
    import atlas_plugin as atlas

    @atlas.method
    def scan(params):
        return scan_with(http, read_file, os.environ.get("ATLAS_ROOT", "."), params)

    atlas.serve()
