"""The geometric shapes of a Boox Notes document, which the vendored decoder (ksync.py, strokes only) leaves out.

knote2 draws the line tool's and the shape tool's results as UNIVERSAL shapes (40): their geometry is a GeoJSON-like
`extra.featureCollection` in the shape's own coordinates, put on the page by `matrixValues` (the lasso's moves, scales
and turns). Kinds seen on real notes: `LineString` (a line through its vertices), `Polygon` (its edges, closed) and
`MultiPoint` with subType `Oval` (an ellipse in that box). Anything else is counted as not converted.
"""
import json
import math

import ksync
import ksync_text

UNIVERSAL = 40


def _features(s):
    extra = s.get("extra") if isinstance(s.get("extra"), dict) else {}
    try:
        return json.loads(extra.get("featureCollection") or "{}").get("features") or []
    except (ValueError, AttributeError):
        return []


def shape_of(s):
    """One shape → {id, zorder, kind, color, alpha, width, …} or None when it is not a live UNIVERSAL shape.
    kind "line": `points` on the page, `closed`; kind "ellipse": `center`, `size` (w, h), `angle` (radians);
    kind "other": not converted (its GeoJSON type in `geometry`)."""
    if s.get("shapeType") != UNIVERSAL or s.get("shapeStatus") == ksync.STATUS_REMOVED:
        return None
    m = ksync.matrix_of(s) or [1, 0, 0, 0, 1, 0, 0, 0, 1]
    scale = math.sqrt(abs(m[0] * m[4] - m[1] * m[3])) or 1.0
    color = s.get("color", -16777216) & 0xFFFFFFFF
    out = {"id": s.get("uniqueId"), "zorder": s.get("zorder", 0), "color": "#%06x" % (color & 0xFFFFFF),
           "alpha": (color >> 24) / 255, "width": float(s.get("thickness") or 3.0) * scale}
    feats = _features(s)
    g = (feats[0].get("geometry") or {}) if feats else {}
    kind, coords = g.get("type"), g.get("coordinates") or []
    sub = ((feats[0].get("properties") or {}).get("subType") or "") if feats else ""
    try:
        if kind == "LineString" and len(coords) >= 2:
            return {**out, "kind": "line", "closed": False, "points": [list(ksync.apply(m, x, y)) for x, y in coords]}
        if kind == "Polygon" and coords:  # its edges, each [from, to]
            pts = [list(ksync.apply(m, *edge[0][:2])) for edge in coords]
            return {**out, "kind": "line", "closed": True, "points": pts + [pts[0]]}
        if kind == "MultiPoint" and sub == "Oval" and len(coords) == 2:
            (x0, y0), (x1, y1) = coords[0][:2], coords[1][:2]
            sx, sy = math.hypot(m[0], m[3]), math.hypot(m[1], m[4])
            return {**out, "kind": "ellipse", "center": list(ksync.apply(m, (x0 + x1) / 2, (y0 + y1) / 2)),
                    "size": [abs(x1 - x0) * sx, abs(y1 - y0) * sy], "angle": math.atan2(m[3], m[0])}
    except (TypeError, ValueError, IndexError):
        pass
    return {**out, "kind": "other", "geometry": f"{kind or 'none'} {sub}".strip()}


def attach(root, doc, shapes=None):
    """Adds each page's `shapes` to a decoded document (ksync.decode_document's shape); → how many. `shapes`: the
    document's `ksync_text.latest` when already read."""
    by_page = {}
    for (page_id, _), s in (shapes if shapes is not None else ksync_text.latest(root, doc["id"])).items():
        g = shape_of(s)
        if g:
            by_page.setdefault(page_id, []).append(g)
    for p in doc["pages"]:
        p["shapes"] = sorted(by_page.get(p["id"], []), key=lambda g: (g["zorder"], g["id"] or ""))
    return sum(len(v) for v in by_page.values())
