"""Boox Notes → Atlas drawings: reads Boox Notes' KSync tree (`/sdcard/.ksync` on the Boox itself, or a
copy of it on a computer), converts each note with convert.py and writes `<folder>/<title>.excalidraw` through Atlas.

A drawing is written only by this importer and only while it is still what the importer wrote: one edited since (in
Atlas, by hand) is kept and said so — never overwritten (docs/PHILOSOPHY.md §2). What was written is remembered in the
plugin's cache (`imports.json`: document → path and the hash of what was written).
"""
import hashlib
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import atlas_plugin as atlas  # noqa: E402  (Atlas puts it on PYTHONPATH)
import convert  # noqa: E402
import ksync  # noqa: E402
import ksync_shapes  # noqa: E402
import ksync_text  # noqa: E402

CACHE = os.path.join(os.environ.get("ATLAS_PLUGIN_CACHE", "."), "imports.json")


def _root(params):
    root = os.path.expanduser(((params.get("settings") or {}).get("ksync") or "/sdcard/.ksync").strip())
    if not os.path.isdir(os.path.join(root, "document")):
        raise ValueError(f"no Boox Notes data at {root} (a 'document' folder inside): on the Boox it is /sdcard/.ksync; on a computer, a copy of it (adb pull /sdcard/.ksync)")
    return root


def _created(root, doc_id):
    """The note's creation time (ms) from virtual/doc/pb/<id> (VirtualDoc.createdAt = field 2), else 0."""
    path = os.path.join(root, "document", doc_id, "virtual", "doc", "pb", doc_id)
    try:
        with open(path, "rb") as f:
            data = f.read()
        for num, wt, v in ksync.fields(data):
            if num == 1 and wt == 2:  # a VirtualDocList wraps the doc
                for n2, w2, v2 in ksync.fields(v):
                    if n2 == 2 and w2 == 0:
                        return v2
            if num == 2 and wt == 0:
                return v
    except (OSError, ValueError, IndexError):
        pass
    return 0


def _title(created, doc_id):
    stamp = time.strftime("%Y-%m-%d %H.%M", time.localtime(created / 1000)) if created else "undated"
    return f"Boox {stamp} {doc_id[:6]}"


def _memory():
    try:
        with open(CACHE) as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def _remember(mem):
    os.makedirs(os.path.dirname(CACHE) or ".", exist_ok=True)
    with open(CACHE, "w") as f:
        json.dump(mem, f, indent=1)


def _sha(text):
    return hashlib.sha256(text.encode()).hexdigest()


@atlas.method
def scan(params):
    """The notes found: [{id, title, created}], newest first, and whether each was imported."""
    root = _root(params)
    mem = _memory()
    out = []
    for d in sorted(os.listdir(os.path.join(root, "document"))):
        c = _created(root, d)
        out.append({"id": d, "title": _title(c, d), "created": c, "imported": mem.get(d, {}).get("path")})
    out.sort(key=lambda n: -n["created"])
    return {"root": root, "notes": out}


@atlas.method
def import_notes(params):
    """Converts every note (or `ids`) into `<folder>/<title>.excalidraw`; → what was made, kept, skipped."""
    root = _root(params)
    folder = ((params.get("settings") or {}).get("folder") or "boox").strip().strip("/")
    ids = params.get("ids") or sorted(os.listdir(os.path.join(root, "document")))
    mem, made, kept, failed, strokes, texts, shapes, skipped = _memory(), [], [], [], 0, 0, 0, 0
    for i, d in enumerate(ids, 1):
        atlas.event("progress", {"done": i - 1, "of": len(ids), "note": d})
        try:
            doc = ksync.decode_document(root, d)
            latest = ksync_text.latest(root, d)
            ksync_text.attach(root, doc, latest)
            ksync_shapes.attach(root, doc, latest)
            title = _title(_created(root, d), d)
            scene, n = convert.convert(doc, title, updated=int(time.time() * 1000))
            text = json.dumps(scene, separators=(",", ":"))
            path = mem.get(d, {}).get("path") or f"{folder}/{title}.excalidraw"
            try:
                now = atlas.read(path)
            except atlas.AtlasError:
                now = None
            if now is not None and _sha(now) != mem.get(d, {}).get("sha"):
                if mem.get(d):  # ours once, changed since: the user's now
                    kept.append(path)
                    continue
                path = f"{folder}/{title} ({d[:10]}).excalidraw"  # a file of the same name that is not ours
            atlas.write(path, text)
            mem[d] = {"path": path, "sha": _sha(text)}
            made.append(path)
            strokes += n["strokes"]
            texts += n["texts"]
            shapes += n["shapes"]
            skipped += n["skipped"]
        except Exception as e:  # one broken note never stops the rest; said in the result
            failed.append(f"{d}: {e}")
    _remember(mem)
    atlas.event("progress", {"done": len(ids), "of": len(ids)})
    return {"made": made, "kept": kept, "failed": failed, "strokes": strokes, "texts": texts, "shapes": shapes, "skipped": skipped}


if __name__ == "__main__":
    atlas.serve()
