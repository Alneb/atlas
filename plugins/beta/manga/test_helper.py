"""helper.py: a comic archive made once into a cached .cbz — `python3 test_helper.py` (needs bsdtar for the 7z/tar cases)."""
import os
import shutil
import subprocess
import sys
import tempfile
import types
import unittest
import zipfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
fake = types.ModuleType("atlas_plugin")
fake.method = lambda f=None, name=None: f
sys.modules.setdefault("atlas_plugin", fake)
import helper  # noqa: E402


@unittest.skipUnless(shutil.which("bsdtar"), "bsdtar not installed")
class AsCbz(unittest.TestCase):
    def setUp(self):
        self.root = tempfile.mkdtemp()
        self.cache = os.path.join(self.root, ".atlas", "cache", "plugins", "manga")
        os.makedirs(self.cache)
        helper.ROOT, helper.CACHE = self.root, self.cache
        src = os.path.join(self.root, "src")
        os.makedirs(os.path.join(src, "ch1"))
        for name in ("ch1/002.png", "ch1/001.jpg", "notes.txt"):
            with open(os.path.join(src, name), "wb") as f:
                f.write(name.encode())
        os.makedirs(os.path.join(self.root, "manga", "s"))
        self.src = src

    def tearDown(self):
        shutil.rmtree(self.root)

    def archive(self, name, fmt):
        out = os.path.join(self.root, "manga", "s", name)
        subprocess.run(["bsdtar", "--format", fmt, "-cf", out, "-C", self.src, "."], check=True)
        return os.path.relpath(out, self.root)

    def test_a_7z_and_a_tar_become_a_cbz_of_their_pictures_once(self):
        for name, fmt in (("one.cb7", "7zip"), ("two.cbt", "ustar")):
            rel = self.archive(name, fmt)
            got = helper.as_cbz({"path": rel})["path"]
            self.assertTrue(got.startswith(".atlas/cache/plugins/manga/") and got.endswith(".cbz"), got)
            with zipfile.ZipFile(os.path.join(self.root, got)) as z:
                self.assertEqual(sorted(z.namelist()), ["ch1/001.jpg", "ch1/002.png"])  # no text file
            made = os.path.getmtime(os.path.join(self.root, got))
            self.assertEqual(helper.as_cbz({"path": rel})["path"], got)  # asked again: the same file, not remade
            self.assertEqual(os.path.getmtime(os.path.join(self.root, got)), made)

    def test_a_tar_needs_no_program(self):
        rel = self.archive("three.cbt", "ustar")
        tools, helper.TOOLS = helper.TOOLS, []
        try:
            got = helper.as_cbz({"path": rel})["path"]
        finally:
            helper.TOOLS = tools
        with zipfile.ZipFile(os.path.join(self.root, got)) as z:
            self.assertEqual(sorted(z.namelist()), ["ch1/001.jpg", "ch1/002.png"])

    def test_no_pictures_and_no_tool_are_said(self):
        os.remove(os.path.join(self.src, "ch1", "001.jpg"))
        os.remove(os.path.join(self.src, "ch1", "002.png"))
        rel = self.archive("empty.cb7", "7zip")
        with self.assertRaisesRegex(ValueError, "no pictures"):
            helper.as_cbz({"path": rel})
        tools, helper.TOOLS = helper.TOOLS, [("no-such-unpacker", [])]
        try:
            with self.assertRaisesRegex(ValueError, "install bsdtar"):
                helper.as_cbz({"path": rel})
        finally:
            helper.TOOLS = tools
        self.assertEqual([f for f in os.listdir(self.cache)], [], "nothing half-made left in the cache")


if __name__ == "__main__":
    unittest.main()
