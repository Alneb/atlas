# Predictor

The likely rest of the word you are typing, and the next word when the vault is sure of it, shown faint after the
caret, learned from the vault.

- **Take it:** Tab, or → at the end of a line, takes all of it; Ctrl+→ one word. Typing the letters it shows keeps the
  rest; anything else typed goes on as if it were not there. Escape (vim's normal mode) drops it.
- **Learned from the vault:** the words of your notes and which words follow one or two others, counted when Atlas
  starts, per language (a note's `lang:` property, else guessed from its words). What the vault wrote only once is
  forgotten. Kept mail (notes with a `message_id`) and agent files are not learned from: they are not your writing.
- **When it shows:** a word's rest after two letters when the vault wrote it at least 3 times (Settings → Predictor →
  Uses before a guess); the next word only when the vault wrote it twice as often and most of the time after the same
  words (Next word, on by default). Only in a note's prose, right after typing: never in math, code, links, the front
  matter or a `.tex` file — snippets own math.

How: the helper (QuickJS, in the core) counts a chunk of notes per call; the page merges, prunes and predicts
(`ui/src/model.ts`, tested alone). Prose ranges, words and the language guess are the app's
`ui/src/lib/editor/prose.ts`, shared with Spelling.
