"""convert.py on a decoded note shaped as ksync.decode_document returns it: `python3 test_convert.py`."""
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import convert  # noqa: E402


def stroke(sid, pts, pen="fountain", **kw):
    return {"id": sid, "shapeType": kw.pop("shapeType", 5), "pen": pen, "reference": False, "color": "#000000", "alpha": 1.0,
            "thickness": 5.9, "zorder": 0, "matrix": None, "points": pts, **kw}


DOC = {"id": "doc-1", "pages": [
    {"id": "p1", "index": 1, "width": 1860, "height": 2480, "strokes": [
        stroke("s1", [[100, 100, 0.2, 0], [200, 110, 0.5, 8], [300, 100, 0.6, 16], [400, 120, 0.4, 24]]),
        stroke("ref", [[10, 10, 0.5, 0], [20, 20, 0.5, 5]], reference=True),
        {"id": "txt", "shapeType": 16, "pen": None, "reference": False, "points": []},
        {"id": "geo", "shapeType": 40, "pen": None, "reference": False, "points": []},
    ], "shapes": [
        {"id": "axis", "zorder": 0, "color": "#ff6163", "alpha": 1.0, "width": 3.6, "kind": "line", "closed": False,
         "points": [[186, 1000], [930, 1000]]},
        {"id": "oval", "zorder": 0, "color": "#000000", "alpha": 1.0, "width": 3.6, "kind": "ellipse",
         "center": [930, 1240], "size": [400, 200], "angle": 0.5},
        {"id": "star", "zorder": 0, "color": "#000000", "alpha": 1.0, "width": 3.6, "kind": "other", "geometry": "Star"},
    ]},
    {"id": "p2", "index": 2, "width": 1860, "height": 2480, "strokes": [
        stroke("dot", [[930, 1240, 0.5, 0]], pen="marker", shapeType=15),
        stroke("old-fountain", [[100, 900, 0.3, 0], [300, 900, 0.9, 30]], pen="pencil-path", shapeType=4),
        stroke("pencil", [[100, 1000, 0.3, 0], [300, 1000, 0.9, 30]], pen="pencil-path", shapeType=2),
        stroke("gone", [[1, 1, 0.5, 0], [50, 50, 0.5, 9]], removed=True),
    ], "texts": [{"id": "t1", "text": "Kitaev chain\nMajoranas", "zorder": 0, "rect": [186, 248, 930, 300],
                  "size": 75.0, "color": "#000000", "alpha": 1.0}]},
]}


class Convert(unittest.TestCase):
    def setUp(self):
        self.scene, self.n = convert.convert(DOC, "Boox test", updated=1)
        self.els = self.scene["elements"]

    def test_a_page_per_boox_page_stacked(self):
        frames = [e for e in self.els if e["type"] == "frame"]
        self.assertEqual([f["name"] for f in frames], ["Page 1", "Page 2"])
        self.assertEqual(frames[0]["width"], convert.PAGE_WIDTH)
        self.assertAlmostEqual(frames[1]["y"], frames[0]["height"] + convert.GAP, places=1)

    def test_strokes_keep_pressure_and_belong_to_their_page(self):
        s1 = next(e for e in self.els if e["type"] == "freedraw" and e["frameId"] == self.els[0]["id"])
        self.assertEqual(s1["pressures"][:2], [0.2, 0.5])
        self.assertEqual(s1["customData"], {"atlasPen": "fountain", "openink": {"pen": 1, "t": [0.0, 8.0, 16.0, 24.0]}})
        k = convert.PAGE_WIDTH / 1860
        self.assertAlmostEqual(s1["x"], 100 * k, places=1)

    def test_references_dropped_text_counted_dots_kept(self):
        # the reference is a copy, the erased stroke is gone, the text shape is drawn from page["texts"]
        # the UNIVERSAL stroke entry is drawn from page["shapes"]; the unknown "Star" kind is the one not converted
        self.assertEqual(self.n, {"strokes": 4, "texts": 1, "shapes": 2, "skipped": 1})
        dot = [e for e in self.els if e["type"] == "freedraw" and e["customData"]["atlasPen"] == "highlighter"][0]
        self.assertEqual(len(dot["points"]), 2)
        self.assertEqual(dot["opacity"], 50, "the marker as the Boox Notepad saves it")
        self.assertEqual(dot["customData"]["openink"]["pen"], convert.MARKER)

    def test_knote2_pens_become_openinks_and_the_width_reads_back(self):
        by = {e["id"]: e for e in self.els if e["type"] == "freedraw"}
        old, pencil = by[convert._id("doc-1", "p2", "old-fountain")], by[convert._id("doc-1", "p2", "pencil")]
        self.assertEqual((old["customData"]["openink"]["pen"], old["customData"]["atlasPen"]), (1, "fountain"), "4 is knote2's fountain")
        self.assertEqual((pencil["customData"]["openink"]["pen"], pencil["customData"]["atlasPen"]), (0, "ballpoint"), "2 is its constant pencil")
        # the Boox Notepad reads the width as strokeWidth × outline (Stroke.java from): knote2's width, scaled to the page
        k = convert.PAGE_WIDTH / 1860
        for e in (old, pencil):
            mean = sum(e["pressures"]) / len(e["pressures"])
            back = e["strokeWidth"] * convert.outline(e["customData"]["openink"]["pen"], mean)
            self.assertAlmostEqual(back, 5.9 * k, places=2)
        self.assertGreater(old["strokeWidth"] * 0 + convert.outline(1, 0.9), convert.outline(1, 0.3), "a firm fountain is wider")

    def test_a_text_box_in_its_place_and_width_on_its_page(self):
        t = next(e for e in self.els if e["type"] == "text")
        k = convert.PAGE_WIDTH / 1860
        page2 = [e for e in self.els if e["type"] == "frame"][1]
        self.assertEqual(t["frameId"], page2["id"])
        self.assertEqual((t["originalText"], t["autoResize"], t["fontFamily"]), ("Kitaev chain\nMajoranas", False, convert.SANS))
        self.assertAlmostEqual(t["x"], 186 * k, places=1)
        self.assertAlmostEqual(t["y"], page2["y"] + 248 * k, places=1)
        self.assertAlmostEqual(t["width"], 930 * k, places=1)
        self.assertAlmostEqual(t["fontSize"], 75 * k, places=1)

    def test_long_text_wrapped_to_its_box(self):
        self.assertEqual(convert._wrap("aa bb cc", 10 * convert.CHAR_EM * 5, 10), "aa bb\ncc")
        self.assertEqual(convert._wrap("one\ntwo", 1000, 10), "one\ntwo")

    def test_stable_ids_for_a_second_import(self):
        again, _ = convert.convert(DOC, "Boox test", updated=1)
        self.assertEqual([e["id"] for e in again["elements"]], [e["id"] for e in self.els])



    def test_lines_and_ovals_where_the_boox_drew_them(self):
        k = convert.PAGE_WIDTH / 1860
        line = next(e for e in self.els if e["type"] == "line")
        self.assertEqual((line["x"], line["y"]), (round(186 * k, 2), round(1000 * k, 2)))
        self.assertEqual(line["points"], [[0, 0], [round(744 * k, 2), 0]])
        self.assertEqual((line["strokeColor"], line["strokeWidth"]), ("#ff6163", round(3.6 * k, 2)))
        oval = next(e for e in self.els if e["type"] == "ellipse")
        self.assertAlmostEqual(oval["x"] + oval["width"] / 2, 930 * k, places=1)  # turned about its centre
        self.assertAlmostEqual(oval["width"], 400 * k, places=1)
        self.assertEqual(oval["angle"], 0.5)


class Shapes(unittest.TestCase):
    MOVED = {"values": [0.75, 0.0, 100.0, 0.0, 0.75, 259.0, 0.0, 0.0, 1.0]}  # as knote2 writes it: a dict

    def universal(self, geometry, sub="", **kw):
        fc = {"features": [{"geometry": geometry, "properties": {"subType": sub}}]}
        return {"uniqueId": "u", "shapeType": 40, "thickness": 4.0, "color": -16777216, "matrixValues": self.MOVED,
                "extra": {"featureCollection": json.dumps(fc)}, **kw}

    def test_the_lassos_matrix_is_read_in_knote2s_form(self):
        import ksync
        self.assertEqual(ksync.matrix_of({"matrixValues": self.MOVED}), self.MOVED["values"])
        self.assertEqual(ksync.apply(ksync.matrix_of({"matrixValues": self.MOVED}), 232, 1340), (274.0, 1264.0))

    def test_a_line_a_polygon_and_an_oval_on_the_page(self):
        import ksync_shapes as ks
        line = ks.shape_of(self.universal({"type": "LineString", "coordinates": [[0, 0], [100, 0]]}))
        self.assertEqual((line["kind"], line["points"], line["width"]), ("line", [[100.0, 259.0], [175.0, 259.0]], 3.0))
        box = ks.shape_of(self.universal({"type": "Polygon", "coordinates": [[[0, 0], [10, 0]], [[10, 0], [10, 10]], [[10, 10], [0, 0]]]}))
        self.assertTrue(box["closed"])
        self.assertEqual(box["points"][0], box["points"][-1])
        self.assertEqual(len(box["points"]), 4)
        oval = ks.shape_of(self.universal({"type": "MultiPoint", "coordinates": [[0, 0], [200, 100]]}, sub="Oval"))
        self.assertEqual((oval["kind"], oval["center"], oval["size"], oval["angle"]), ("ellipse", [175.0, 296.5], [150.0, 75.0], 0.0))

    def test_erased_and_unknown_shapes(self):
        import ksync_shapes as ks
        self.assertIsNone(ks.shape_of(self.universal({"type": "LineString", "coordinates": [[0, 0], [1, 1]]}, shapeStatus=1)))
        self.assertIsNone(ks.shape_of({"shapeType": 5}))
        self.assertEqual(ks.shape_of(self.universal({"type": "Point", "coordinates": [0, 0]}))["kind"], "other")
        self.assertEqual(ks.shape_of({"uniqueId": "x", "shapeType": 40})["kind"], "other")  # no geometry at all


class Text(unittest.TestCase):
    def test_html_becomes_lines(self):
        import ksync_text
        self.assertEqual(ksync_text.plain("<p>Hello&nbsp;<b>world</b></p><p>a &amp; b<br/>c</p>"), "Hello world\na & b\nc")
        self.assertEqual(ksync_text.plain("plain"), "plain")
        self.assertEqual(ksync_text.plain(None), "")

    def test_only_live_text_with_a_box(self):
        import ksync_text
        box = {"left": 10, "top": 20, "right": 110, "bottom": 70}
        live = {"uniqueId": "a", "shapeType": 16, "text": "<p>hi</p>", "boundingRect": box, "textStyle": {"textSize": 50.0}}
        self.assertEqual(ksync_text.text_of(live)["rect"], [10, 20, 100, 50])
        self.assertEqual(ksync_text.text_of(live)["size"], 50.0)
        self.assertIsNone(ksync_text.text_of({**live, "shapeStatus": 1}))  # erased
        self.assertIsNone(ksync_text.text_of({**live, "shapeType": 5}))  # a stroke
        self.assertIsNone(ksync_text.text_of({**live, "text": "<p> </p>"}))  # empty
        self.assertEqual(ksync_text.text_of({**live, "text": None, "richText": "rich"})["text"], "rich")

    def test_a_rich_text_page_reads_its_resource(self):
        import ksync_text
        with tempfile.TemporaryDirectory() as doc_dir:
            os.makedirs(os.path.join(doc_dir, "resource", "data"))
            prose = {"content": {"type": "doc", "content": [
                {"type": "paragraph", "content": [{"type": "text", "text": "Okay these are"}, {"type": "hard_break"},
                                                  {"type": "text", "text": "test notes"}]},
                {"type": "paragraph", "content": [{"type": "text", "text": "second"}]}]}}
            with open(os.path.join(doc_dir, "resource", "data", "r.html"), "w") as f:
                json.dump(prose, f)
            page = {"uniqueId": "p", "shapeType": 29, "boundingRect": {"left": 0, "top": 0, "right": 1860, "bottom": 2480},
                    "resource": {"relativePath": "/r.html"}, "createArgs": {"dpi": 320.0}, "extra": {"textContent": ""}}
            t = ksync_text.text_of(page, doc_dir)
            self.assertEqual(t["text"], "Okay these are\ntest notes\nsecond")
            self.assertEqual((t["rect"][:2], t["size"]), ([56.0, 56.0], 32.0))  # CSS padding and size at 320 dpi
            self.assertIsNone(ksync_text.text_of(page))  # no folder to read it from


# --- the whole way: a KSync tree on disk (KNOTE2.md's format) → ksync → convert → the helper's import -------------

import struct  # noqa: E402
import zipfile  # noqa: E402


def _varint(n):
    out = b""
    n &= (1 << 64) - 1
    while True:
        b, n = n & 0x7F, n >> 7
        out += bytes([b | (0x80 if n else 0)])
        if not n:
            return out


def _field(num, value):
    if isinstance(value, int):
        return _varint(num << 3) + _varint(value)
    if isinstance(value, float):
        return _varint(num << 3 | 5) + struct.pack("<f", value)
    data = value.encode() if isinstance(value, str) else value
    return _varint(num << 3 | 2) + _varint(len(data)) + data


def ksync_tree(root, doc="d0c", page="0" * 36, shape="5" * 36, rev="r1"):
    d = os.path.join(root, "document", doc)
    os.makedirs(os.path.join(d, "shape"))
    info = _field(1, shape) + _field(3, 7) + _field(4, -16777216) + _field(5, 5.9) + _field(12, 5) + _field(16, rev)
    erased = "e" * 36
    drawn = _field(1, erased) + _field(3, 7) + _field(12, 5) + _field(16, rev)
    text = (_field(1, "t" * 36) + _field(3, 7) + _field(4, -16777216) + _field(12, 16) + _field(10, "<p>Lecture 3</p>")
            + _field(7, json.dumps({"left": 93, "top": 124, "right": 1023, "bottom": 224, "empty": False}))
            + _field(9, json.dumps({"textSize": 75.0, "textBold": True})))
    with zipfile.ZipFile(os.path.join(d, "shape", f"{page}#i1#1.zip"), "w") as z:
        z.writestr("shape.pb", _field(1, info) + _field(1, drawn) + _field(1, text))
    with zipfile.ZipFile(os.path.join(d, "shape", f"{page}#i2#2.zip"), "w") as z:  # later: the stroke erased
        z.writestr("shape.pb", _field(1, _field(1, erased) + _field(3, 9) + _field(12, 5) + _field(15, 1) + _field(16, rev)))
    os.makedirs(os.path.join(d, "virtual", "page", "pb"))
    pg = _field(1, page) + _field(3, 9) + _field(4, 1.0) + _field(8, json.dumps({"left": 0, "top": 0, "right": 1860, "bottom": 2480}))
    open(os.path.join(d, "virtual", "page", "pb", "p"), "wb").write(_field(1, pg))
    os.makedirs(os.path.join(d, "virtual", "doc", "pb"))
    open(os.path.join(d, "virtual", "doc", "pb", doc), "wb").write(_field(1, _field(1, doc) + _field(2, 1_700_000_000_000)))
    pts = os.path.join(root, "point", doc, page)
    os.makedirs(pts)
    data = b"\0\0\0\0" + b"".join(struct.pack(">ffhhi", 100 + 10 * i, 200 + 3 * i, 0, 1200 + 300 * i, 8 * i) for i in range(5))
    gone = b"\0\0\0\0" + b"".join(struct.pack(">ffhhi", 500 + 10 * i, 600, 0, 2000, 8 * i) for i in range(3))  # the erased one's points
    index = shape.encode().ljust(36) + struct.pack(">ii", 0, len(data)) + erased.encode() + struct.pack(">ii", len(data), len(gone))
    data += gone
    open(os.path.join(pts, f"{page}#{rev}#points"), "wb").write(data + index + struct.pack(">i", len(data)))


class Pages(unittest.TestCase):
    def test_page_files_are_deltas_and_a_deleted_page_goes(self):
        import ksync
        rec = lambda pid, idx, stamp, gone=False: _field(1, _field(1, pid) + _field(3, stamp) + _field(4, float(idx))
                                                         + (_field(5, 1) if gone else b""))
        with tempfile.TemporaryDirectory() as doc_dir:
            vp = os.path.join(doc_dir, "virtual", "page", "pb")
            os.makedirs(vp)
            # as Notes writes them: each file only the pages added or changed then
            open(os.path.join(vp, "a"), "wb").write(rec("one", 1, 1) + rec("two", 2, 2))
            open(os.path.join(vp, "b"), "wb").write(rec("three", 3, 3) + rec("extra", 4, 4))
            open(os.path.join(vp, "c"), "wb").write(rec("extra", 4, 5, gone=True))
            self.assertEqual([p["id"] for p in ksync.page_list(doc_dir)], ["one", "two", "three"])
            self.assertEqual([p["id"] for p in ksync.page_list(doc_dir, deleted=True)], ["extra"])


class FromDisk(unittest.TestCase):
    def test_a_tree_becomes_a_drawing_and_an_edited_one_is_kept(self):
        import types
        written = {}
        fake = types.ModuleType("atlas_plugin")
        class AtlasError(Exception):
            pass
        fake.AtlasError = AtlasError
        fake.method = lambda f=None, name=None: f
        fake.event = lambda *a, **k: None
        fake.write = lambda p, t: written.__setitem__(p, t)
        def read(p):
            if p not in written:
                raise AtlasError(404)
            return written[p]
        fake.read = read
        sys.modules["atlas_plugin"] = fake
        with tempfile.TemporaryDirectory() as tmp:
            ksync_tree(os.path.join(tmp, "ks"))
            os.environ["ATLAS_PLUGIN_CACHE"] = tmp
            sys.modules.pop("helper", None)
            import helper
            helper.CACHE = os.path.join(tmp, "imports.json")
            params = {"settings": {"ksync": os.path.join(tmp, "ks"), "folder": "boox"}}
            r = helper.import_notes(params)
            self.assertEqual(len(r["made"]), 1, r)
            self.assertEqual((r["strokes"], r["texts"]), (1, 1), r)  # the erased stroke left out
            path = r["made"][0]
            scene = json.loads(written[path])
            ink = [e for e in scene["elements"] if e["type"] == "freedraw"][0]
            self.assertAlmostEqual(ink["pressures"][0], 1200 / 4095, places=3)
            self.assertEqual([e["text"] for e in scene["elements"] if e["type"] == "text"], ["Lecture 3"])
            # imported again unchanged: rewritten; edited since: kept
            self.assertEqual(helper.import_notes(params)["made"], [path])
            written[path] = written[path].replace('"Page 1"', '"Kitaev"')
            again = helper.import_notes(params)
            self.assertEqual((again["made"], again["kept"]), ([], [path]))


if __name__ == "__main__":
    unittest.main()
