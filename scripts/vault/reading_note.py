"""A paper's reading note for the scripts (zotero_sync.py, pdf_annotations.py): `<paper dir>/<citekey>.md`.

The scripts' copy of crates/atlas-core/src/reading_note.rs (docs/guides/ZOTERO.md, "The reading note"): the same
name, the same migration of a legacy `notes.md`, and the same default head — except that the vault's
`literature` template is not read here (Atlas uses it when it makes the note; a script makes one only for a
paper whose note does not exist yet). Keep the two in step.
"""
from __future__ import annotations
import datetime, re
from pathlib import Path
import yaml
import ref_entry  # beside this script

LEGACY = "notes.md"
BLOCK = "```view\ntype: library.paper\n```\n"

def _info(d: Path) -> dict:
    try:
        return ref_entry.read(d) or {}
    except (OSError, yaml.YAMLError):
        return {}

def citekey(d: Path) -> str:
    return str(_info(d).get("citekey") or d.name)

def _head(d: Path, m: dict | None = None) -> str:
    """Properties, title and the library.paper block (what Atlas writes without a template)."""
    m = _info(d) if m is None else m
    year = next((p for p in re.findall(r"\d+", str(m.get("date") or "")) if len(p) == 4), None)
    authors = m.get("author") or []
    source = (f"https://doi.org/{m['DOI']}" if m.get("DOI") else None) or m.get("url")
    key = str(m.get("citekey") or d.name)
    props = {"type": "literature", "citekey": key, "title": str(m.get("title") or key),
             "authors": (authors if isinstance(authors, list) else [authors]) or None, "year": int(year) if year else None,
             "source": source, "created": datetime.date.today()}
    fm = yaml.safe_dump({k: v for k, v in props.items() if v is not None}, allow_unicode=True, sort_keys=False, width=10_000)
    return f"---\n{fm}---\n# {props['title']}\n\n{BLOCK}"

def note_path(d: Path) -> Path:
    """`<d>/<citekey>.md`, after renaming a legacy `notes.md` into it (the header put above text that has none)."""
    path, legacy = d / f"{citekey(d)}.md", d / LEGACY
    if path.exists() or not legacy.exists():
        return path
    old = legacy.read_text(encoding="utf-8")
    if old.startswith("---\n"):
        legacy.rename(path)
        return path
    path.write_text(f"{_head(d)}\n{old}" if old.strip() else new_text(d), encoding="utf-8")
    legacy.unlink()
    return path

def new_text(d: Path, m: dict | None = None) -> str:
    """A new note with nothing of the user's yet: head, then a place to write (`m`: the entry, when not on disk yet)."""
    return f"{_head(d, m)}\n## Notes\n\n"

def is_paper(d: Path) -> bool:
    """Shape-based: a Library entry is a folder whose note names a citekey (or an info.yaml not folded yet), wherever
    `[refs] dir` puts them."""
    return ref_entry.is_entry(d)
