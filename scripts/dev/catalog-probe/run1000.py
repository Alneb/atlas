#!/usr/bin/env python3
"""Runs corpus1000.json through the catalog's preview on :7799; appends one JSON line per capture to results1000.jsonl
(resumable), then `python3 run1000.py report` sums it up by source and by what went wrong."""
import concurrent.futures as cf
import json
import os
import re
import sys
import urllib.request
from collections import Counter, defaultdict

OUT = "results1000.jsonl"
JUNK = re.compile(r"(?i)^(untitled|undefined|null|redirect(ing)?|just a moment|attention required|verifying|human verification|access denied|403|404|page not found|imdb\.com|title)$|"
                  r" [-|·—–] (wikipedia|spotify|youtube|imdb|letterboxd|bandcamp|goodreads|apple music|wikipédia)\s*$|^https?://")


def ask(text):
    req = urllib.request.Request("http://127.0.0.1:7799/api/plugins/catalog/tools/preview", data=json.dumps({"text": text}).encode(),
                                 headers={"x-atlas": "1", "content-type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=200) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        return {"error": e.read().decode()[:400]}
    except Exception as e:
        return {"error": f"{type(e).__name__}: {e}"}


def judge(case, p):
    want = case["kind"]
    kind = (p.get("candidate") or {}).get("kind")
    path = p.get("path") or ""
    title = ((p.get("merged") or {}).get("fields") or {}).get("title")
    err = p.get("error")
    problems = []
    if want is None:
        if kind or not (err and "nothing to catalogue" in err):
            problems.append(f"plain text was catalogued as {kind}")
    else:
        if err:
            problems.append("error: " + re.sub(r'^\{"error":"(command failed: plugin catalog: preview: )?', "", err)[:160])
        elif want != "*" and kind not in want.split("|"):
            problems.append(f"kind {kind} (want {want})")
        if not err and case.get("folder") and not path.startswith(case["folder"]):
            problems.append(f"folder {path.rsplit('/', 1)[0]} (want {case['folder']})")
        if not err and (not title or JUNK.search(str(title).strip())):
            problems.append(f"title {title!r}")
    return {"text": case["text"], "source": case["source"], "want": want, "kind": kind, "path": path, "title": title, "problems": problems,
            "fields": sorted(((p.get("merged") or {}).get("fields") or {}).keys())}


def run():
    corpus = json.load(open("corpus1000.json"))
    done = set()
    if os.path.exists(OUT):
        done = {json.loads(l)["text"] for l in open(OUT)}
    todo = [c for c in corpus if c["text"] not in done]
    print(f"{len(todo)} to run ({len(done)} done)", flush=True)
    with cf.ThreadPoolExecutor(3) as ex, open(OUT, "a") as out:
        for i, r in enumerate(ex.map(lambda c: judge(c, ask(c["text"])), todo), 1):
            out.write(json.dumps(r, ensure_ascii=False) + "\n")
            out.flush()
            if i % 50 == 0:
                print(i, flush=True)


def report():
    rows = [json.loads(l) for l in open(OUT)]
    ok = [r for r in rows if not r["problems"]]
    print(f"{len(ok)} / {len(rows)} as expected\n")
    by = defaultdict(lambda: [0, 0])
    for r in rows:
        by[r["source"]][0 if not r["problems"] else 1] += 1
    for s, (g, b) in sorted(by.items(), key=lambda x: -x[1][1]):
        print(f"{b:4} bad {g:4} ok  {s}")
    print()
    kinds = Counter(re.sub(r"\d+|'[^']*'|\([^)]*\)|https?://\S+", "…", p)[:90] for r in rows for p in r["problems"])
    for p, n in kinds.most_common(40):
        print(f"{n:4}  {p}")


if __name__ == "__main__":
    report() if sys.argv[1:] == ["report"] else run()
