# Word count (minimal example)

A minimal plugin: a block, a command and a right-click menu row in about thirty lines of JavaScript, live as soon as
the folder is copied into a vault's `.atlas/plugins/wordcount/` and reloaded on every save.

- The `wordcount.count` block shows the words of the note it is in (frontmatter left out), against a goal when one is
  set; it turns the accent colour once the goal is reached.
- The command "Word count: how far is this note from the goal?" says how many words the open note has.
- In the editor's right-click menu, "Word count: N selected" copies the number of selected words.
- Its comments show the conventions: a block named `<plugin id>.<name>`, options as form fields, the theme's CSS
  variables, a cleanup returned by the block.

```view
type: wordcount.count
```

## Settings

- **goal** (500): the words to reach; a block's own `goal` option overrides it.

## Needs

Nothing.

## Platforms

Linux works; Android works (`phone = true`); macOS, Windows and a server are untested.

## Tests

None yet.
