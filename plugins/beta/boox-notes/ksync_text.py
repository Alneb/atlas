"""The typed text of a Boox Notes document, which the vendored decoder (ksync.py, strokes only) leaves out.

A text shape (NoteShapeType 16 edit text, 29 rich text, 6 text) keeps its words in `text` (10, HTML since Notes
3.x: `ShapeTextUtils.updateOldTextToHtmlText`, or `richText` 22), its box in `boundingRect` (7, a fastjson RectF:
left/top/right/bottom in page px) and its look in `textStyle` (9, `ShapeTextStyle`: textSize px, textBold, …).
Read from boox_5c_re's decompiled knote2 (EditTextShape, ShapeTextStyle); not yet checked against a real note.
"""
import html
import os
import re

import ksync
from convert import TEXT_SHAPES

DEFAULT_SIZE = 75.0  # px: Notes' own default, 18 pt at 300 dpi (HWRTextResolver)


def plain(markup):
    """HTML (or plain text) → text with its line breaks: blocks and <br> end a line."""
    if not isinstance(markup, str):
        return ""
    t = re.sub(r"(?i)<br\s*/?>|</(p|div|li|h[1-6])\s*>", "\n", markup)
    t = html.unescape(re.sub(r"<[^>]*>", "", t)).replace("\xa0", " ")
    return "\n".join(line.rstrip() for line in t.strip("\n").split("\n")).strip()


def _latest(root, doc_id):
    """(pageId, uniqueId) → the newest version of each shape, as ksync.decode_document picks them."""
    latest = {}
    shape_dir = os.path.join(root, "document", doc_id, "shape")
    for f in sorted(os.listdir(shape_dir)) if os.path.isdir(shape_dir) else []:
        try:
            found = list(ksync.shapes_of_zip(os.path.join(shape_dir, f)))
        except Exception as e:  # a broken zip is ksync's to report; its strokes are skipped there too
            ksync.warn(f"{doc_id}: shape zip {f} skipped for text ({type(e).__name__})")
            continue
        for s in found:
            key = (f.split("#", 1)[0], s.get("uniqueId"))
            if key not in latest or s.get("updatedAt", 0) >= latest[key].get("updatedAt", 0):
                latest[key] = s
    return latest


def text_of(s):
    """One shape → {id, text, rect, size, color, alpha} or None when it is not text, erased, or empty."""
    if s.get("shapeType") not in TEXT_SHAPES or s.get("shapeStatus") == ksync.STATUS_REMOVED:
        return None
    words = plain(s.get("text")) or plain(s.get("richText"))
    r = s.get("boundingRect")
    if not words or not isinstance(r, dict):
        return None
    m = ksync.matrix_of(s)
    (x0, y0), (x1, y1) = ksync.apply(m, r.get("left", 0), r.get("top", 0)), ksync.apply(m, r.get("right", 0), r.get("bottom", 0))
    style = s.get("textStyle") if isinstance(s.get("textStyle"), dict) else {}
    color = s.get("color", -16777216) & 0xFFFFFFFF
    return {
        "id": s.get("uniqueId"), "text": words, "zorder": s.get("zorder", 0),
        "rect": [min(x0, x1), min(y0, y1), abs(x1 - x0), abs(y1 - y0)],
        "size": float(style.get("textSize") or DEFAULT_SIZE),
        "color": "#%06x" % (color & 0xFFFFFF), "alpha": (color >> 24) / 255,
    }


def attach(root, doc):
    """Adds each page's `texts` to a decoded document (ksync.decode_document's shape); → how many."""
    by_page = {}
    for (page_id, _), s in _latest(root, doc["id"]).items():
        t = text_of(s)
        if t:
            by_page.setdefault(page_id, []).append(t)
    for p in doc["pages"]:
        p["texts"] = sorted(by_page.get(p["id"], []), key=lambda t: (t["zorder"], t["id"] or ""))
    return sum(len(v) for v in by_page.values())
