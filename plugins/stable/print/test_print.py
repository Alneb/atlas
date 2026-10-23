"""helper.py with fake CUPS programs first on the PATH (no job ever reaches a real printer): `python3 test_print.py`."""
import os
import stat
import sys
import tempfile
import types
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.modules["atlas_plugin"] = types.SimpleNamespace(method=lambda fn=None, name=None: (fn if fn else (lambda f: f)), serve=lambda: None, get=None, post=None)
sys.path.insert(0, str(HERE))
import helper  # noqa: E402

FAKE = {
    "lpstat": '#!/bin/sh\ncase "$1" in -p) printf "printer Office is idle.  enabled since x\\nprinter Lab is idle.\\n";; -d) echo "system default destination: Lab";; esac\n',
    "lp": '#!/bin/sh\necho "$@" > "$LP_LOG"\necho "request id is Lab-42 (1 file(s))"\n',
}


class Print(unittest.TestCase):
    def setUp(self):
        self.bin = Path(tempfile.mkdtemp())
        for name, body in FAKE.items():
            (self.bin / name).write_text(body)
            (self.bin / name).chmod(stat.S_IRWXU)
        self.log = self.bin / "lp.log"
        os.environ["PATH"] = f"{self.bin}{os.pathsep}{os.environ['PATH']}"
        os.environ["LP_LOG"] = str(self.log)
        helper.C = {**os.environ, "LC_ALL": "C", "LANG": "C"}
        helper.ROOT = "/vault"

    def test_the_printers_with_the_default_first(self):
        self.assertEqual(helper.printers(), [{"value": "Lab", "label": "Lab (default)"}, {"value": "Office", "label": "Office"}])

    def test_a_file_prints_as_it_is_with_the_settings(self):
        r = helper.print_file({"path": "papers/a.pdf", "settings": {"printer": "Office", "copies": 2, "sides": "two-sided (long edge)", "media": "A4", "options": "-o fit-to-page"}})
        self.assertEqual(r, {"job": "Lab-42", "printed": "papers/a.pdf", "printer": "Office"})
        self.assertEqual(self.log.read_text().split(), ["-d", "Office", "-n", "2", "-o", "sides=two-sided-long-edge", "-o", "media=A4", "-o", "fit-to-page", "/vault/papers/a.pdf"])

    def test_a_note_prints_as_its_exported_pdf(self):
        asked = {}
        helper.atlas.get = lambda path: [{"id": "export", "settings": {"engine": "xelatex"}}]
        helper.atlas.post = lambda path, body: asked.update(path=path, body=body) or {"written": ["exports/n.tex", "exports/n.pdf"]}
        r = helper.print_file({"path": "notes/n.md", "settings": {}})
        self.assertEqual(asked["path"], "/api/plugins/export/helper")
        self.assertEqual(asked["body"]["params"], {"path": "notes/n.md", "to": "pdf", "settings": {"engine": "xelatex"}})
        self.assertEqual(r["printed"], "exports/n.pdf")
        self.assertEqual(self.log.read_text().split(), ["/vault/exports/n.pdf"])

    def test_a_note_without_the_export_plugin_says_so(self):
        helper.atlas.get = lambda path: []
        with self.assertRaisesRegex(RuntimeError, "Export plugin"):
            helper.print_file({"path": "notes/n.md", "settings": {}})


if __name__ == "__main__":
    unittest.main()
