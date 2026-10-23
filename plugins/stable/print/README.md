# Print

"Print" in a file's right-click menu (file tree and tab) and the command "Print the open file".

- **A note prints as a document**: the Export plugin makes its PDF first (the same as "Export to PDF", with Export's
  settings: LaTeX engine, citations, preamble), and that PDF is printed. Without the Export plugin a note is not
  printed, and the notice says why.
- **Any other file** (a PDF, a picture, a text file) prints as it is.
- The job id, or the reason it was not printed (no such printer, CUPS missing, LaTeX failed), comes back as a notice.

## Settings

Printer (the printers CUPS knows are offered under the box, the default first; empty: the default printer), copies,
sides (one-sided, two-sided on the long or the short edge), paper (A4, Letter, A3, Legal, or the printer's own), and
more `lp` options added as they are (`-o fit-to-page -o page-ranges=1-3`).

## Needs

- CUPS (`lp`, `lpstat`) on the machine running Atlas's server — with a remote vault, the server prints. CUPS answers
  in the machine's language; the helper reads it in English (`LC_ALL=C`).
- Python 3.9+ (standard library) and, for notes, the Export plugin (pandoc + a TeX distribution).
- Linux and macOS (both ship CUPS); Windows has no `lp` and is not supported.

Tests: `python3 test_print.py` (fake `lp` / `lpstat` first on the PATH: no job reaches a real printer) and
`ui/tests/example-print.spec.ts` (a printer that does not exist: the reason shown as a notice).
