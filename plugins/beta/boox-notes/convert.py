"""A decoded Boox Notes document (ksync.decode_document) as an Excalidraw scene, one Atlas page per Boox page.

Pure: no files, no Atlas — the helper reads and writes, `test_convert.py` checks this. Every drawing made with Boox
Notes becomes an Excalidraw drawing; pages as in ui/src/lib/draw-pages.ts.
"""
import hashlib
import random

PAGE_WIDTH = 794  # scene units: an Atlas page (draw-pages.ts PAGE.width); a Boox page is 1860 px wide
GAP = 48
# Excalidraw's freedraw is ~strokeWidth × 4.25 × sin(π/4) × 2 ≈ 6 × strokeWidth across at mid pressure; a Boox
# thickness is the full width in page px — so this many strokeWidth per px keeps the line's look
FREEDRAW_PER_PX = 1 / 6.0
SIMPLIFY = 0.35  # page px: points closer than this to the line through their neighbours are dropped
# the Boox pen → the notepad pen whose crisp outline fits it (ui/src/lib/draw-ink.ts); the rest draw as a fountain
PEN = {"fountain": "fountain", "brush": "fountain", "calligraphy-latin": "fountain", "calligraphy-asia": "fountain",
       "pencil-path": "ballpoint", "charcoal": "ballpoint", "square": "ballpoint", "marker": "highlighter"}


# typed text: Excalidraw's plain sans (Nunito; no bold or italic there) at its usual line height
SANS = 6
LINE = 1.25
TEXT_SHAPES = {6, 16, 29}  # NoteShapeType text kinds, read by ksync_text.py


CHAR_EM = 0.55  # Nunito's mean character width in em: the wrap Excalidraw redoes exactly once the text is edited


def _wrap(text, width, size):
    """Greedy word wrap to `width` (Excalidraw keeps a loaded text's `text` as given, wrapped or not)."""
    per = max(1, int(width / (size * CHAR_EM)))
    out = []
    for para in text.split("\n"):
        line = ""
        for word in para.split(" "):
            if line and len(line) + 1 + len(word) > per:
                out.append(line)
                line = word
            else:
                line = f"{line} {word}" if line else word
        out.append(line)
    return "\n".join(out)


def _id(*parts):
    return hashlib.sha1("/".join(map(str, parts)).encode()).hexdigest()[:20]


def _simplify(pts, eps):
    """Ramer–Douglas–Peucker over (x, y); a pressure turn counts as shape too. pts: [[x, y, p, t], …]."""
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        s, e = stack.pop()
        ax, ay, ap = pts[s][0], pts[s][1], pts[s][2]
        bx, by, bp = pts[e][0], pts[e][1], pts[e][2]
        ln = ((bx - ax) ** 2 + (by - ay) ** 2) ** 0.5
        far, at = 0.0, -1
        for k in range(s + 1, e):
            qx, qy, qp = pts[k][0], pts[k][1], pts[k][2]
            d = ((qx - ax) ** 2 + (qy - ay) ** 2) ** 0.5 if ln < 1e-9 else abs((bx - ax) * (ay - qy) - (ax - qx) * (by - ay)) / ln
            m = max(d, abs(qp - (ap + bp) / 2) * 6)
            if m > far:
                far, at = m, k
        if far > eps and at > 0:
            keep[at] = True
            stack += [(s, at), (at, e)]
    return [p for p, k in zip(pts, keep) if k]


def convert(doc, title, updated=0):
    """→ (scene dict, {"strokes", "skipped"}). Pages stacked top to bottom in their Boox order."""
    elements, skipped, strokes, texts = [], 0, 0, 0
    rnd = random.Random(doc["id"])
    y = 0.0
    for n, page in enumerate(doc["pages"], 1):
        w, h = page.get("width") or 1860, page.get("height") or 2480
        k = PAGE_WIDTH / w
        frame_id = _id(doc["id"], page["id"], "frame")
        elements.append({
            "id": frame_id, "type": "frame", "x": 0, "y": round(y, 2), "width": PAGE_WIDTH, "height": round(h * k, 2),
            "angle": 0, "strokeColor": "#bbb", "backgroundColor": "transparent", "fillStyle": "solid", "strokeWidth": 2,
            "strokeStyle": "solid", "roughness": 0, "opacity": 100, "groupIds": [], "frameId": None, "roundness": None,
            "seed": rnd.randrange(1, 2**31), "version": 1, "versionNonce": rnd.randrange(1, 2**31), "isDeleted": False,
            "boundElements": None, "updated": updated, "link": None, "locked": False, "name": f"Page {n}",
        })
        for st in page.get("strokes", []):
            pts = [p for p in st.get("points", []) if p[0] == p[0] and p[1] == p[1]]  # NaN-free
            # not lost: a reference is a copy shown on another page, a removed shape was erased, text is page["texts"]
            elsewhere = st.get("reference") or st.get("removed") or st.get("shapeType") in TEXT_SHAPES
            if elsewhere or not st.get("pen") or len(pts) < 1:
                skipped += 0 if elsewhere else 1
                continue
            pts = _simplify(pts, SIMPLIFY)
            x0, y0 = pts[0][0] * k, pts[0][1] * k + y
            rel = [[round(p[0] * k - x0, 2), round(p[1] * k + y - y0, 2)] for p in pts]
            if len(rel) == 1:
                rel.append([rel[0][0] + 0.01, rel[0][1]])  # a dot: Excalidraw needs two points
            xs, ys = [p[0] for p in rel], [p[1] for p in rel]
            pressures = [max(0.05, min(1.0, float(p[2]))) for p in pts]
            if len(pressures) < len(rel):
                pressures.append(pressures[-1])
            pen = PEN.get(st["pen"], "fountain")
            elements.append({
                "id": _id(doc["id"], page["id"], st["id"]), "type": "freedraw", "x": round(x0, 2), "y": round(y0, 2),
                "width": round(max(xs) - min(xs), 2), "height": round(max(ys) - min(ys), 2), "angle": 0,
                "strokeColor": st.get("color") or "#000000", "backgroundColor": "transparent", "fillStyle": "solid",
                "strokeWidth": round(max(0.2, (st.get("thickness") or 3.0) * k * FREEDRAW_PER_PX), 3),
                "strokeStyle": "solid", "roughness": 0, "opacity": max(1, min(100, round((st.get("alpha") or 1) * (35 if pen == "highlighter" else 100)))),
                "groupIds": [], "frameId": frame_id, "roundness": None, "seed": rnd.randrange(1, 2**31), "version": 1,
                "versionNonce": rnd.randrange(1, 2**31), "isDeleted": False, "boundElements": None, "updated": updated,
                "link": None, "locked": False, "points": rel, "pressures": pressures, "simulatePressure": False,
                "lastCommittedPoint": rel[-1], "customData": {"atlasPen": pen},
            })
            strokes += 1
        for t in page.get("texts", []):  # typed text (ksync_text.attach): wraps in its Boox box's width
            tx, ty, tw, th = t["rect"]
            size = max(4.0, t["size"] * k)
            width = max(tw * k, size)
            wrapped = _wrap(t["text"], width, size)
            lines = wrapped.count("\n") + 1
            elements.append({
                "id": _id(doc["id"], page["id"], t["id"], "text"), "type": "text", "x": round(tx * k, 2),
                "y": round(ty * k + y, 2), "width": round(width, 2), "height": round(max(th * k, lines * size * LINE), 2),
                "angle": 0, "strokeColor": t.get("color") or "#000000", "backgroundColor": "transparent", "fillStyle": "solid",
                "strokeWidth": 1, "strokeStyle": "solid", "roughness": 0, "opacity": max(1, min(100, round((t.get("alpha") or 1) * 100))),
                "groupIds": [], "frameId": frame_id, "roundness": None, "seed": rnd.randrange(1, 2**31), "version": 1,
                "versionNonce": rnd.randrange(1, 2**31), "isDeleted": False, "boundElements": None, "updated": updated,
                "link": None, "locked": False, "text": wrapped, "originalText": t["text"], "fontSize": round(size, 2),
                "fontFamily": SANS, "textAlign": "left", "verticalAlign": "top", "containerId": None, "autoResize": False,
                "lineHeight": LINE,
            })
            texts += 1
        y += h * k + GAP
    scene = {
        "type": "excalidraw", "version": 2, "source": f"atlas boox-notes {doc['id']}",
        "elements": elements,
        "appState": {"viewBackgroundColor": "#ffffff", "currentItemRoughness": 0},
        "files": {},
        # what was made from what: the importer reads it back to tell its own file from one edited since
        "atlas": {"boox": {"document": doc["id"], "title": title, "updated": updated, "strokes": strokes, "texts": texts, "skipped": skipped}},
    }
    return scene, {"strokes": strokes, "texts": texts, "skipped": skipped}
