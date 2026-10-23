#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["pyyaml>=6"]
# ///
"""Copy the notes ticked in a vault_score.py review list into an Atlas workspace.

- Placement: Lecture/Course notes → <lectures>/<course-slug>/, everything else → notes/.
  Filenames are kept so [[wikilinks]] keep resolving.
- Frontmatter: empty fields (null, "", [], [null]) and Obsidian cosmetics (cssclasses, icon)
  are dropped; a block left empty is removed. Bodies are copied byte-for-byte.
- Embeds `![[x]]` are copied to notes/attachments/ (found anywhere in the vault).
- Dry run by default; --apply writes. Never overwrites a different existing file; the vault is
  only read. Every copy is recorded in notes/.vault-migration.tsv.
Usage: vault_migrate.py VAULT REVIEW.md WORKSPACE [--lectures notes/lectures] [--apply]
"""
from __future__ import annotations
import argparse, re, sys, hashlib
from pathlib import Path
import yaml

FM = re.compile(r"\A---\n(.*?)\n---\n?", re.S)
TICK = re.compile(r"^- \[[xX]\] `([^`]+)`")
EMBED = re.compile(r"!\[\[([^\]|#]+)")
WIKI = re.compile(r"\[\[([^\]|#]+)")
COSMETIC = {"cssclasses", "icon"}

def empty(v) -> bool:
    if v is None or v == "" or v == []:
        return True
    return isinstance(v, list) and all(empty(x) for x in v)

def clean_frontmatter(text: str) -> str:
    m = FM.match(text)
    if not m:
        return text
    try:
        meta = yaml.safe_load(m.group(1))
    except yaml.YAMLError:
        return text  # unparseable: keep verbatim rather than guess
    if not isinstance(meta, dict):
        return text
    kept = {k: v for k, v in meta.items() if k not in COSMETIC and not empty(v)}
    body = text[m.end():]
    if not kept:
        return body.lstrip("\n")
    dumped = yaml.safe_dump(kept, allow_unicode=True, sort_keys=False, default_flow_style=False)
    return f"---\n{dumped}---\n{body}"

def slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-") or "course"

def meta_of(p: Path) -> dict:
    m = FM.match(p.read_text(encoding="utf-8", errors="replace"))
    try:
        d = yaml.safe_load(m.group(1)) if m else {}
    except yaml.YAMLError:
        d = {}
    return d if isinstance(d, dict) else {}

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("vault", type=Path); ap.add_argument("review", type=Path); ap.add_argument("workspace", type=Path)
    ap.add_argument("--lectures", default="notes/lectures"); ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()

    picked = [a.vault / m.group(1) for line in a.review.read_text().splitlines() if (m := TICK.match(line))]
    by_stem = {p.stem: p for p in a.vault.rglob("*.md") if ".trash" not in p.parts}
    by_name = {p.name: p for p in a.vault.rglob("*") if p.is_file() and ".trash" not in p.parts and ".git" not in p.parts}
    types = {s: str(meta_of(p).get("type", "")).lower() for s, p in by_stem.items()}

    plan: list[tuple[Path, Path, str]] = []  # (src, dst, content-or-"" for binary copy)
    for src in picked:
        if not src.exists():
            print(f"[migrate] !! missing in vault: {src}", file=sys.stderr); continue
        meta = meta_of(src); text = src.read_text(encoding="utf-8", errors="replace")
        t = str(meta.get("type", "")).lower()
        topics = meta.get("topics") or []
        topic_links = [x for s in (topics if isinstance(topics, list) else [topics]) if isinstance(s, str) for x in WIKI.findall(s)]
        course = src.stem if t == "course" else next((x for x in topic_links if types.get(x) == "course"), None)
        dst = (a.workspace / a.lectures / slug(course) / src.name) if (t in {"lecture", "course"} and course) else (a.workspace / "notes" / src.name)
        plan.append((src, dst, clean_frontmatter(text)))
        for e in EMBED.findall(text):
            e = e.strip()
            f = by_name.get(e) or by_name.get(e + ".md")
            if f:
                plan.append((f, a.workspace / "notes" / "attachments" / f.name, ""))
            else:
                print(f"[migrate] ?? embed not found: {e} (in {src.name})", file=sys.stderr)

    seen, conflicts, writes = set(), 0, 0
    manifest = []
    for src, dst, content in plan:
        if dst in seen:
            continue
        seen.add(dst)
        data = content.encode() if content else src.read_bytes()
        if dst.exists():
            if dst.read_bytes() == data:
                continue
            conflicts += 1
            print(f"[migrate] !! exists and differs, skipped: {dst}", file=sys.stderr); continue
        writes += 1
        manifest.append(f"{src}\t{dst.relative_to(a.workspace)}\t{hashlib.sha1(data).hexdigest()[:12]}")
        if a.apply:
            dst.parent.mkdir(parents=True, exist_ok=True); dst.write_bytes(data)
        else:
            print(f"[dry-run] {src.relative_to(a.vault)} → {dst.relative_to(a.workspace)}")
    if a.apply and manifest:
        mf = a.workspace / "notes" / ".vault-migration.tsv"
        with mf.open("a", encoding="utf-8") as fh:
            fh.write("\n".join(manifest) + "\n")
    print(f"[migrate] {len(picked)} ticked · {writes} {'written' if a.apply else 'to write'} · {conflicts} conflicts"
          + ("" if a.apply else " · dry run, pass --apply"), file=sys.stderr)
    return 1 if conflicts else 0

if __name__ == "__main__":
    sys.exit(main())
