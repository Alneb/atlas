# Export — a note to LaTeX and PDF

"Export to PDF" and "Export to LaTeX" in a note's right-click menu (file tree and tab) and in the palette ("Export the
open note to PDF / LaTeX"). The note is only read; what is made goes under the exports folder, at the note's own path:
`notes/reports/x.md` → `exports/notes/reports/x.tex` and `x.pdf`. The PDF opens when it is ready.

## How

1. The helper (`helper.py`) translates the note into plain pandoc Markdown (below).
2. **pandoc** writes the `.tex` (a standalone LaTeX document).
3. **latexmk** compiles that same `.tex` with the chosen engine, running **biber** for the bibliography. LaTeX's own
   files (`.aux`, `.log`, `.bbl`…) stay in `.atlas/cache/plugins/export/build/`, never in the vault.

So the `.tex` you get is the document the PDF was made from, and it compiles on its own beside the vault: pictures and
the `.bib` are named by paths relative to it.

## What a note becomes

| In the note | In the LaTeX |
|---|---|
| frontmatter `title`, `author`, `date`, `subtitle` | the title block; with no `title`, the first `# Heading` (taken out of the text), else the file name |
| `[[citekey]]`, `[[citekey\|text]]` — a link to a paper whose key is in the `.bib` | `\cite{citekey}`, and a bibliography at the end (biblatex, the style from the settings) |
| `[[note]]`, `[[note\|alias]]`, `[[note#Heading]]` | the alias, else the note's name (or the heading) as text |
| `![[plot.png\|600]]` and an italic line under it (`*Figure 1. The spectral function.*`) | a numbered figure with that caption ("Figure 1." dropped: LaTeX numbers them), the width from the pixels, and `plot.pdf` instead when it sits beside the `.png` (a sharper vector plot) |
| `![[note]]`, `![[note#Heading]]` | that note's text, or that section of it, inlined (three levels deep at most) |
| `> [!note] Title` callouts | a quote with the title in bold |
| `==marked==` | `\hl{marked}` (soul) |
| `%%comments%%`, ` ^block-ids`, `view` / `base` / `tasks` / `dataview` / `query` blocks | left out: nothing to print |
| `$…$`, `$$…$$`, tables, code, lists, headings | pandoc's own (with `# ` as the title, `## ` sections become `\section`) |

Code (fenced blocks and `inline code`) is never touched. Pictures and notes are found as Obsidian finds them: beside
the note, from the vault's top, else the file of that name with the shortest path. What is not found is listed in a
notice after the export, and the export goes on.

## Settings

Exports folder (`exports`), LaTeX engine (`lualatex`, `xelatex`, `pdflatex`), and under LaTeX: the bibliography (empty:
`refs/refs.bib`, else the one `.bib` at the top or in `refs/`), the biblatex style (`numeric-comp`; `phys`,
`authoryear`…), the font size, the language, and an extra preamble — a `.tex` of the vault `\input` into every export
(packages, macros).

## Needs

- **pandoc** (2.19 or newer) and a TeX distribution with **latexmk** and **biber** (TeX Live, MiKTeX) on the machine
  running Atlas's server — with a remote vault, on the server. A missing program is named in the error.
- Python 3.9+ (standard library only).
- Linux; on macOS and Windows it should work with the same programs installed, but has not been tried there.

## Limits

- The `.tex` and `.pdf` are written straight to the vault's disk: the helper API has no way to write a binary file yet.
  Atlas's watcher still sees them (the index, the mirror). Each export replaces the previous one of the same note.
- Drawings, PDFs and Bases embedded in a note are left out (named in a notice).

Tests: `python3 test_export.py` (the translation on a throwaway vault; a real export when pandoc and latexmk are installed).
