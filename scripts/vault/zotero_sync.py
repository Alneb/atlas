#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["pyyaml>=6"]
# ///
"""Keep refs/papers in step with a Zotero library — one way, Zotero → files; Zotero is never written.

Per item: <dest>/<citekey>/<citekey>.md, whose properties are every Zotero field (ref_entry.py; arbitrary keys), its PDFs (hard-linked), its Zotero
notes in its reading note `<citekey>.md` (each between `<!-- zotero:note KEY -->` markers, so text written in Atlas around
them stays; a legacy `notes.md` is renamed first — reading_note.py).
Runs incrementally: the state file remembers what each item looked like at the last sync, so a field is updated
only when Zotero changed it AND it was not edited in Atlas since; when both changed, Atlas's value stays and the
conflict is listed in the report for the user to decide. Items moved to Zotero's trash are reported, never deleted.

Usage: zotero_sync.py [--zotero DIR|auto] [--dest refs/papers] [--state FILE] [--report FILE] [--dry-run]
  --zotero auto (default) reads Zotero's own `extensions.zotero.dataDir` from its profile prefs.js.
"""
from __future__ import annotations
import argparse, hashlib, json, os, re, shutil, sqlite3, subprocess, sys, tempfile, time, unicodedata
from pathlib import Path
import yaml
sys.path.insert(0, str(Path(__file__).resolve().parent))
import reading_note  # noqa: E402  (beside this script)
import ref_entry  # noqa: E402

MISSING = object()

def log(msg: str) -> None:
    print(f"[zotero] {msg}", file=sys.stderr)

# --- where the library is ----------------------------------------------------------------------
def find_zotero_dir() -> Path | None:
    """Zotero's data folder as Zotero itself records it (desktop and flatpak profiles), else ~/Zotero."""
    home = Path.home()
    for prefs in [*home.glob(".zotero/zotero/*/prefs.js"), *home.glob(".var/app/org.zotero.Zotero/.zotero/zotero/*/prefs.js")]:
        m = re.search(r'user_pref\("extensions\.zotero\.dataDir",\s*"([^"]+)"\)', prefs.read_text(errors="ignore"))
        if m and (Path(m.group(1)) / "zotero.sqlite").is_file():
            return Path(m.group(1))
    return home / "Zotero" if (home / "Zotero" / "zotero.sqlite").is_file() else None

def open_db(zdir: Path) -> tuple[sqlite3.Connection, Path | None]:
    """Read-only. A running Zotero locks its database, so then read a consistent copy instead."""
    src = zdir / "zotero.sqlite"
    try:
        db = sqlite3.connect(f"file:{src}?mode=ro", uri=True, timeout=1)
        db.execute("select count(*) from items").fetchone()
        return db, None
    except sqlite3.OperationalError:
        tmp = Path(tempfile.mkdtemp(prefix="zotero-sync-")) / "zotero.sqlite"
        shutil.copy2(src, tmp)
        db = sqlite3.connect(f"file:{tmp}?mode=ro&immutable=1", uri=True)
        if db.execute("pragma quick_check").fetchone()[0] != "ok":
            raise SystemExit("Zotero was writing its database while it was copied; the next run will retry.")
        return db, tmp

# --- reading Zotero (same mapping as the original importer) ------------------------------------
def ascii_word(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]", "", s.lower())

STOP = {"a", "an", "the", "on", "of", "in", "and", "for", "to", "with", "la", "le", "el", "de"}

def citekey(meta: dict) -> str:
    authors = meta.get("author") or meta.get("editor") or []
    last = ascii_word(authors[0].split(",")[0]) if authors else "anon"
    year = (re.search(r"\d{4}", str(meta.get("date", ""))) or [""])[0]
    first = next((w for w in (ascii_word(w) for w in str(meta.get("title", "")).split()) if w and w not in STOP), "untitled")
    return f"{last}{year}{first}"

def html_to_md(html: str) -> str:
    if shutil.which("pandoc"):
        r = subprocess.run(["pandoc", "-f", "html", "-t", "gfm", "--wrap=none"], input=html, capture_output=True, text=True, timeout=30)
        if r.returncode == 0:
            return r.stdout.strip()
    return re.sub(r"<[^>]+>", "", html).strip()

def read_library(db: sqlite3.Connection, zdir: Path) -> tuple[dict, set]:
    """zotero_key → {meta, files: [Path], notes: {note_key: markdown}}; plus the keys in Zotero's trash."""
    q = lambda sql: db.execute(sql).fetchall()
    deleted = {r[0] for r in q("select itemID from deletedItems")}
    items = {iid: (key, typ) for iid, key, typ in q("select i.itemID, i.key, t.typeName from items i join itemTypes t using(itemTypeID)")}
    fields: dict[int, dict] = {}
    for iid, name, val in q("select d.itemID, f.fieldName, v.value from itemData d join fields f using(fieldID) join itemDataValues v using(valueID)"):
        fields.setdefault(iid, {})[name] = val
    creators: dict[int, list] = {}
    for iid, first, last, ctype in q("""select ic.itemID, c.firstName, c.lastName, ct.creatorType from itemCreators ic
            join creators c using(creatorID) join creatorTypes ct using(creatorTypeID) order by ic.itemID, ic.orderIndex"""):
        creators.setdefault(iid, []).append((ctype, f"{last}, {first}" if first else last))
    tags: dict[int, list] = {}
    for iid, name in q("select it.itemID, t.name from itemTags it join tags t using(tagID)"):
        tags.setdefault(iid, []).append(name)
    colls: dict[int, list] = {}
    for iid, name in q("select ci.itemID, c.collectionName from collectionItems ci join collections c using(collectionID)"):
        colls.setdefault(iid, []).append(name)
    out: dict[str, dict] = {}
    trashed = {items[i][0] for i in deleted if i in items}
    for iid, (key, typ) in items.items():
        if iid in deleted or typ in {"attachment", "note", "annotation"}:
            continue
        meta = {"title": fields.get(iid, {}).get("title", "untitled"), "type": typ}
        for ctype, name in creators.get(iid, []):
            meta.setdefault(ctype, []).append(name)
        meta.update({k: v for k, v in fields.get(iid, {}).items() if k != "title"})
        if tags.get(iid): meta["tags"] = sorted(tags[iid])
        if colls.get(iid): meta["collections"] = sorted(colls[iid])
        meta["zotero_key"] = key
        out[key] = {"iid": iid, "meta": meta, "files": [], "notes": {}}
    by_iid = {e["iid"]: e for e in out.values()}
    for iid, parent, path in q("select itemID, parentItemID, path from itemAttachments"):
        if iid in deleted or not path or not path.startswith("storage:"):
            continue
        f = zdir / "storage" / items[iid][0] / path.removeprefix("storage:")
        if parent in by_iid:
            by_iid[parent]["files"].append(f)
        elif parent is None:  # a standalone PDF is its own entry, titled from the file name
            k = items[iid][0]
            out[k] = {"iid": iid, "meta": {"title": f.stem, "type": "document", "zotero_key": k, **({"collections": sorted(colls[iid])} if colls.get(iid) else {})}, "files": [f], "notes": {}}
    for iid, parent, html in q("select itemID, parentItemID, note from itemNotes"):
        if iid not in deleted and parent in by_iid and html:
            by_iid[parent]["notes"][items[iid][0]] = html_to_md(html)
    return out, trashed

# --- the reading note: Zotero notes as marked blocks -----------------------------------------------------
NOTE_RE = re.compile(r"<!-- zotero:note (\w+) -->\n(.*?)\n<!-- /zotero:note -->", re.S)
def digest(s: str) -> str:
    return hashlib.sha1(s.encode()).hexdigest()[:12]

def sync_notes(path: Path, znotes: dict, last: dict, report: list, title: str) -> tuple[str | None, dict]:
    """New text for the reading note (None = unchanged) and the note digests to remember."""
    text = path.read_text(encoding="utf-8") if path.exists() else ""
    blocks = {m.group(1): m for m in NOTE_RE.finditer(text)}
    new, seen = text, {}
    for nkey, md in znotes.items():
        seen[nkey] = digest(md)
        block = f"<!-- zotero:note {nkey} -->\n{md}\n<!-- /zotero:note -->"
        if nkey in blocks:
            cur = blocks[nkey].group(2)
            if cur == md:
                continue
            if last.get(nkey) == digest(cur):  # untouched in Atlas since the last sync → take Zotero's
                new = new.replace(blocks[nkey].group(0), block)
            else:
                report.append(f"- `{title}`: Zotero note {nkey} changed in Zotero and in Atlas — kept Atlas's text")
        elif md in text:  # imported before markers existed: already there
            continue
        else:
            new = (new.rstrip() + "\n\n" if new.strip() else "") + block + "\n"
    return (new if new != text else None), seen

def link_or_copy(src: Path, dst: Path) -> None:
    try:
        os.link(src, dst)
    except OSError:
        shutil.copy2(src, dst)

# --- the sync ----------------------------------------------------------------------------------
def sync(zdir: Path, dest: Path, state_path: Path, dry: bool) -> tuple[dict, list]:
    state = json.loads(state_path.read_text()) if state_path.exists() else {}
    src = zdir / "zotero.sqlite"
    stamp = f"{src.stat().st_mtime_ns}:{src.stat().st_size}"
    counts = {"created": 0, "updated": 0, "unchanged": 0, "conflicts": 0, "files": 0, "trashed": 0}
    report: list[str] = []
    if state.get("source") == str(zdir) and state.get("stamp") == stamp and not dry:
        return {**counts, "skipped": "no change in Zotero since the last sync"}, report
    db, tmp = open_db(zdir)
    try:
        lib, trashed = read_library(db, zdir)
    finally:
        db.close()
        if tmp: shutil.rmtree(tmp.parent, ignore_errors=True)
    existing: dict[str, Path] = {}
    for d in (p for p in dest.iterdir() if p.is_dir()) if dest.exists() else ():
        k = (ref_entry.read(d) or {}).get("zotero_key")
        if k: existing[k] = d
    used = {p.name for p in dest.iterdir()} if dest.exists() else set()
    items_state = state.get("items", {})
    for zkey, e in lib.items():
        zmeta, last = e["meta"], items_state.get(zkey)
        d = existing.get(zkey)
        present = [f for f in e["files"] if f.exists()]
        for f in e["files"]:
            if not f.exists(): report.append(f"- `{zmeta['title'][:60]}`: Zotero lists `{f.name}` but the file is not in its storage")
        if d is None:  # new in Zotero
            base = citekey(zmeta); key = base; n = 0
            while key in used:
                n += 1; key = base + "abcdefghijklmnopqrstuvwxyz"[n - 1]
            used.add(key)
            d = dest / key
            info = {**zmeta, "citekey": key, "files": [f.name for f in present]}
            counts["created"] += 1
            if not dry:
                d.mkdir(parents=True, exist_ok=True)
                ref_entry.write(d, info, lambda m, d=d: reading_note.new_text(d, m))
        else:
            info = ref_entry.read(d) or {}
            before = dict(info)
            snap = (last or {}).get("meta")
            for k in sorted(set(zmeta) | set(snap or {})):
                zv, sv, av = zmeta.get(k, MISSING), (snap or {}).get(k, MISSING), info.get(k, MISSING)
                if zv == av:
                    continue
                if snap is None:  # first sync of an entry imported before this tool: fill gaps, never overwrite
                    if av is MISSING:
                        info[k] = zv
                    else:
                        counts["conflicts"] += 1
                        report.append(f"- `{d.name}` **{k}**: Atlas `{str(av)[:60]}` ≠ Zotero `{str(zv)[:60]}` (first sync — kept Atlas's)")
                    continue
                if zv == sv:  # only Atlas changed it: Atlas's edit stands
                    continue
                if av == sv:  # only Zotero changed it
                    if zv is MISSING: info.pop(k, None)
                    else: info[k] = zv
                else:
                    counts["conflicts"] += 1
                    report.append(f"- `{d.name}` **{k}**: changed in Zotero (`{str(zv)[:50]}`) and in Atlas (`{str(av)[:50]}`) — kept Atlas's")
            have = set(info.get("files") or [])
            for f in present:
                if f.name not in have:
                    info.setdefault("files", []).append(f.name)
            if info != before:
                counts["updated"] += 1
                if not dry:
                    reading_note.note_path(d)  # a legacy notes.md becomes the note first, keeping its text
                    ref_entry.write(d, info, lambda m, d=d: reading_note.new_text(d, m))
            else:
                counts["unchanged"] += 1
        for f in present:
            if not dry and not (d / f.name).exists():
                link_or_copy(f, d / f.name); counts["files"] += 1
        # a dry run renames nothing: it reads whichever note is there
        note = reading_note.note_path(d) if not dry else next((p for p in (d / f"{reading_note.citekey(d)}.md", d / reading_note.LEGACY) if p.exists()), d / "none.md")
        notes_text, seen = sync_notes(note, e["notes"], (last or {}).get("notes", {}), report, d.name)
        if notes_text is not None and not dry:
            # a new note starts like one Atlas makes: properties, the paper's block, a place to write
            note.write_text(notes_text if note.exists() else reading_note.new_text(d) + notes_text, encoding="utf-8")
        items_state[zkey] = {"meta": zmeta, "notes": seen, "dir": d.name}
    for zkey in sorted(trashed & set(existing)):
        counts["trashed"] += 1
        report.append(f"- `{existing[zkey].name}` is in Zotero's trash — left here; delete it from the Library if you want it gone")
    if not dry:
        state_path.parent.mkdir(parents=True, exist_ok=True)
        state_path.write_text(json.dumps({"source": str(zdir), "stamp": stamp, "synced": time.strftime("%Y-%m-%d %H:%M"), "items": items_state}, ensure_ascii=False))
    return counts, report

def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--zotero", default="auto"); ap.add_argument("--dest", type=Path, default=Path("refs/papers"))
    ap.add_argument("--state", type=Path, default=Path(".atlas/cache/zotero-sync.json"))
    ap.add_argument("--report", type=Path, default=Path("refs/ZOTERO-SYNC.md"))
    ap.add_argument("--dry-run", action="store_true"); ap.add_argument("--apply", action="store_true", help="(default; kept for old commands)")
    a = ap.parse_args()
    zdir = find_zotero_dir() if a.zotero == "auto" else Path(os.path.expanduser(a.zotero))
    if not zdir or not (zdir / "zotero.sqlite").is_file():
        sys.exit("No Zotero library found (looked for extensions.zotero.dataDir in Zotero's prefs.js and ~/Zotero); pass --zotero DIR.")
    log(f"library {zdir} → {a.dest}{' (dry run)' if a.dry_run else ''}")
    counts, report = sync(zdir, a.dest, a.state, a.dry_run)
    if "skipped" in counts:
        log(counts["skipped"]); print(json.dumps({"changed": False, "reason": counts["skipped"]})); return 0
    summary = ", ".join(f"{v} {k}" for k, v in counts.items() if v)
    log(summary or "nothing to do")
    if report and not a.dry_run:
        a.report.parent.mkdir(parents=True, exist_ok=True)
        a.report.write_text(f"# Zotero sync — {time.strftime('%Y-%m-%d %H:%M')}\n\nFrom `{zdir}`. Nothing below was overwritten; decide each one in the Library.\n\n" + "\n".join(report) + "\n", encoding="utf-8")
        log(f"{len(report)} items need a look → {a.report}")
    print(json.dumps({"changed": True, **counts, "report": str(a.report) if report else None}))
    return 0

if __name__ == "__main__":
    sys.exit(main())
