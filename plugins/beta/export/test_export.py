"""helper.py's translation on a throwaway vault, and a real export when pandoc + latexmk are there: `python3 test_export.py`."""
import os
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import helper  # noqa: E402

REPORT = """---
author: Alice
---
# A report

Citing [[hubbard1963]], linking [[Mott|the Mott note]], ==key==. %%hidden%%

## Model

![[plot.png|600]]

*Figure 1. The spectral function.*

> [!note] Remember
> the half-filled case. ^blk1

| Paper | Year |
| --- | --- |
| [[hubbard1963\\|Hubbard]] | 1963 |

`[[not a link]]`

```python
x = "[[kept]]"
```

```view
type: task-list
```

![[Mott#Gap]]
"""


class Translate(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp())
        (self.root / "notes").mkdir()
        (self.root / "figs").mkdir()
        (self.root / "figs/plot.png").write_bytes(b"png")
        (self.root / "figs/plot.pdf").write_bytes(b"%PDF")
        (self.root / "notes/Mott.md").write_text("# Mott\n\n## Gap\nThe gap opens.\n\n## Other\nnot this\n")
        (self.root / "notes/Report.md").write_text(REPORT)
        meta, self.md, self.t = helper.translate(self.root / "notes/Report.md", helper.Vault(self.root),
                                                 self.root / "exports/notes", {"hubbard1963"})
        self.meta = meta

    def tearDown(self):
        shutil.rmtree(self.root)

    def test_title_and_author_from_the_note(self):
        self.assertEqual(self.meta, {"author": "Alice", "title": "A report"})
        self.assertNotIn("# A report", self.md)

    def test_a_paper_link_is_a_citation_and_a_note_link_its_text(self):
        self.assertIn("Citing \\cite{hubbard1963}, linking the Mott note, \\hl{key}.", self.md)
        self.assertIn("| \\cite{hubbard1963} | 1963 |", self.md, "a table's escaped alias bar")
        self.assertEqual(self.t.cited, ["hubbard1963"])

    def test_a_figure_with_its_caption_its_vector_twin_and_width(self):
        self.assertIn("![The spectral function.](<../../figs/plot.pdf>){width=86%}", self.md)

    def test_what_has_no_print_goes_and_code_stays(self):
        for gone in ("hidden", "^blk1", "type: task-list", "[!note]", "not this"):
            self.assertNotIn(gone, self.md)
        for kept in ("`[[not a link]]`", 'x = "[[kept]]"', "The gap opens.", "**Remember**"):
            self.assertIn(kept, self.md)

    @unittest.skipUnless(shutil.which("pandoc") and shutil.which("latexmk"), "pandoc and latexmk are not installed")
    def test_a_real_export_writes_the_tex_and_the_pdf(self):
        (self.root / "refs").mkdir()
        (self.root / "refs/refs.bib").write_text("@article{hubbard1963, author={Hubbard, J.}, title={Bands}, journal={PRSA}, year={1963}}\n")
        shutil.copy(Path(__file__).with_name("test_figure.png"), self.root / "figs/plot.png")
        (self.root / "figs/plot.pdf").unlink()
        helper.ROOT, helper.CACHE = self.root, self.root / ".atlas/cache/plugins/export"
        r = helper.export({"path": "notes/Report.md", "to": "pdf", "settings": {}})
        self.assertEqual(r["written"], ["exports/notes/Report.tex", "exports/notes/Report.pdf"])
        self.assertTrue((self.root / "exports/notes/Report.pdf").read_bytes().startswith(b"%PDF"))
        self.assertIn("\\printbibliography", (self.root / "exports/notes/Report.tex").read_text())


FLOWCHART = r"""# Loop

```tikz
\usetikzlibrary{positioning,fit}
\usetikzlibrary{arrows.meta}
\begin{tikzpicture}[node distance=1cm, box/.style={draw, rounded corners}]
\node[box] (a) {Solver};
\node[box, below=of a] (b) {$\Sigma(\omega)$};
\draw[-{Stealth}] (a) -- (b);
\node[draw, dashed, fit=(a)(b)] {};
\end{tikzpicture}
```

```python
x = 1
```
"""


@unittest.skipUnless(shutil.which("pandoc"), "pandoc is not installed")
class Tikz(unittest.TestCase):
    """tikz.lua: a ```tikz block is the tikzpicture itself, its libraries in the preamble after tikz."""

    def setUp(self):
        self.root = Path(tempfile.mkdtemp())
        (self.root / "notes").mkdir()
        (self.root / "notes/Loop.md").write_text(FLOWCHART)
        helper.ROOT, helper.CACHE = self.root, self.root / ".atlas/cache/plugins/export"

    def tearDown(self):
        shutil.rmtree(self.root)

    def tex(self) -> str:
        helper.export({"path": "notes/Loop.md", "to": "tex", "settings": {}})
        return (self.root / "exports/notes/Loop.tex").read_text()

    def test_the_block_is_raw_latex_and_the_preamble_loads_tikz(self):
        tex = self.tex()
        pre, body = tex.split("\\begin{document}")
        self.assertIn("\\usepackage{soul}", pre, "the plugin's own preamble is kept")
        self.assertLess(pre.index("\\usepackage{soul}"), pre.index("\\usepackage{tikz}"))
        self.assertIn("\\usetikzlibrary{positioning,fit,arrows.meta}", pre)
        self.assertIn("\\begin{center}\n\\begin{tikzpicture}[node distance=1cm", body)
        self.assertIn("\\node[draw, dashed, fit=(a)(b)] {};", body)
        self.assertNotIn("usetikzlibrary", body, "the library lines left the picture")
        self.assertIn("\\begin{Shaded}", body, "other code stays code")

    def test_a_note_without_tikz_does_not_load_it(self):
        (self.root / "notes/Loop.md").write_text("# Plain\n\nNo pictures.\n")
        self.assertNotIn("tikz", self.tex())

    @unittest.skipUnless(shutil.which("latexmk"), "latexmk is not installed")
    def test_the_pdf_has_the_picture_as_vector_paths(self):
        r = helper.export({"path": "notes/Loop.md", "to": "pdf", "settings": {"engine": "xelatex"}})
        pdf = self.root / r["written"][-1]
        self.assertTrue(pdf.read_bytes().startswith(b"%PDF"))
        self.assertNotIn(b"/Subtype /Image", pdf.read_bytes(), "no raster image: the figure is drawn")


if __name__ == "__main__":
    unittest.main()
