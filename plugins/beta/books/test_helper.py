"""helper.py: a DjVu made once into a cached PDF — `python3 test_helper.py` (needs djvulibre's c44 and ddjvu)."""
import os
import shutil
import subprocess
import sys
import tempfile
import types
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
fake = types.ModuleType("atlas_plugin")
fake.method = lambda f=None, name=None: f
sys.modules.setdefault("atlas_plugin", fake)
import helper  # noqa: E402


@unittest.skipUnless(shutil.which("c44") and shutil.which("ddjvu"), "djvulibre not installed")
class AsPdf(unittest.TestCase):
    def setUp(self):
        self.root = tempfile.mkdtemp()
        self.cache = os.path.join(self.root, ".atlas", "cache", "plugins", "books")
        os.makedirs(self.cache)
        os.makedirs(os.path.join(self.root, "books"))
        helper.ROOT, helper.CACHE = self.root, self.cache
        ppm = os.path.join(self.root, "page.ppm")
        with open(ppm, "wb") as f:  # a 64×64 grey page
            f.write(b"P6 64 64 255\n" + bytes([200]) * (64 * 64 * 3))
        subprocess.run(["c44", ppm, os.path.join(self.root, "books", "b.djvu")], check=True, capture_output=True)

    def tearDown(self):
        shutil.rmtree(self.root)

    def test_a_djvu_becomes_a_pdf_once(self):
        got = helper.as_pdf({"path": "books/b.djvu"})["path"]
        self.assertTrue(got.startswith(".atlas/cache/plugins/books/") and got.endswith(".pdf"), got)
        with open(os.path.join(self.root, got), "rb") as f:
            self.assertEqual(f.read(5), b"%PDF-")
        made = os.path.getmtime(os.path.join(self.root, got))
        self.assertEqual(helper.as_pdf({"path": "books/b.djvu"})["path"], got)
        self.assertEqual(os.path.getmtime(os.path.join(self.root, got)), made, "not made again")

    def test_no_ddjvu_is_said_and_nothing_is_left(self):
        helper.DDJVU = "no-such-ddjvu"
        try:
            with self.assertRaisesRegex(ValueError, "djvulibre"):
                helper.as_pdf({"path": "books/b.djvu"})
        finally:
            helper.DDJVU = "ddjvu"
        self.assertEqual(os.listdir(self.cache), [])


if __name__ == "__main__":
    unittest.main()
