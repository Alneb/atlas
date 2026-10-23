"""pdf_annotations.py: in a Library paper folder the export goes into the reading note `<citekey>.md` (made with
its head when missing, a legacy notes.md renamed), between markers, and the user's writing stays.
Run: uv run --with pyyaml --with pymupdf python -m unittest"""
import importlib.util, sys, tempfile, unittest
from pathlib import Path

try:
    import fitz  # noqa: F401
except ImportError:  # the gate's Python may lack PyMuPDF: say so instead of failing
    fitz = None

@unittest.skipIf(fitz is None, "needs PyMuPDF (uv run --with pymupdf)")
class ExportTest(unittest.TestCase):
    def setUp(self):
        spec = importlib.util.spec_from_file_location("pa", Path(__file__).parents[1] / "pdf_annotations.py")
        self.pa = importlib.util.module_from_spec(spec); spec.loader.exec_module(self.pa)
        self.d = Path(tempfile.mkdtemp()) / "refs/papers/hubbard1963electron"; self.d.mkdir(parents=True)
        (self.d / "info.yaml").write_text("title: Electron correlations\nauthor: [Hubbard, J.]\ndate: '1963'\ncitekey: hubbard1963electron\n")
        doc = fitz.open(); page = doc.new_page(); page.insert_text((72, 72), "The Hubbard model")
        page.add_highlight_annot(page.search_for("Hubbard model")[0]); doc.save(self.d / "h.pdf")

    def test_export_goes_to_the_citekey_note_and_keeps_the_users_text(self):
        (self.d / "notes.md").write_text("My reading.\n")
        target, n = self.pa.export(self.d / "h.pdf")
        self.assertEqual((target.name, n), ("hubbard1963electron.md", 1))
        self.assertFalse((self.d / "notes.md").exists())
        t = target.read_text()
        self.assertTrue(t.startswith("---\ntype: literature\ncitekey: hubbard1963electron\n"), t)
        self.assertIn("My reading.", t); self.assertIn("<!-- atlas:annotations -->", t); self.assertIn("Hubbard model", t)
        target.write_text(t + "\nAfter the export.\n")
        self.pa.export(self.d / "h.pdf")
        t2 = target.read_text()
        self.assertEqual(t2.count("<!-- atlas:annotations -->"), 1); self.assertIn("After the export.", t2)

    def test_a_new_note_has_the_head_and_a_place_to_write(self):
        target, _ = self.pa.export(self.d / "h.pdf")
        t = target.read_text()
        self.assertIn("```view\ntype: library.paper\n```\n\n## Notes\n", t); self.assertIn("year: 1963", t)

    def test_each_highlight_links_to_its_place_in_the_pdf(self):
        xref = fitz.open(self.d / "h.pdf")[0].first_annot.xref
        target, _ = self.pa.export(self.d / "h.pdf", "refs/papers/hubbard1963electron/h.pdf")
        self.assertIn(f"- [[refs/papers/hubbard1963electron/h.pdf#page=1&annotation={xref}R|p.1]] — > ", target.read_text())
        self.assertEqual(self.pa.place("a [draft].pdf", 2, None), "p.2")  # a name that would break the link

    def test_the_companion_drawings_marks_are_read_too(self):
        # the desktop's PDF pane and the Boox write a PDF's marks to `x.pdf.excalidraw` (2026-10-20): a highlight keeps its
        # box in PDF points (y up), its passage read from under it; a text note; a page's pen marks
        doc = fitz.open(self.d / "h.pdf"); page = doc[0]; h = page.rect.height
        r = page.search_for("Hubbard model")[0]  # PyMuPDF's y-down rect → PDF points
        rect = [r.x0, h - r.y1, r.x1, h - r.y0]
        els = [
            {"id": "f", "type": "frame"},
            {"id": "pic", "type": "image", "frameId": "f", "customData": {"atlasPage": {"file": "h.pdf", "page": 1}}},
            {"id": "a", "type": "rectangle", "frameId": "f", "customData": {"atlasHighlight": {"page": 1, "mark": "m1", "rect": rect}}},
            {"id": "t", "type": "text", "frameId": "f", "text": "check the sign"},
            {"id": "s", "type": "freedraw", "frameId": "f"},
            {"id": "gone", "type": "text", "frameId": "f", "text": "erased", "isDeleted": True},
        ]
        import json
        (self.d / "h.pdf.excalidraw").write_text(json.dumps({"type": "excalidraw", "elements": els}))
        target, n = self.pa.export(self.d / "h.pdf", "refs/papers/hubbard1963electron/h.pdf")
        t = target.read_text()
        self.assertEqual(n, 4)  # the PDF's own highlight, then the drawing's three
        self.assertIn("[[refs/papers/hubbard1963electron/h.pdf#page=1|p.1]] — > Hubbard model", t)
        self.assertIn("— note: check the sign", t); self.assertIn("— handwritten mark", t); self.assertNotIn("erased", t)

if __name__ == "__main__":
    unittest.main()
