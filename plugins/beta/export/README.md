# Export

A note to a document someone else reads: a PDF (through Typst or LaTeX), LaTeX or Typst source, or Word. **Export…**
opens a dialog with the options on the left and a preview of the document on the right; the note is only read, and
the result goes under the exports folder at the note's own path (`notes/reports/x.md` → `exports/notes/reports/x.pdf`).

## What it adds

- **Export…** in a note's right-click menu (file tree and tab) and the command **Export the open note…**: a dialog over
  the app (a tab in an app older than plugin API 20).
- **The dialog**:
  - *Format* — **PDF (Typst)**: compiled by the Typst built into Atlas, fast, no TeX; the preview follows the options
    as you change them. **PDF (LaTeX)**: pandoc writes the `.tex` (kept beside the PDF), latexmk compiles it; the
    preview is made with **Preview**. **LaTeX source**, **Typst source**, **Word (.docx)**. A format whose programs
    are missing is shown greyed, saying what it needs.
  - *Document* — title, subtitle, author, date (from the note's properties, else its first heading, else its name;
    changed for this export only), table of contents, numbered sections.
  - *Page* — paper (A4, US Letter), font size, margins, one or two columns, language, font.
  - *References* (when the note links papers) — the `.bib`, the citation style (numeric, author–year, alphabetic,
    physics), each written in the format's own way (biblatex, Typst's bibliography, citeproc for Word).
  - *LaTeX* — engine, an extra preamble `.tex`. *Typst* — a preamble `.typ` (set and show rules).
  - *Where* — the exports folder; open the result when done.
  - Ctrl+Enter exports. The choices are saved as the plugin's settings, so the next export starts from them.
- **What a note becomes**: `[[citekey]]` → a citation when the key is in the `.bib`; other wikilinks → their alias or
  name; `![[picture|600]]` with an italic line under it → a numbered figure (a `.pdf` beside the `.png` is used
  instead, for a sharper plot); `![[note]]` / `![[note#Heading]]` → that text inlined (three levels at most); callouts
  → quotes with a bold title; `==marked==` → highlighted; ```` ```tikz ```` → the picture on the LaTeX road
  (`tikz.lua`, a pandoc Lua filter usable on its own), code elsewhere; ```` ```typst ```` → the picture on the Typst
  road, a PDF picture made by Atlas's Typst on the LaTeX road, code in Word; comments, block ids and query blocks left
  out.
- LaTeX's own files (`.aux`, `.log`, `.bbl`…) stay in `.atlas/cache/plugins/export/build/`; previews in
  `.atlas/cache/plugins/export/preview/`.

## Settings

The dialog's starting choices: format, exports folder, open when done; table of contents, numbered sections; paper,
font size, margins, columns, language, font; bibliography, citation style; LaTeX engine and preamble; Typst preamble.

## How it fits

**Print** uses it to print a note as a PDF (through the PDF road chosen here). The bibliography is a setting of its
own rather than the references plugin's, which it only matches by default.

## Needs

pandoc (3.0 or newer) on the machine running Atlas's core (a served vault: the server) for every format; for PDF
(LaTeX), a TeX distribution with latexmk and biber. PDF (Typst) needs nothing more: Typst is part of Atlas.

## Platforms

Linux works; the others are untested.

## Status

Beta. Tests: `node scripts/dev/plugin-ui.mjs --check plugins/beta/export` (the translation and each format's calls,
the programs faked); `ui/tests/example-export.spec.ts` (the dialog, a real Typst export when pandoc is installed). An
export cannot be stopped; drawings, PDFs and Bases embedded in a note are left out (named in the dialog).
