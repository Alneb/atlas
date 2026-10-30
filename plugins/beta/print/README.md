# Print

Prints through CUPS, from a print dialog: the document as it will print on one side, the options on the other. Any
file is sent to the printer as it is; a note is printed as the PDF the Export plugin makes of it. The job id, or the
reason it failed, shows in the dialog.

## What it adds

- **Print** in the file tree's right-click menu and in a tab's menu, and the command **Print the open file**: each
  opens the print dialog (`view.js`) in a popup over the app (a tab in an app older than plugin API 20).
- **The print dialog**: a preview that is Atlas's own view of what will print (a note's PDF, made first); beside it
  the printer (the ones CUPS knows), copies, pages (`1-3,5`), sides, paper, landscape and fit to the page, prefilled
  from the settings below.
- A helper in JavaScript (run inside Atlas's core) that calls `lp` and `lpstat` through `atlas.exec`, with the
  programs allowed in the manifest (`[permissions] exec = ["lp", "lpstat"]`).

## Settings

- **Printer**: the CUPS printer to use; the printers CUPS knows are offered under the box (the default one first).
  Empty: the default printer.
- **Copies** (1).
- **Sides**: one-sided, two-sided (long edge) or two-sided (short edge).
- **Paper**: A4, Letter, A3, Legal; empty: the printer's own.
- **More lp options**: added as they are, for example `-o fit-to-page -o page-ranges=1-3`.

## How it fits

- A note (`.md`) is printed through the **Export** plugin: Print asks Export's helper for the PDF, then prints it.
  Without Export, printing a note says to install it. Print does not declare `requires = ["export"]`, because every
  other file prints without it.

## Needs

CUPS (`lp`, `lpstat`) on the machine running Atlas's core. On a served vault that is the server.

## Platforms

Linux works; macOS untested (CUPS ships with it); Windows no (no `lp`); a server untested.

## Status

Stable tier. Unit tests in `helper/helper.test.ts` (`node scripts/dev/plugin-ui.mjs --check plugins/beta/print`) and
an end-to-end spec (the dialog, then lp refusing a printer that does not exist). A note's PDF can take a while to
build (the dialog says so meanwhile); closing the dialog then stops it (the helper restarts on the next call). A print
sent to the printer is the printer's to cancel.
