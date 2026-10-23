#!/usr/bin/env python3
"""The helper of the "Word stats" example.

The whole protocol: one JSON object per line.
  Atlas writes   {"id": 3, "method": "count", "params": {"dir": "notes"}}
  we answer      {"id": 3, "result": …}          or   {"id": 3, "error": "why"}
  an event is a line without an id:  {"event": "progress", "data": …}
Anything printed to stderr lands in .atlas/cache/plugins/<plugin id>.log.

The process is started by the first call and stays alive, so what it has computed can be kept
(here: a cache of word counts by file and modification time). cwd is the vault.
"""
import json
import os
import sys

cache = {}  # path -> (mtime, words): the reason to be a long-lived process


def count(params):
    root = params.get("dir") or "."
    total, files = 0, 0
    for folder, dirs, names in os.walk(root):
        dirs[:] = [d for d in dirs if not d.startswith(".")]
        for name in names:
            if not name.endswith(".md"):
                continue
            path = os.path.join(folder, name)
            mtime = os.path.getmtime(path)
            if cache.get(path, (None, 0))[0] != mtime:
                with open(path, encoding="utf-8", errors="replace") as f:
                    cache[path] = (mtime, len(f.read().split()))
            total += cache[path][1]
            files += 1
            if files % 200 == 0:  # an event: the page can show progress while the call is still running
                print(json.dumps({"event": "progress", "data": {"files": files}}), flush=True)
    return {"words": total, "files": files, "cached": len(cache)}


METHODS = {"count": count}

for line in sys.stdin:
    msg = json.loads(line)
    try:
        answer = {"id": msg["id"], "result": METHODS[msg["method"]](msg.get("params") or {})}
    except Exception as e:  # an error is an answer too: the call fails in the page with this text
        answer = {"id": msg["id"], "error": f"{type(e).__name__}: {e}"}
    print(json.dumps(answer), flush=True)
