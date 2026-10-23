#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["pymupdf>=1.24", "pyyaml>=6"]
# ///
"""Export a PDF's annotations (highlights with their text, text notes, ink) to markdown notes: the PDF's own, then those
in its companion drawing `x.pdf.excalidraw`, where every device writes them now (companion_marks).

Target: the paper's reading note `<citekey>.md` when the PDF lives in a Library paper folder (its note names a
citekey, or an `info.yaml` not folded yet — shape-based, so any `[refs] dir` works; a legacy `notes.md` is renamed first: reading_note.py),
else `<name>.notes.md`. The export sits between `<!-- atlas:annotations -->` markers and is replaced on
re-export, so the user's own writing in the same file is never touched. Each entry starts with a link to its
place, `[[<pdf>#page=N&annotation=<id>|p.N]]` (pdf.js's annotation id: object number + "R"): it opens the PDF there
and flashes the highlight (ui/src/lib/pdf-place.ts).
Usage: pdf_annotations.py PDF        (or JSON {"path": ...} on stdin, as an Atlas command)
"""
from __future__ import annotations
import json, re, sys
from pathlib import Path
import fitz  # PyMuPDF
sys.path.insert(0, str(Path(__file__).resolve().parent))
import reading_note  # noqa: E402  (beside this script)

START, END = "<!-- atlas:annotations -->", "<!-- /atlas:annotations -->"

def highlighted_text(page, annot) -> str:
    """Text under a highlight's quads (vertices come in groups of 4 points per quad)."""
    v = annot.vertices or []
    parts = []
    for i in range(0, len(v) - 3, 4):
        r = fitz.Quad(v[i:i + 4]).rect
        parts.append(page.get_textbox(r + (-1, -1, 1, 1)).strip())
    text = " ".join(p for p in parts if p) or page.get_textbox(annot.rect).strip()
    return re.sub(r"\s+", " ", text.replace("-\n", ""))

def place(link_path: str, page: int, annot) -> str:
    """`[[x.pdf#page=N&annotation=47R|p.N]]`; plain `p.N` when the file name would break a wikilink."""
    if any(c in link_path for c in "[]|#^"):
        return f"p.{page}"
    return f"[[{link_path}#page={page}&annotation={annot.xref}R|p.{page}]]"

def companion_marks(doc, pdf: Path, link_path: str) -> list[str]:
    """The marks in the PDF's companion drawing `x.pdf.excalidraw`, where every device now writes them (the desktop's
    PDF pane included; ui/src/lib/pdf-ink-save.ts): a highlight's passage read under its box (kept in PDF points), a
    text note, a page's pen marks (one line per page)."""
    path = pdf.with_name(pdf.name + ".excalidraw")
    try:
        els = json.loads(path.read_text(encoding="utf-8")).get("elements") or []
    except (OSError, ValueError):
        return []
    els = [e for e in els if isinstance(e, dict) and not e.get("isDeleted")]
    # a frame's page: the PDF page picture in it (`customData.atlasPage`)
    page_of = {e.get("frameId"): (e.get("customData") or {}).get("atlasPage", {}).get("page")
               for e in els if e.get("type") == "image" and (e.get("customData") or {}).get("atlasPage")}
    link = lambda n: f"p.{n}" if any(c in link_path for c in "[]|#^") else f"[[{link_path}#page={n}|p.{n}]]"
    out, passages, inked = [], {}, set()
    for e in els:
        hl = (e.get("customData") or {}).get("atlasHighlight")
        if isinstance(hl, dict) and hl.get("rect") and hl.get("page"):
            passages.setdefault((hl["page"], hl.get("mark") or e.get("id")), []).append(hl["rect"])
        elif e.get("type") == "text" and page_of.get(e.get("frameId")):
            out.append((page_of[e["frameId"]], f"- {link(page_of[e['frameId']])} — note: {(e.get('text') or '').strip() or '(empty)'}"))
        elif e.get("type") == "freedraw" and page_of.get(e.get("frameId")):
            inked.add(page_of[e["frameId"]])
    for (n, _), rects in passages.items():
        if not 1 <= n <= len(doc):
            continue
        page = doc[n - 1]
        h = page.rect.height  # PDF points are y-up; PyMuPDF's page space is y-down
        parts = [page.get_textbox(fitz.Rect(r[0], h - r[3], r[2], h - r[1]) + (-1, -1, 1, 1)).strip() for r in rects]
        text = re.sub(r"\s+", " ", " ".join(p for p in parts if p).replace("-\n", ""))
        out.append((n, f"- {link(n)} — > {text or '(no text under it)'}"))
    out += [(n, f"- {link(n)} — handwritten mark") for n in sorted(inked)]
    return [line for _, line in sorted(out, key=lambda t: t[0])]

def export(pdf: Path, link_path: str | None = None) -> tuple[Path, int]:
    """`link_path`: the PDF as the vault names it (the command's vault-relative path); else the file's name."""
    link_path = link_path or pdf.name
    doc = fitz.open(pdf)
    lines, n = [], 0
    for page in doc:
        for a in page.annots() or []:
            kind = a.type[1]
            note = (a.info.get("content") or "").strip()
            p = page.number + 1
            if kind in ("Highlight", "Underline", "Squiggly", "StrikeOut"):
                text = highlighted_text(page, a)
                lines.append(f"- {place(link_path, p, a)} — > {text}" + (f"\n  - {note}" if note else ""))
            elif kind in ("FreeText", "Text"):
                lines.append(f"- {place(link_path, p, a)} — note: {note or '(empty)'}")
            elif kind == "Ink":
                lines.append(f"- {place(link_path, p, a)} — handwritten mark" + (f": {note}" if note else ""))
            else:
                continue
            n += 1
    extra = companion_marks(doc, pdf, link_path)
    lines += extra
    n += len(extra)
    paper = reading_note.is_paper(pdf.parent)
    target = reading_note.note_path(pdf.parent) if paper else pdf.with_suffix(".notes.md")
    block = f"{START}\n## Annotations — {pdf.name}\n\n" + ("\n".join(lines) or "_none yet_") + f"\n{END}\n"
    old = target.read_text(encoding="utf-8") if target.exists() else (reading_note.new_text(pdf.parent) if paper else "")
    if START in old and END in old:
        new = old[: old.index(START)] + block + old[old.index(END) + len(END):].lstrip("\n")
    else:
        new = (old.rstrip() + "\n\n" if old.strip() else "") + block
    target.write_text(new, encoding="utf-8")
    return target, n

def main() -> int:
    if len(sys.argv) > 1:
        path = sys.argv[1]
    else:
        path = json.load(sys.stdin)["path"]
    # a vault-relative path (the Atlas command, run in the vault) is what a link in the vault names
    target, n = export(Path(path), None if Path(path).is_absolute() else path)
    print(f"{n} annotations → {target}")
    return 0

if __name__ == "__main__":
    sys.exit(main())
