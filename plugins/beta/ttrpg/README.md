# TTRPG

Tabletop role-playing in notes: stat blocks, dice, session notes and an initiative list. Also an example that uses most
of what a plugin can do with no helper program and no network — only files and JavaScript.

- A ` ```statblock ` fence (`name:`, `ac:`, `hp:`… one per line) draws a creature's card; a value that is dice is a
  button that rolls it.
- A ` ```roll ` fence draws one button per line (`attack: d20+4`), each rolling its dice.
- The `ttrpg.initiative` block lists every note with `type: character`, ordered by its `initiative` property; a click
  opens the character.
- Commands: "TTRPG: roll…" (Enter alone rolls the default die) and "TTRPG: new session note" (in the folder of the
  settings). Selected dice can be rolled from the editor's right-click menu.
- The last roll is shown in the status bar; a click there rolls the default die.

## Settings

- **Folder for session notes** (`campaigns/sessions`).
- **The die rolled when none is named** (`d20`, `d6`, `d100`).
- **Show every roll as a notification** (on).

## Needs

Nothing.

## Platforms

Linux works; Android works (`phone = true`); macOS, Windows and a server are untested.

## Tests

`ui/tests/example-ttrpg.spec.ts`.
