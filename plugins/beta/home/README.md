# Home

Small additions to Today: chips in the greeting (the week and day of the year, the moon's phase, what is due or
overdue today), and two blocks that give the vault a shape. Everything is read from the notes; nothing is written.

- **`home.map`**: the vault's skeleton as a tree — the notes others hang from (by their `topics:` property, or the one
  set below), each with how many notes name it.
- **`home.areas`**: each top folder as a tile — how many notes, when it was last touched, how busy it was this month,
  and its latest notes, busiest first. Options: how many areas, how many notes each, folders left out. Mail, templates
  and Atlas's own folders are left out.

## Settings

- **Language** (`auto`, `en`, `es`; auto is the device's language).
- **Map: the property notes hang from** (`topics`): the links that make the tree (`topics`, `up`, `parent`…).

## Needs

Nothing.

## Platforms

Linux works; Android works (`phone = true`); macOS, Windows and a server are untested.

## Tests

`ui/tests/home-greeting.spec.ts`.
