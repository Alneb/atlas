"""A reference's fields are its note's properties, `<refs>/<key>/<key>.md` — the scripts' copy of
crates/atlas-core/src/ref_entry.rs (same names, same rules). Zotero's field names, except four the note uses for its own
meaning (RENAMED); an `info.yaml` not folded yet is still read, and the first write folds it into the note.
"""
from __future__ import annotations
from pathlib import Path
from typing import Callable
import yaml

LEGACY = "info.yaml"
RENAMED = {"type": "itemType", "date": "published", "author": "authors", "tags": "keywords"}
BACK = {n: z for z, n in RENAMED.items()}


class _Loader(yaml.SafeLoader):
    """Dates stay text, as the core reads them (a sync comparing `1972-08-04` with a date object saw a conflict)."""


_Loader.yaml_implicit_resolvers = {k: [r for r in v if r[0] != "tag:yaml.org,2002:timestamp"]
                                   for k, v in yaml.SafeLoader.yaml_implicit_resolvers.items()}


def load(text: str):
    return yaml.load(text, Loader=_Loader)


def note_file(d: Path) -> Path:
    return d / f"{d.name}.md"


def _fm(text: str) -> tuple[int, int] | None:
    """The frontmatter's body as a character range of `text` (between the fences)."""
    if not text.startswith("---\n"):
        return None
    rest = text[4:]
    end = rest.find("\n---")
    return (4, 4 + end + 1) if end >= 0 else ((4, 4) if rest.startswith("---") else None)


def props(text: str) -> dict | None:
    r = _fm(text)
    if not r:
        return None
    m = load(text[r[0]:r[1]])
    return m if isinstance(m, dict) else None


def _block(fm: str, key: str) -> tuple[int, int] | None:
    """Where `key`'s line and its continuation lines are inside the frontmatter body."""
    at, lines = 0, fm.splitlines(keepends=True)
    i = 0
    while i < len(lines):
        line, start = lines[i], at
        at += len(line); i += 1
        if not line.startswith((" ", "\t", "-", "#")) and ":" in line and line.split(":", 1)[0].strip().strip("'\"") == key:
            while i < len(lines) and (lines[i].startswith((" ", "\t")) or lines[i].startswith("- ")):
                at += len(lines[i]); i += 1
            return start, at
    return None


def _render(key: str, v) -> str:
    """As the core writes it: a list in block style, `key:` for nothing, YAML's own quoting otherwise."""
    if isinstance(v, list) and v:
        one = lambda x: yaml.safe_dump(x, allow_unicode=True, width=10**9).removesuffix("\n...\n").strip()  # noqa: E731
        return f"{key}:\n" + "".join(f"  - {one(x)}\n" for x in v)
    if v is None:
        return f"{key}:\n"
    return yaml.safe_dump({key: v}, allow_unicode=True, sort_keys=False, width=10**9)


def set_prop(text: str, key: str, v) -> str:
    r = _fm(text)
    if not r:
        return f"---\n{_render(key, v)}---\n{text}"
    a, b = r
    blk = _block(text[a:b], key)
    if blk:
        return text[:a + blk[0]] + _render(key, v) + text[a + blk[1]:]
    return text[:b] + _render(key, v) + text[b:]


def remove_prop(text: str, key: str) -> str:
    r = _fm(text)
    blk = r and _block(text[r[0]:r[1]], key)
    if not blk:
        return text
    return text[:r[0] + blk[0]] + text[r[0] + blk[1]:]


def read(d: Path) -> dict | None:
    """The entry in `d`, Zotero-shaped; None when the folder holds none (no info.yaml, no note with a citekey)."""
    legacy = d / LEGACY
    if legacy.exists():
        m = load(legacy.read_text(encoding="utf-8"))
        return m if isinstance(m, dict) else {}
    try:
        p = props(note_file(d).read_text(encoding="utf-8"))
    except OSError:
        return None
    if not p or ("citekey" not in p and "itemType" not in p):
        return None
    return {BACK.get(k, k): v for k, v in p.items() if not (k in RENAMED and RENAMED[k] != k)}


def write(d: Path, m: dict, new_note: Callable[[dict], str]) -> None:
    """The entry `m` into its note: made by `new_note(m)` when missing, each changed field set in place, a dropped one
    removed, the user's own properties and text kept; an `info.yaml` folded in and removed."""
    old = read(d) or {}
    path = note_file(d)
    before = path.read_text(encoding="utf-8") if path.exists() else new_note(m)
    have = props(before) or {}
    text = before
    for k, v in m.items():
        n = RENAMED.get(k, k)
        if have.get(n, object()) != v:
            text = set_prop(text, n, v)
    for k in old:
        if k not in m:
            text = remove_prop(text, RENAMED.get(k, k))
    if text != before or not path.exists():
        path.write_text(text, encoding="utf-8")
    (d / LEGACY).unlink(missing_ok=True)


def is_entry(d: Path) -> bool:
    return read(d) is not None
