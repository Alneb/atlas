# Word count (example)

The smallest working plugin: a block, a command, an editor menu row and one setting, in about 50 lines of JavaScript
with no build step. Copy the folder to `<vault>/.atlas/plugins/wordcount/` and it is live; it reloads on every save.

## What it adds

- **The block `wordcount.count`**: the words of the note it is in (frontmatter left out), against a goal; redrawn when
  the note is saved. Option: **Goal**.
- **The command** "Word count: how far is this note from the goal?".
- **Editor menu**: "Word count: N selected", which copies the number.

## Settings

- **Daily goal (words)** (500): read as `atlas.plugin.settings.goal`; the vault's value lives in
  `.atlas/plugin-settings/wordcount.toml`.

## What it shows a plugin author

`register(atlas)`, `registerBlock` with options, `onFilesChanged` as a block's cleanup, `registerCommand`,
`shell.menu`, and the app's CSS variables. docs/guides/PLUGIN-API.md has the rest.

## Platforms

Linux works; Android works (`phone = true`).
